#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { StringDecoder } from "node:string_decoder";
import {
    IDLE_TIMEOUT_MS,
    STATE_FILE,
    assertItemName,
    assertReason,
    buildArbitraryCommand,
    buildFixedCommand,
    buildLoginItem,
    canConnect,
    clientName,
    displaySafe,
    displaySafeOutput,
    findFolderId,
    findItemByName,
    generateArgs,
    isProcessAlive,
    passwordOf,
    readState,
    summarizeItems,
} from "./vault-core.mjs";

const MAX_BODY_BYTES = 64 * 1024;
const COMMAND_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_UNLOCK_ATTEMPTS = 3;
const TYPE_AHEAD_WINDOW_MS = 300;
const CLOSE_DELAY_MS = 3000;
const IMMEDIATE_ROUTES = new Set(["/status", "/stop"]);
const CANCELLED_MESSAGE = "リクエストが取り消されたか、終了の処理が始まったため、実行しませんでした。";

const token = randomBytes(32).toString("hex");
const shutdownController = new AbortController();
const rememberedApprovals = new Set();
let session = null;
let server = null;
let idleTimer = null;
let shuttingDown = false;
let queue = Promise.resolve();
let activeWork = Promise.resolve();
let workRunning = false;

function say(...lines) {
    process.stdout.write(lines.map((line) => `${displaySafe(line)}\n`).join(""));
}

function section(title) {
    const time = new Date().toLocaleTimeString("ja-JP", { hour12: false });
    say("", "─".repeat(60), `[${time}] ${title}`, "");
}

