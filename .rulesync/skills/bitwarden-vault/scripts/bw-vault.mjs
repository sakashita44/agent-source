#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { clientName, compareFields, idleMinutes, isProcessAlive, listDetails, readState } from "./vault-core.mjs";

const START_WAIT_MS = 90 * 1000;
const POLL_INTERVAL_MS = 2000;
const LAUNCH_GRACE_MS = 10 * 1000;

const USAGE = [
    "Usage (every command accepts --client <name>: the name the user gave the agent, or its product name such as Claude Code):",
    "  bw-vault.mjs start [--idle-minutes <15-720>]",
    "  bw-vault.mjs status",
    "  bw-vault.mjs list [--search <text>] [--with uris,username,dates,fields,flags,sshKey,card,passkeys]",
    "  bw-vault.mjs compare --field <fields> (--item <name> [--item <name>...] | --search <text> | --all)",
    "  bw-vault.mjs notes (--item <name> [--item <name>...] | --search <text> | --all) --reason <text>",
    "  bw-vault.mjs edit --item <name> [--rename <name>] [--notes <text> | --append-notes <text>] [--uris <json>] [--username <name>] [--folder <folder> | --no-folder] --reason <text>",
    "  bw-vault.mjs move --item <name> [--item <name>...] (--folder <folder> | --no-folder) --reason <text>",
    "  bw-vault.mjs folders",
    "  bw-vault.mjs folder-create --name <folder> --reason <text>",
    "  bw-vault.mjs report [--check-exposed]",
    "  bw-vault.mjs send gh-secret --item <name> --repo <owner/name> --name <SECRET_NAME> [--env <environment>] --reason <text>",
    "  bw-vault.mjs send ssh-sudo --item <name> --host <host> [--ssh <C:\\...\\ssh.exe>] --reason <text>",
    "  bw-vault.mjs send command --item <name> --reason <text> -- <command> [args...]",
    "  bw-vault.mjs generate --name <name> [--folder <folder>] [--username <name>] [--uris <json>] [--notes <text>] [--length <16-128>] [--uppercase | --no-uppercase] [--lowercase | --no-lowercase] [--number | --no-number] [--special] --reason <text>",
    "  bw-vault.mjs generate --name <name> [--folder <folder>] [--username <name>] [--uris <json>] [--notes <text>] --passphrase [--words <3-20>] [--separator <char>] [--capitalize] [--include-number] --reason <text>",
    "  bw-vault.mjs stop",
].join("\n");

const NOT_RUNNING = "The bitwarden-vault broker is not running. Run `bw-vault.mjs start` and ask the user to enter the master password in the window that opens.";

const NOT_UNLOCKED = "The bitwarden-vault window is open, but the vault is not unlocked yet. Ask the user to enter the master password in the bitwarden-vault window, then run `bw-vault.mjs status`.";

class BrokerUnavailableError extends Error {}

function liveBrokerState() {
    const state = readState();
    return state && isProcessAlive(state.pid) ? state : null;
}

function post(port, token, path, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const call = request({
            host: "127.0.0.1",
            port,
            path,
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
            },
        }, (response) => {
            const chunks = [];
            // 応答の受信中の切断は ClientRequest ではなく応答側の error として届く。
            response.on("error", (error) => reject(new Error(`Lost the connection to the bitwarden-vault broker (${error.code ?? error.message}). Ask the user to check the bitwarden-vault window.`)));
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
                } catch {
                    reject(new Error(`The bitwarden-vault broker returned an invalid response (HTTP ${response.statusCode}).`));
                }
            });
        });
        call.on("error", (error) => reject(error.code === "ECONNREFUSED"
            ? new BrokerUnavailableError(NOT_RUNNING)
            : new Error(`Lost the connection to the bitwarden-vault broker (${error.code ?? error.message}). Ask the user to check the bitwarden-vault window.`)));
        call.end(payload);
    });
}

export async function callBroker(path, body = {}) {
    const state = liveBrokerState();
    if (!state) {
        throw new BrokerUnavailableError(NOT_RUNNING);
    }
    if (!state.ready) {
        throw new BrokerUnavailableError(NOT_UNLOCKED);
    }
    const result = await post(state.port, state.token, path, body);
    if (!result.ok) {
        throw new Error(result.error);
    }
    return result;
}

