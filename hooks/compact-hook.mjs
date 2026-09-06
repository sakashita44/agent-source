#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STATE_DIR = join(homedir(), ".agent-source", "state", "compact");
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function stateKey(input) {
    // Claude Codeはsession_idを渡す。渡さない実行環境ではcwdで代用するため、
    // 同じディレクトリで並行するセッションは互いの状態を上書きする。
    const raw = input.session_id ?? input.sessionId ?? input.cwd ?? "unknown";
    return String(raw).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
}

export function buildState(input, now) {
    return {
        key: stateKey(input),
        cwd: input.cwd ?? null,
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

function statePath(key) {
    return join(STATE_DIR, `${key}.json`);
}

function markerPath(key) {
    return join(STATE_DIR, `${key}.marker`);
}

function save(input, now) {
    mkdirSync(STATE_DIR, { recursive: true });
    const state = buildState(input, now);
    writeFileSync(statePath(state.key), JSON.stringify(state), "utf8");
    removeExpired(STATE_DIR, now);
}

function mark(input) {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(markerPath(stateKey(input)), "", "utf8");
}

function inject(input) {
    const key = stateKey(input);
    const marker = markerPath(key);
    if (!existsSync(marker)) {
        return null;
    }

    // 一度しか注入しないよう、読む前にmarkerを退避する。並行実行では
    // renameに成功した側だけが注入する。
    const claimed = `${marker}.claimed`;
    try {
        renameSync(marker, claimed);
    } catch {
        return null;
    }

    let state = null;
    try {
        state = JSON.parse(readFileSync(statePath(key), "utf8"));
    } catch {
        state = null;
    }

    try {
        rmSync(claimed);
    } catch {
        // 消せなくても注入済みの事実は変わらない。
    }

    return buildInjection(state);
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
    if (mode === "inject") {
        const text = inject(input);
        if (text) {
            process.stdout.write(`${text}\n`);
        }
        return;
    }

    process.stderr.write("Usage: compact-hook.mjs save|mark|inject\n");
    process.exitCode = 1;
}

if (process.argv[1]?.endsWith("compact-hook.mjs")) {
    main().catch(() => {
        // 書き込みや読み取りに失敗しても、エージェントの動作を止めない。
        process.exitCode = 0;
    });
}