function sayDetails(rows) {
    say(...rows.map(([label, value]) => `  ${label}: ${value}`));
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function readHidden(prompt) {
    return new Promise((resolve, reject) => {
        const stdin = process.stdin;
        process.stdout.write(prompt);
        stdin.setRawMode(true);
        stdin.setEncoding("utf8");
        stdin.resume();
        let value = "";
        const finish = (callback) => {
            stdin.off("data", onData);
            stdin.setRawMode(false);
            stdin.pause();
            process.stdout.write("\n");
            callback();
        };
        const onData = (chunk) => {
            for (const char of chunk) {
                if (char === "\r" || char === "\n") {
                    finish(() => resolve(value));
                    return;
                }
                if (char === "\u0003") {
                    finish(() => reject(new Error("Cancelled")));
                    return;
                }
                if (char === "\b" || char === "\u007f") {
                    value = value.slice(0, -1);
                } else {
                    value += char;
                }
            }
        };
        stdin.on("data", onData);
    });
}

function readLine(prompt, signal) {
    return new Promise((resolve) => {
        const stdin = process.stdin;
        if (signal?.aborted) {
            resolve(null);
            return;
        }
        process.stdout.write(prompt);
        const shownAt = Date.now();
        let value = "";
        const finish = (answer) => {
            stdin.off("data", onData);
            signal?.removeEventListener("abort", onAbort);
            stdin.setRawMode(false);
            stdin.pause();
            process.stdout.write("\n");
            resolve(answer);
        };
        // コンソールの入力バッファに残った先行入力は、表示の直後に届く。直後の入力を無視し、利用者が表示を見る前の承認を防ぐ。
        const onData = (chunk) => {
            // 矢印キーなどの操作は、端末から ESC で始まるシーケンスとして届くため、入力に含めない。
            if (Date.now() - shownAt < TYPE_AHEAD_WINDOW_MS || chunk.startsWith("\u001b")) {
                return;
            }
            for (const char of chunk) {
                if (char === "\r" || char === "\n") {
                    finish(value.trim());
                    return;
                }
                // raw mode では Ctrl+C が SIGINT にならず \u0003 として届く。
                if (char === "\u0003") {
                    finish("");
                    return;
                }
                if (char === "\b" || char === "\u007f") {
                    if (value.length > 0) {
                        value = value.slice(0, -1);
                        process.stdout.write("\b \b");
                    }
                } else if (!/[\p{Cc}\p{Cf}]/u.test(char)) {
                    value += char;
                    process.stdout.write(char);
                }
            }
        };
        const onAbort = () => finish(null);
        stdin.setRawMode(true);
        stdin.setEncoding("utf8");
        stdin.on("data", onData);
        signal?.addEventListener("abort", onAbort, { once: true });
        stdin.resume();
    });
}

function bwEnv(extra = {}) {
    // ロック状態の bw はマスターパスワードの入力を待って停止するため、BW_NOINTERACTION を指定し、入力を求めずに失敗させる。
    const env = { ...process.env, BW_NOINTERACTION: "true", ...extra };
    if (session) {
        env.BW_SESSION = session;
    }
    return env;
}

function runBw(args, { input, extraEnv } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn("bw", args, { env: bwEnv(extraEnv), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        const stdout = [];
        const stderr = [];
        child.stdout.on("data", (chunk) => stdout.push(chunk));
        child.stderr.on("data", (chunk) => stderr.push(chunk));
        child.on("error", reject);
        child.on("close", (code) => resolve({
            code,
            stdout: Buffer.concat(stdout).toString("utf8"),
            stderr: Buffer.concat(stderr).toString("utf8").trim(),
        }));
        // 子プロセスが標準入力をすべて読み取る前に終了すると EPIPE が発生する。処理の成否は終了コードで判定する。
        child.stdin.on("error", () => {});
        child.stdin.end(input ?? "");
    });
}

async function checkedBw(args, options) {
    const result = await runBw(args, options);
    if (result.code !== 0) {
        say(`bw ${args[0]} が終了コード ${result.code} で失敗しました。bw の出力: ${result.stderr || "(なし)"}`);
        throw new Error(`bw ${args[0]} failed with exit code ${result.code}. See the bitwarden-vault window.`);
    }
    return result.stdout;
}

async function loadVault() {
    await checkedBw(["sync"]);
    const [items, folders] = await Promise.all([checkedBw(["list", "items"]), checkedBw(["list", "folders"])]);
    return { items: JSON.parse(items), folders: JSON.parse(folders) };
}

async function track(work) {
    workRunning = true;
    activeWork = work.catch(() => {});
    try {
        return await work;
    } finally {
        workRunning = false;
    }
}

function cancelRequest() {
    say(CANCELLED_MESSAGE);
    return { approved: false, cancelled: true };
}

async function confirm(question, signal, { strict = false, rememberable = false } = {}) {
    say("");
    if (strict) {
        say(question, "実行する場合は yes と入力してください。それ以外の入力では実行しません。");
    } else if (rememberable) {
        say(
            `${question} [y/N/a]`,
            "  y: 今回だけ実行する",
            "  a: 実行し、このウィンドウを閉じるまで、同じ項目と送信先の組み合わせを自動で承認する",
            "  N: 実行しない (既定)",
        );
    } else {
        say(`${question} [y/N]`);
    }
    const answer = await readLine("> ", signal);
    if (answer === null || signal.aborted) {
        say("", CANCELLED_MESSAGE);
        return { approved: false, cancelled: true };
    }
    resetIdleTimer();
    const remember = rememberable && answer.toLowerCase() === "a";
    const approved = strict ? answer === "yes" : remember || /^y(es)?$/i.test(answer);
    say("");
    if (!approved) {
        say("実行しませんでした。");
    } else if (remember) {
        say("承認しました。このウィンドウを閉じるまで、同じ項目と送信先の組み合わせは自動で承認されます。");
    }
    return { approved, remember, cancelled: false };
}

function runWithSecret({ file, args, appendNewline }, secret) {
    return new Promise((resolve) => {
        say("--- コマンドの出力 (ここから) ---");
        const child = spawn(file, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        // 子プロセスの出力に含まれる端末の制御シーケンスで画面を書き換えられないよう、受け取って無害化してから表示する。
        // 受信の区切りで UTF-8 の複数バイトの文字が分断されるため、StringDecoder で復元する。
        for (const stream of [child.stdout, child.stderr]) {
            const decoder = new StringDecoder("utf8");
            stream.on("data", (chunk) => process.stdout.write(displaySafeOutput(decoder.write(chunk))));
            stream.on("end", () => process.stdout.write(displaySafeOutput(decoder.end())));
        }
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, COMMAND_TIMEOUT_MS);
        let settled = false;
        const settle = (code, message) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            say("--- コマンドの出力 (ここまで) ---", "");
            if (message) {
                say(message);
            }
            resolve(code);
        };
        child.on("error", (error) => settle(null, `コマンドを起動できませんでした (${error.message})。実行ファイルのパスを確認してください。`));
        child.on("close", (code) => settle(
            timedOut ? null : code,
            timedOut ? `コマンドが ${COMMAND_TIMEOUT_MS / 60000} 分以内に終了しなかったため、停止しました。` : undefined,
        ));
        // 子プロセスが標準入力をすべて読み取る前に終了すると EPIPE が発生する。処理の成否は終了コードで判定する。
        child.stdin.on("error", () => {});
        child.stdin.end(appendNewline ? `${secret}\n` : secret);
    });
}

