#!/usr/bin/env node
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { clientName, isProcessAlive, readState } from "./vault-core.mjs";

const START_WAIT_MS = 90 * 1000;
const POLL_INTERVAL_MS = 2000;
const LAUNCH_GRACE_MS = 10 * 1000;

const USAGE = [
    "Usage (every command accepts --client <name>: the name the user gave the agent, or its product name such as Claude Code):",
    "  bw-vault.mjs start",
    "  bw-vault.mjs status",
    "  bw-vault.mjs list [--search <text>]",
    "  bw-vault.mjs send gh-secret --item <name> --repo <owner/name> --name <SECRET_NAME> [--env <environment>] --reason <text>",
    "  bw-vault.mjs send ssh-sudo --item <name> --host <host> [--ssh <C:\\...\\ssh.exe>] --reason <text>",
    "  bw-vault.mjs send command --item <name> --reason <text> -- <command> [args...]",
    "  bw-vault.mjs generate --name <name> [--folder <folder>] [--length <16-128>] [--special] --reason <text>",
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

function launchBroker(client) {
    const broker = join(dirname(fileURLToPath(import.meta.url)), "broker.mjs");
    const quote = (value) => `"${value}"`;
    // start は最初の引用符付き引数をウィンドウのタイトルとして解釈する。
    // Node.js による引数の再エスケープで cmd.exe の解釈が崩れるのを防ぐため、windowsVerbatimArguments で引用符をそのまま渡す。
    const child = spawn(
        "cmd.exe",
        ["/d", "/c", "start", quote("bitwarden-vault"), quote(process.execPath), quote(broker), quote(clientName(client))],
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

async function start(client) {
    if (process.platform !== "win32") {
        throw new Error("bitwarden-vault supports Windows only.");
    }
    let existing = liveBrokerState();
    let stalePid = null;
    if (existing?.ready) {
        if (await isRunning()) {
            return { started: false, message: "The broker is already running and the vault is unlocked." };
        }
        stalePid = existing.pid;
        existing = null;
    }
    if (!existing) {
        launchBroker(client);
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

function parse(argv) {
    let parsed;
    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                search: { type: "string" },
                item: { type: "string" },
                repo: { type: "string" },
                name: { type: "string" },
                env: { type: "string" },
                host: { type: "string" },
                ssh: { type: "string" },
                folder: { type: "string" },
                length: { type: "string" },
                special: { type: "boolean" },
                reason: { type: "string" },
                client: { type: "string" },
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
            return start(client);
        case "status": {
            const state = liveBrokerState();
            if (state && !state.ready) {
                return { unlocked: false, message: NOT_UNLOCKED };
            }
            return callBroker("/status");
        }
        case "list":
            return callBroker("/list", { search: values.search, client });
        case "send": {
            const options = target === "gh-secret"
                ? { repo: values.repo, name: values.name, env: values.env }
                : { host: values.host, ssh: values.ssh };
            return callBroker("/send", { item: values.item, target, options, command, reason: values.reason, client });
        }
        case "generate":
            return callBroker("/generate", {
                name: values.name,
                folder: values.folder,
                length: values.length ?? 32,
                special: values.special ?? false,
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
