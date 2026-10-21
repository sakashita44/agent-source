#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { STATE_FILE, clientName } from "./vault-core.mjs";

const START_WAIT_MS = 90 * 1000;
const POLL_INTERVAL_MS = 2000;

const USAGE = [
    "Usage (every command accepts --client <name>: the name the user gave the agent, or its product name such as Claude Code):",
    "  bw-vault.mjs start",
    "  bw-vault.mjs status",
    "  bw-vault.mjs list [--search <text>]",
    "  bw-vault.mjs send gh-secret --item <name> --repo <owner/name> --name <SECRET_NAME> [--env <environment>] --reason <text>",
    "  bw-vault.mjs send ssh-sudo --item <name> --host <host> [--ssh <absolute path to ssh.exe>] --reason <text>",
    "  bw-vault.mjs send command --item <name> --reason <text> -- <command> [args...]",
    "  bw-vault.mjs generate --name <name> [--folder <folder>] [--length <16-128>] [--special] --reason <text>",
    "  bw-vault.mjs stop",
].join("\n");

const NOT_RUNNING = "The bitwarden-vault broker is not running. Run `bw-vault.mjs start` and ask the user to enter the master password in the window that opens.";

class BrokerUnavailableError extends Error {}

function readState() {
    if (!existsSync(STATE_FILE)) {
        throw new BrokerUnavailableError(NOT_RUNNING);
    }
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

export async function callBroker(path, body = {}) {
    const { port, token } = readState();
    let response;
    try {
        response = await fetch(`http://127.0.0.1:${port}${path}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
            redirect: "error",
        });
    } catch {
        throw new BrokerUnavailableError(NOT_RUNNING);
    }
    const result = await response.json();
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
    if (await isRunning()) {
        return { started: false, message: "The broker is already running and the vault is unlocked." };
    }
    if (process.platform !== "win32") {
        throw new Error("bitwarden-vault supports Windows only.");
    }
    launchBroker(client);
    const deadline = Date.now() + START_WAIT_MS;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (await isRunning()) {
            return { started: true, message: "The vault is unlocked." };
        }
    }
    return {
        started: true,
        message: "The broker window is open, but the vault is not unlocked yet. Ask the user to enter the master password in the bitwarden-vault window, then run `bw-vault.mjs status`.",
    };
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
        case "status":
            return callBroker("/status");
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