function launchBroker(client, minutes) {
    const broker = join(dirname(fileURLToPath(import.meta.url)), "broker.mjs");
    const quote = (value) => `"${value}"`;
    // start は最初の引用符付き引数をウィンドウのタイトルとして解釈する。
    // Node.js による引数の再エスケープで cmd.exe の解釈が崩れるのを防ぐため、windowsVerbatimArguments で引用符をそのまま渡す。
    const child = spawn(
        "cmd.exe",
        ["/d", "/c", "start", quote("bitwarden-vault"), quote(process.execPath), quote(broker), quote(clientName(client)), quote(String(minutes))],
        { detached: true, stdio: "ignore", windowsVerbatimArguments: true },
    );
    child.unref();
}

async function isRunning() {
    try {
        await callBroker("/status");
        return true;
    } catch (error) {
        if (error instanceof BrokerUnavailableError) {
            return false;
        }
        throw error;
    }
}

async function start(client, requestedMinutes) {
    if (process.platform !== "win32") {
        throw new Error("bitwarden-vault supports Windows only.");
    }
    const minutes = idleMinutes(requestedMinutes);
    let existing = liveBrokerState();
    let stalePid = null;
    if (existing?.ready) {
        if (await isRunning()) {
            const { idleTimeoutMinutes } = await callBroker("/status");
            const message = idleTimeoutMinutes === minutes
                ? "The broker is already running and the vault is unlocked."
                : `The broker is already running with an idle timeout of ${idleTimeoutMinutes} minutes. To change it, run stop and then start again.`;
            return { started: false, idleTimeoutMinutes, message };
        }
        stalePid = existing.pid;
        existing = null;
    }
    if (!existing) {
        launchBroker(client, minutes);
    }
    const launchedAt = Date.now();
    let seen = Boolean(existing);
    while (Date.now() - launchedAt < START_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const current = liveBrokerState();
        const state = current?.pid === stalePid ? null : current;
        if (state) {
            seen = true;
            if (state.ready && await isRunning()) {
                return { started: !existing, message: "The vault is unlocked." };
            }
        } else if (seen || Date.now() - launchedAt > LAUNCH_GRACE_MS) {
            throw new Error("The bitwarden-vault window closed before the vault was unlocked. Ask the user what the window showed, then run start again.");
        }
    }
    return { started: !existing, message: NOT_UNLOCKED };
}

async function brokerStatus() {
    const state = liveBrokerState();
    if (!state) {
        return { unlocked: false, message: NOT_RUNNING };
    }
    if (!state.ready) {
        return { unlocked: false, message: NOT_UNLOCKED };
    }
    try {
        const { ok, ...status } = await callBroker("/status");
        return status;
    } catch (error) {
        if (error instanceof BrokerUnavailableError) {
            return { unlocked: false, message: error.message };
        }
        throw error;
    }
}

// bw status は秘密値もセッションキーも出力しないため、仲介プロセスを介さずに実行する。
function bitwardenStatus() {
    const result = spawnSync("bw", ["status"], {
        encoding: "utf8",
        env: { ...process.env, BW_NOINTERACTION: "true" },
        windowsHide: true,
    });
    if (result.error || result.status !== 0) {
        return { error: `bw status failed (${result.error?.code ?? `exit code ${result.status}`}). Check that the native bw.exe is on PATH.` };
    }
    try {
        const { serverUrl, lastSync, userEmail } = JSON.parse(result.stdout);
        return { serverUrl, lastSync, userEmail };
    } catch {
        return { error: "bw status returned an invalid response." };
    }
}

function singleItem(items) {
    if (!Array.isArray(items) || items.length !== 1) {
        throw new Error(`Give exactly one --item.\n${USAGE}`);
    }
    return items[0];
}

function toggleOption(values, name) {
    const positive = values[name];
    const negative = values[`no-${name}`];
    if (positive !== undefined && negative !== undefined) {
        throw new Error(`Give either --${name} or --no-${name}, not both.\n${USAGE}`);
    }
    return negative === true ? false : positive;
}

