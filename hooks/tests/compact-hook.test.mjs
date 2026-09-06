import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { basename } from "node:path";
import { buildInjection, buildState, readInput, removeExpired, stateKey } from "../compact-hook.mjs";

const BACKSLASH = String.fromCharCode(92);

test("session_idを状態のキーにする", () => {
    assert.equal(stateKey({ session_id: "abc-123", cwd: "/repo" }), "abc-123");
});

test("session_idがなければcwdで代用する", () => {
    assert.equal(stateKey({ cwd: "D:" + BACKSLASH + "work" + BACKSLASH + "repo" }), "D__work_repo");
});

test("入力が空でもキーが決まる", () => {
    assert.equal(stateKey({}), "unknown");
});

test("状態へ作業ディレクトリと時刻を残す", () => {
    const state = buildState({ session_id: "s1", cwd: "/repo" }, Date.parse("2026-09-07T10:00:00Z"));
    assert.equal(state.key, "s1");
    assert.equal(state.cwd, "/repo");
    assert.equal(state.compactedAt, "2026-09-07T10:00:00.000Z");
});

test("注入文へ作業ディレクトリと時刻を含める", () => {
    const text = buildInjection({ cwd: "/repo", compactedAt: "2026-09-07T10:00:00.000Z" });
    assert.match(text, /圧縮/);
    assert.match(text, /\/repo/);
    assert.match(text, /2026-09-07T10:00:00\.000Z/);
});

test("状態がなくても注入文を作れる", () => {
    const text = buildInjection(null);
    assert.match(text, /読み直す/);
    assert.doesNotMatch(text, /作業ディレクトリ:/);
});

test("期限切れのファイルだけを消す", () => {
    const now = Date.parse("2026-09-07T00:00:00Z");
    const day = 24 * 60 * 60 * 1000;
    const mtimes = { "old.json": now - 8 * day, "new.json": now - 1 * day };
    const removed = [];

    const count = removeExpired("/state", now, {
        readdir: () => Object.keys(mtimes),
        stat: (path) => ({ mtimeMs: mtimes[basename(path)] }),
        remove: (path) => removed.push(basename(path)),
    });

    assert.equal(count, 1);
    assert.deepEqual(removed, ["old.json"]);
});

test("消せないファイルがあっても掃除を続ける", () => {
    const now = Date.now();
    const count = removeExpired("/state", now, {
        readdir: () => ["a.json", "b.json"],
        stat: () => ({ mtimeMs: 0 }),
        remove: (path) => { if (path.endsWith("a.json")) throw new Error("EPERM"); },
    });

    assert.equal(count, 1);
});

test("標準入力のJSONを読む", async () => {
    const input = await readInput(Readable.from([Buffer.from('{"session_id":"s1"}')]));
    assert.deepEqual(input, { session_id: "s1" });
});

test("標準入力が空またはJSONでなくても失敗しない", async () => {
    assert.deepEqual(await readInput(Readable.from([])), {});
    assert.deepEqual(await readInput(Readable.from([Buffer.from("not json")])), {});
});