async function handleList({ search, client }) {
    const { items, folders } = await loadVault();
    const summaries = summarizeItems(items, folders);
    const filtered = typeof search === "string" && search.length > 0
        ? summaries.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
        : summaries;
    const condition = filtered === summaries ? "" : `検索語「${search}」に一致する`;
    say(`${condition}項目 ${filtered.length} 件の名前、フォルダ、種別を ${clientName(client)} に返しました。秘密値を含まないため、承認なしで実行しました。`);
    return { items: filtered };
}

async function handleSend({ item: itemName, target, options = {}, command, reason, client }, signal) {
    const requester = clientName(client);
    const explanation = assertReason(reason);
    const arbitrary = target === "command";
    const plan = arbitrary ? buildArbitraryCommand(command) : buildFixedCommand(target, options);
    const { items } = await loadVault();
    if (signal.aborted) {
        return cancelRequest();
    }
    const item = findItemByName(items, itemName);
    const secret = passwordOf(item);

    if (arbitrary) {
        say(
            `注意: ${requester} が組み立てたコマンドに秘密値を渡します。`,
            "悪意のあるコマンドや誤ったコマンドを実行すると、秘密値がファイルやネットワークへ漏れるおそれがあります。",
            "コマンド全体を確認してから承認してください。",
            "秘密値は、コマンドの起動後に標準入力として渡されます (末尾に改行を付けます)。",
            "",
        );
    }
    sayDetails([["項目", item.name], ...plan.summary, [`${requester} の説明`, explanation]]);

    const approvalKey = arbitrary ? null : JSON.stringify([item.id, plan.file, ...plan.args]);
    if (approvalKey !== null && rememberedApprovals.has(approvalKey)) {
        say("", "この項目と送信先の組み合わせは承認済みのため、自動で承認しました。");
    } else {
        const { approved, remember, cancelled } = await confirm(plan.question, signal, { strict: arbitrary, rememberable: !arbitrary });
        if (!approved) {
            return { approved: false, cancelled };
        }
        if (remember) {
            rememberedApprovals.add(approvalKey);
        }
    }
    if (signal.aborted) {
        return cancelRequest();
    }

    const exitCode = await track(runWithSecret(plan, secret));
    if (exitCode === 0) {
        say(plan.done);
    } else if (exitCode !== null) {
        say(`${plan.action}に失敗しました (終了コード ${exitCode})。`);
    }
    return { approved: true, exitCode };
}

async function handleGenerate({ name, folder, length = 32, special = false, reason, client }, signal) {
    const explanation = assertReason(reason);
    assertItemName(name);
    const args = generateArgs(length, special);
    const { items, folders } = await loadVault();
    if (signal.aborted) {
        return cancelRequest();
    }
    if (items.some((item) => !item.deletedDate && item.name === name)) {
        throw new Error(`An item named ${JSON.stringify(name)} already exists.`);
    }
    const folderId = findFolderId(folders, folder);

    sayDetails([
        ["項目名", name],
        ["フォルダ", folder ?? "(なし)"],
        ["生成する値", `${args.slice(1).join(" ")} (bw generate のオプション)`],
        [`${clientName(client)} の説明`, explanation],
    ]);
    const { approved, cancelled } = await confirm(`新しい項目 ${name} を作成し、生成した値を保存しますか？`, signal);
    if (!approved) {
        return { approved: false, cancelled };
    }
    if (signal.aborted) {
        return cancelRequest();
    }

    await track((async () => {
        const password = (await checkedBw(args)).trim();
        // bw create は Base64 でエンコードされた JSON を入力として受け取る。
        const encoded = Buffer.from(JSON.stringify(buildLoginItem({ name, folderId, password }))).toString("base64");
        await checkedBw(["create", "item"], { input: encoded });
    })());
    say(`項目 ${name} を作成し、生成した値をパスワードとして保存しました。値は ${clientName(client)} に返していません。`);
    return { approved: true, name };
}

