import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { buildInjection, buildState, inject, mark, readInput, removeExpired, restore, save, stateKey } from "../compact-hook.mjs";

const BACKSLASH = String.fromCharCode(92);

function newDir() {
    return mkdtempSync(join(tmpdir(), "compact-hook-test-"));
}

test("agent_idを最優先の状態キーにする", () => {
    assert.equal(stateKey({ agent_id: "sub-1", session_id: "root-1" }), "sub-1");
});

test("agent_idがなければsession_idを使う", () => {
    assert.equal(stateKey({ session_id: "root-1", cwd: "/repo" }), "root-1");
});

test("識別子がなければcwdで代用する", () => {
    assert.equal(stateKey({ cwd: "D:" + BACKSLASH + "work" + BACKSLASH + "repo" }), "D__work_repo");
});

test("入力が空でもプロセスの作業ディレクトリでキーが決まる", () => {
    assert.equal(stateKey({}), stateKey({ cwd: process.cwd() }));
});

test("状態へ作業ディレクトリ、記録の場所、時刻を残す", () => {
    const state = buildState({ session_id: "s1", cwd: "/repo", transcript_path: "/t.jsonl" }, Date.parse("2026-09-07T10:00:00Z"));
    assert.equal(state.cwd, "/repo");
    assert.equal(state.transcript, "/t.jsonl");
    assert.equal(state.compactedAt, "2026-09-07T10:00:00.000Z");
});

test("注入文へ作業ディレクトリと記録の場所を含める", () => {
    const text = buildInjection({ cwd: "/repo", transcript: "/t.jsonl", compactedAt: "2026-09-07T10:00:00.000Z" });
    assert.match(text, /圧縮/);
    assert.match(text, /\/repo/);
    assert.match(text, /\/t\.jsonl/);
});

test("状態がなくても注入文を作れる", () => {
    assert.match(buildInjection(null), /読み直す/);
});

test("Claude Codeの順序（SessionStartが先）で一度だけ注入する", () => {
    const dir = newDir();
    const input = { session_id: "cc-1", cwd: "/repo" };
    try {
        save(input, Date.now(), dir);
        const first = restore(input, dir);
        assert.match(first, /圧縮/);
        assert.equal(mark(input, dir), "kept-injected-mark");
        assert.equal(inject(input, dir), null);
        assert.equal(restore(input, dir), null);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("Codexの順序（PostCompactが先）で一度だけ注入する", () => {
    const dir = newDir();
    const input = { session_id: "cx-1", cwd: "/repo" };
    try {
        save(input, Date.now(), dir);
        assert.equal(mark(input, dir), "wrote-marker");
        const first = restore(input, dir);
        assert.match(first, /圧縮/);
        assert.equal(inject(input, dir), null);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("SessionStartが届かない場合はUserPromptSubmitが注入する", () => {
    const dir = newDir();
    const input = { agent_id: "sub-1" };
    try {
        save(input, Date.now(), dir);
        assert.equal(mark(input, dir), "wrote-marker");
        assert.match(inject(input, dir), /圧縮/);
        assert.equal(inject(input, dir), null);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("圧縮が起きていなければ何も注入しない", () => {
    const dir = newDir();
    try {
        assert.equal(restore({ session_id: "none" }, dir), null);
        assert.equal(inject({ session_id: "none" }, dir), null);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("親と子で状態を分ける", () => {
    const dir = newDir();
    const parent = { session_id: "root-1" };
    const child = { session_id: "root-1", agent_id: "sub-1" };
    try {
        save(parent, Date.now(), dir);
        save(child, Date.now(), dir);
        assert.equal(mark(child, dir), "wrote-marker");
        assert.equal(inject(parent, dir), null);
        assert.match(inject(child, dir), /圧縮/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("残った注入済み印は次の圧縮で失効する", () => {
    const dir = newDir();
    const input = { session_id: "stale-1" };
    try {
        save(input, Date.now(), dir);
        assert.match(restore(input, dir), /圧縮/);
        // PostCompactが落ちて印が残った状態を作る。次の圧縮で新しいstateが書かれる。
        const later = Date.now() + 60000;
        save(input, later, dir);
        utimesSync(join(dir, "stale-1.json"), new Date(later), new Date(later));
        assert.match(restore(input, dir), /圧縮/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("saveが期限切れのファイルを掃除する", () => {
    const dir = newDir();
    try {
        save({ session_id: "old" }, Date.now(), dir);
        const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        utimesSync(join(dir, "old.json"), old, old);
        save({ session_id: "new" }, Date.now(), dir);
        assert.equal(existsSync(join(dir, "old.json")), false);
        assert.equal(existsSync(join(dir, "new.json")), true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("消せないファイルがあっても掃除を続ける", () => {
    const count = removeExpired("/state", Date.now(), {
        readdir: () => ["a.json", "b.json"],
        stat: () => ({ mtimeMs: 0 }),
        remove: (path) => { if (basename(path) === "a.json") throw new Error("EPERM"); },
    });
    assert.equal(count, 1);
});

test("標準入力のJSONを読む", async () => {
    assert.deepEqual(await readInput(Readable.from([Buffer.from('{"session_id":"s1"}')])), { session_id: "s1" });
});

test("標準入力が空またはJSONでなくても失敗しない", async () => {
    assert.deepEqual(await readInput(Readable.from([])), {});
    assert.deepEqual(await readInput(Readable.from([Buffer.from("not json")])), {});
});
