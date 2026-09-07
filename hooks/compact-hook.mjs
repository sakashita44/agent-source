#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// イベントの組み合わせと、注入を一度に保つhandshakeは
// https://github.com/u-ichi/compact-plus を参照した。実装は共有していない。
// Claude CodeはSessionStartをPostCompactより先に配送し、Codexは逆になる。
// どちらの順でも一度だけ注入するため、markerと注入済み印を相互に消費する。
const DEFAULT_DIR = join(homedir(), ".agent-source", "state", "compact");
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function stateKey(input) {
    // Codexのsession_idはroot threadと全子孫で共有される。subagentにはagent_idが付くため、
    // agent_idを優先しないとsubagentのstateが親のstateを上書きする。
    const raw = input.agent_id ?? input.agentId ?? input.session_id ?? input.sessionId ?? input.cwd ?? process.cwd();
    return String(raw).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
}

export function buildState(input, now) {
    return {
        key: stateKey(input),
        cwd: input.cwd ?? null,
        transcript: input.transcript_path ?? input.transcriptPath ?? null,
        compactedAt: new Date(now).toISOString(),
    };
}

export function buildInjection(state) {
    const lines = [
        "直前に会話の圧縮が起きた。要約は、試したことは残すが、なぜ却下したかを持ち帰らない。",
        "続きの作業へ入る前に次を行うこと。",
        "- 作業中のファイル、計画、進捗の記録を読み直す",
        "- 圧縮前に確定した判断と、却下した案を確認する",
        "- 確認できない前提の上に判断を重ねず、分からない点はユーザーへ示す",
    ];
    if (state?.cwd) {
        lines.push(`- 圧縮時の作業ディレクトリ: ${state.cwd}`);
    }
    if (state?.transcript) {
        lines.push(`- 圧縮前の記録: ${state.transcript}`);
    }
    if (state?.compactedAt) {
        lines.push(`- 圧縮の時刻: ${state.compactedAt}`);
    }
    return lines.join("\n");
}

export function removeExpired(directory, now, { readdir = readdirSync, stat = statSync, remove = rmSync } = {}) {
    let removed = 0;
    for (const name of readdir(directory)) {
        const path = join(directory, name);
        try {
            if (now - stat(path).mtimeMs > EXPIRY_MS) {
                remove(path);
                removed += 1;
            }
        } catch {
            // 掃除の失敗はhookの目的を妨げない。
        }
    }
    return removed;
}

export async function readInput(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) {
        return {};
    }
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

const statePath = (dir, key) => join(dir, `${key}.json`);
const markerPath = (dir, key) => join(dir, `${key}.marker`);
const injectedPath = (dir, key) => join(dir, `${key}.injected`);

function readState(dir, key) {
    try {
        return JSON.parse(readFileSync(statePath(dir, key), "utf8"));
    } catch {
        return null;
    }
}

function claim(path) {
    // 読む前に退避することで、並行実行では退避に成功した側だけが注入する。
    const claimed = `${path}.claimed`;
    try {
        renameSync(path, claimed);
    } catch {
        return false;
    }
    try {
        rmSync(claimed);
    } catch {
        // 消せなくても消費済みの事実は変わらない。
    }
    return true;
}

export function isInjectedMarkFresh(dir, key, { stat = statSync } = {}) {
    try {
        // PostCompactが落ちて印が残った場合、次の圧縮で書かれるstateのほうが新しくなる。
        // 印がstateより古ければ失効とみなし、注入を沈黙させない。
        return stat(injectedPath(dir, key)).mtimeMs >= stat(statePath(dir, key)).mtimeMs;
    } catch {
        return false;
    }
}

export function save(input, now, dir = DEFAULT_DIR) {
    mkdirSync(dir, { recursive: true });
    const state = buildState(input, now);
    writeFileSync(statePath(dir, state.key), JSON.stringify(state), "utf8");
    removeExpired(dir, now);
    return state;
}

export function mark(input, dir = DEFAULT_DIR) {
    mkdirSync(dir, { recursive: true });
    const key = stateKey(input);
    if (isInjectedMarkFresh(dir, key)) {
        // 印は消さない。次の圧縮でstateが書き直されると失効するため、
        // 残しておくほうが同じ圧縮での二重注入を防げる。
        return "kept-injected-mark";
    }
    writeFileSync(markerPath(dir, key), "", "utf8");
    return "wrote-marker";
}

export function restore(input, dir = DEFAULT_DIR) {
    const key = stateKey(input);
    const state = readState(dir, key);
    if (!state) {
        return null;
    }
    if (existsSync(markerPath(dir, key))) {
        if (!claim(markerPath(dir, key))) {
            return null;
        }
        // markerを消費した経路でも印を残す。SessionStartが再送された場合に二重注入しない。
        try {
            writeFileSync(injectedPath(dir, key), "", "utf8");
        } catch {
            // 印を残せなくても、markerは消費済みである。
        }
        return buildInjection(state);
    }
    if (isInjectedMarkFresh(dir, key)) {
        return null;
    }
    try {
        mkdirSync(dir, { recursive: true });
        // 排他的な作成にすることで、同時に走ったrestoreのうち1つだけが注入する。
        writeFileSync(injectedPath(dir, key), "", { encoding: "utf8", flag: "wx" });
    } catch (error) {
        if (error?.code !== "EEXIST") {
            return null;
        }
        // 失効した印が残っている場合は、置き換えを試みた側だけが注入する。
        try {
            rmSync(injectedPath(dir, key));
            writeFileSync(injectedPath(dir, key), "", { encoding: "utf8", flag: "wx" });
        } catch {
            return null;
        }
    }
    return buildInjection(state);
}

export function inject(input, dir = DEFAULT_DIR) {
    const key = stateKey(input);
    if (!existsSync(markerPath(dir, key)) || !claim(markerPath(dir, key))) {
        return null;
    }
    return buildInjection(readState(dir, key));
}

async function main() {
    const mode = process.argv[2];
    const input = await readInput(process.stdin);

    if (mode === "save") {
        save(input, Date.now());
        return;
    }
    if (mode === "mark") {
        mark(input);
        return;
    }
    if (mode === "restore" || mode === "inject") {
        const text = mode === "restore" ? restore(input) : inject(input);
        if (text) {
            process.stdout.write(`${text}\n`);
        }
        return;
    }

    process.stderr.write("Usage: compact-hook.mjs save|mark|restore|inject\n");
    process.exitCode = 1;
}

if (process.argv[1]?.endsWith("compact-hook.mjs")) {
    main().catch(() => {
        // 書き込みや読み取りに失敗しても、エージェントの動作を止めない。
        process.exitCode = 0;
    });
}