function parse(argv) {
    let parsed;
    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                search: { type: "string" },
                with: { type: "string" },
                field: { type: "string", multiple: true },
                all: { type: "boolean" },
                item: { type: "string", multiple: true },
                rename: { type: "string" },
                notes: { type: "string" },
                "append-notes": { type: "string" },
                uris: { type: "string" },
                "check-exposed": { type: "boolean" },
                repo: { type: "string" },
                name: { type: "string" },
                env: { type: "string" },
                host: { type: "string" },
                ssh: { type: "string" },
                folder: { type: "string" },
                "no-folder": { type: "boolean" },
                username: { type: "string" },
                length: { type: "string" },
                uppercase: { type: "boolean" },
                "no-uppercase": { type: "boolean" },
                lowercase: { type: "boolean" },
                "no-lowercase": { type: "boolean" },
                number: { type: "boolean" },
                "no-number": { type: "boolean" },
                special: { type: "boolean" },
                passphrase: { type: "boolean" },
                words: { type: "string" },
                separator: { type: "string" },
                capitalize: { type: "boolean" },
                "include-number": { type: "boolean" },
                reason: { type: "string" },
                client: { type: "string" },
                "idle-minutes": { type: "string" },
            },
        });
    } catch (error) {
        throw new Error(`${error.message}\n${USAGE}`);
    }
    return parsed;
}

export async function run(argv) {
    const separator = argv.indexOf("--");
    const command = separator === -1 ? [] : argv.slice(separator + 1);
    const { positionals, values } = parse(separator === -1 ? argv : argv.slice(0, separator));
    const [action, target] = positionals;
    const client = values.client;

    switch (action) {
        case "start":
            return start(client, values["idle-minutes"]);
        case "status":
            return { ...(await brokerStatus()), bitwarden: bitwardenStatus() };
        case "list":
            return callBroker("/list", { search: values.search, details: listDetails(values.with).join(","), client });
        case "compare":
            return callBroker("/compare", {
                items: values.item,
                search: values.search,
                all: values.all,
                field: compareFields(values.field),
                client,
            });
        case "notes":
            return callBroker("/notes", { items: values.item, search: values.search, all: values.all, reason: values.reason, client });
        case "edit":
            return callBroker("/edit", {
                item: singleItem(values.item),
                rename: values.rename,
                notes: values.notes,
                appendNotes: values["append-notes"],
                uris: values.uris,
                username: values.username,
                folder: values.folder,
                noFolder: values["no-folder"],
                reason: values.reason,
                client,
            });
        case "move":
            return callBroker("/move", { items: values.item, folder: values.folder, noFolder: values["no-folder"], reason: values.reason, client });
        case "folders":
            return callBroker("/folders", { client });
        case "folder-create":
            return callBroker("/folder-create", { name: values.name, reason: values.reason, client });
        case "report":
            return callBroker("/report", { checkExposed: values["check-exposed"] ?? false, client });
        case "send": {
            const options = target === "gh-secret"
                ? { repo: values.repo, name: values.name, env: values.env }
                : { host: values.host, ssh: values.ssh };
            return callBroker("/send", { item: singleItem(values.item), target, options, command, reason: values.reason, client });
        }
        case "generate":
            return callBroker("/generate", {
                name: values.name,
                folder: values.folder,
                username: values.username,
                uris: values.uris,
                notes: values.notes,
                length: values.length,
                uppercase: toggleOption(values, "uppercase"),
                lowercase: toggleOption(values, "lowercase"),
                number: toggleOption(values, "number"),
                special: values.special,
                passphrase: values.passphrase,
                words: values.words,
                separator: values.separator,
                capitalize: values.capitalize,
                includeNumber: values["include-number"],
                reason: values.reason,
                client,
            });
        case "stop":
            return callBroker("/stop", { client });
        default:
            throw new Error(USAGE);
    }
}

function isDirectRun() {
    if (!process.argv[1]) {
        return false;
    }
    try {
        return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
}

if (isDirectRun()) {
    run(process.argv.slice(2)).then(
        (result) => {
            const { ok, ...rest } = result;
            process.stdout.write(`${JSON.stringify(rest, null, 2)}\n`);
        },
        (error) => {
            process.stderr.write(`${error.message}\n`);
            process.exit(1);
        },
    );
}