const ROUTES = {
    "/status": async () => ({ unlocked: true, idleTimeoutMinutes: IDLE_TIMEOUT_MS / 60000 }),
    "/list": handleList,
    "/send": handleSend,
    "/generate": handleGenerate,
    "/stop": async ({ client }) => {
        setImmediate(() => shutdown(`${clientName(client)} から終了のリクエストを受けたため`));
        return { stopping: true };
    },
};

const ROUTE_TITLES = {
    "/list": "項目一覧の取得リクエスト",
    "/send": "秘密値の送信リクエスト",
    "/generate": "秘密値の生成・保存リクエスト",
};

function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => shutdown(`${IDLE_TIMEOUT_MS / 60000} 分間操作がなかったため`), IDLE_TIMEOUT_MS);
}

function isAuthorized(request, port) {
    const expected = Buffer.from(`Bearer ${token}`);
    const actual = Buffer.from(request.headers.authorization ?? "");
    // ブラウザは Web ページからの要求に Origin ヘッダーを付与する。Origin 付きの要求や、Host ヘッダーが待ち受けアドレスと異なる要求（DNS rebinding）を拒否する。
    return request.headers.origin === undefined
        && request.headers.host === `127.0.0.1:${port}`
        && actual.length === expected.length
        && timingSafeEqual(actual, expected);
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        request.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error("Request body is too large."));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => {
            try {
                resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch {
                reject(new Error("Request body is not valid JSON."));
            }
        });
        request.on("error", reject);
        request.on("close", () => reject(new Error("The request was cancelled.")));
    });
}

function respond(response, status, body) {
    if (response.destroyed) {
        return;
    }
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
}

function handleRequest(request, response, port) {
    if (!isAuthorized(request, port)) {
        respond(response, 403, { ok: false, error: "Forbidden." });
        return;
    }
    const route = ROUTES[request.url];
    if (request.method !== "POST" || !route) {
        respond(response, 404, { ok: false, error: "Not found." });
        return;
    }
    // ServerResponse の close は正常に応答し終えたときにも発生するため、応答を書き終える前の close だけを切断とみなす。
    const disconnected = new AbortController();
    response.on("close", () => {
        if (!response.writableEnded) {
            disconnected.abort();
        }
    });
    const signal = AbortSignal.any([disconnected.signal, shutdownController.signal]);
    const body = readBody(request);
    body.catch(() => {});
    const title = ROUTE_TITLES[request.url];
    const execute = async () => {
        const payload = await body;
        if (signal.aborted) {
            throw new Error("The request was cancelled.");
        }
        if (title) {
            section(`${title} (${clientName(payload.client)})`);
        }
        return route(payload, signal);
    };
    let task;
    if (IMMEDIATE_ROUTES.has(request.url)) {
        task = execute();
    } else {
        task = queue.then(execute);
        queue = task.catch(() => {});
    }
    task.then(
        (result) => respond(response, 200, { ok: true, ...result }),
        (error) => {
            if (signal.aborted) {
                respond(response, 200, { ok: true, approved: false, cancelled: true });
                return;
            }
            say(`リクエストを処理できませんでした。理由: ${error.message}`);
            respond(response, 400, { ok: false, error: error.message });
        },
    );
}

function createStateFile() {
    try {
        writeFileSync(STATE_FILE, JSON.stringify({ pid: process.pid, ready: false }), { flag: "wx", mode: 0o600 });
        return true;
    } catch (error) {
        if (error.code === "EEXIST") {
            return false;
        }
        throw error;
    }
}

async function isStale(state) {
    if (!state || !isProcessAlive(state.pid)) {
        return true;
    }
    return state.ready === true && !(await canConnect(state.port));
}

async function claimStateFile() {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    if (createStateFile()) {
        return true;
    }
    if (!(await isStale(readState()))) {
        return false;
    }
    rmSync(STATE_FILE, { force: true });
    return createStateFile();
}

function removeOwnStateFile() {
    if (readState()?.pid === process.pid) {
        rmSync(STATE_FILE, { force: true });
    }
}

function lockAndClose(reason) {
    if (session) {
        const result = spawnSync("bw", ["lock"], { env: bwEnv(), stdio: "ignore", windowsHide: true });
        session = null;
        say(result.status === 0
            ? `${reason}、金庫をロックしました。`
            : `${reason}、終了します。ただし、金庫をロックできませんでした (bw lock が失敗しました)。ターミナルで bw lock を実行してください。`);
    } else {
        say(`${reason}、終了します。`);
    }
    removeOwnStateFile();
    say(workRunning ? "実行中のコマンドが終わってから、このウィンドウを閉じます。" : "このウィンドウは 3 秒後に閉じます。");
    // stop の HTTP 応答を返し終え、利用者がウィンドウの最終表示を確認できるまで待機してから終了する。
    activeWork.then(() => delay(CLOSE_DELAY_MS)).then(() => process.exit(0));
}

function shutdown(reason, { immediate = false } = {}) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    shutdownController.abort();
    clearTimeout(idleTimer);
    server?.close();
    section("終了");
    if (immediate || !workRunning) {
        lockAndClose(reason);
        return;
    }
    say("実行中の処理が終わってから、金庫をロックして終了します。");
    activeWork.then(() => lockAndClose(reason));
}

async function unlock() {
    const status = JSON.parse(await checkedBw(["status"]));
    if (status.status === "unauthenticated") {
        say(
            "Bitwarden にログインしていないため、金庫のロックを解除できません。",
            "ターミナルで bw login を実行してから、このウィンドウをもう一度起動してください。",
        );
        return false;
    }
    for (let attempt = 1; attempt <= MAX_UNLOCK_ATTEMPTS; attempt += 1) {
        const password = await readHidden("Bitwarden のマスターパスワード: ");
        // 引数で指定するとプロセス一覧に露出するため、--passwordenv で環境変数から渡す。
        const result = await runBw(["unlock", "--passwordenv", "BITWARDEN_VAULT_MASTER_PASSWORD", "--raw"], {
            extraEnv: { BITWARDEN_VAULT_MASTER_PASSWORD: password },
        });
        if (result.code === 0 && result.stdout.trim().length > 0) {
            session = result.stdout.trim();
            return true;
        }
        say(`金庫のロックを解除できませんでした (${attempt}/${MAX_UNLOCK_ATTEMPTS} 回目)。マスターパスワードが正しいか確認してください。`, "");
    }
    say(`${MAX_UNLOCK_ATTEMPTS} 回続けてロックを解除できなかったため、終了します。`);
    return false;
}

async function closeAfterEnter() {
    await readLine("Enter キーを押すと、このウィンドウを閉じます。");
    process.exit(1);
}

async function main() {
    process.title = "bitwarden-vault";
    say(
        `${clientName(process.argv[2])} がこのウィンドウを起動しました。`,
        "このウィンドウで、Bitwarden の金庫のロック解除と、秘密値の送信や保存の承認を行います。",
        "",
    );
    if (!(await claimStateFile())) {
        say("別の bitwarden-vault のウィンドウが既に起動しているため、終了します。既に開いているウィンドウを使ってください。");
        await closeAfterEnter();
    }
    if (!(await unlock())) {
        removeOwnStateFile();
        await closeAfterEnter();
    }

    server = createServer((request, response) => handleRequest(request, response, server.address().port));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    // 付属スクリプトと他の仲介プロセスが状態ファイルを読むため、書き込み途中の内容を読まれないよう、別名で書いてから置き換える。
    const pending = `${STATE_FILE}.${process.pid}.tmp`;
    writeFileSync(pending, JSON.stringify({ port, token, pid: process.pid, ready: true }), { mode: 0o600 });
    renameSync(pending, STATE_FILE);
    resetIdleTimer();
    say(
        "",
        "金庫のロックを解除しました。リクエストを待っています。",
        `${IDLE_TIMEOUT_MS / 60000} 分間操作がない場合は、金庫がロックされ、このウィンドウが閉じます。このウィンドウを閉じた場合も、金庫がロックされます。`,
    );
}

for (const signal of ["SIGINT", "SIGHUP", "SIGBREAK", "SIGTERM"]) {
    process.on(signal, () => shutdown("終了の操作を受けたため", { immediate: true }));
}

main().catch((error) => {
    say(`仲介プロセスを開始できませんでした。理由: ${error.message}`);
    shutdown("エラーが発生したため", { immediate: true });
});
