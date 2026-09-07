import assert from "node:assert/strict";
import test from "node:test";
import { collectUnresolvedThreads, parseArguments } from "../list-unresolved-threads.mjs";

function page(nodes, { hasNextPage = false, endCursor = null } = {}) {
    return {
        data: {
            repository: {
                pullRequest: {
                    reviewThreads: { pageInfo: { hasNextPage, endCursor }, nodes },
                },
            },
        },
    };
}

function thread({ isResolved = false, path = "src/a.ts", line = 10, body = "要確認", login = "reviewer" } = {}) {
    return {
        isResolved,
        isOutdated: false,
        path,
        line,
        comments: { nodes: [{ url: "https://example.invalid/1", body, author: { login } }] },
    };
}

test("未解決スレッドだけを返す", async () => {
    const unresolved = await collectUnresolvedThreads({
        owner: "o", name: "n", number: 1,
        runGh: async () => page([thread(), thread({ isResolved: true, path: "src/b.ts" })]),
    });

    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].path, "src/a.ts");
    assert.equal(unresolved[0].author, "reviewer");
});

test("未解決がない場合は空配列を返す", async () => {
    const unresolved = await collectUnresolvedThreads({
        owner: "o", name: "n", number: 1,
        runGh: async () => page([thread({ isResolved: true })]),
    });

    assert.deepEqual(unresolved, []);
});

test("複数ページを最後までたどる", async () => {
    const pages = [
        page([thread({ path: "src/a.ts" })], { hasNextPage: true, endCursor: "cursor-1" }),
        page([thread({ path: "src/b.ts" })]),
    ];
    const seenCursors = [];

    const unresolved = await collectUnresolvedThreads({
        owner: "o", name: "n", number: 1,
        runGh: async ({ cursor }) => {
            seenCursors.push(cursor);
            return pages.shift();
        },
    });

    assert.deepEqual(unresolved.map((entry) => entry.path), ["src/a.ts", "src/b.ts"]);
    assert.deepEqual(seenCursors, [null, "cursor-1"]);
});

test("APIエラーを握りつぶさない", async () => {
    await assert.rejects(
        collectUnresolvedThreads({
            owner: "o", name: "n", number: 1,
            runGh: async () => { throw new Error("gh: HTTP 401"); },
        }),
        /HTTP 401/,
    );
});

test("reviewThreadsを含まない応答を失敗として扱う", async () => {
    await assert.rejects(
        collectUnresolvedThreads({
            owner: "o", name: "n", number: 1,
            runGh: async () => ({ data: { repository: null } }),
        }),
        /reviewThreads/,
    );
});

test("本文が長い場合は抜粋する", async () => {
    const unresolved = await collectUnresolvedThreads({
        owner: "o", name: "n", number: 1,
        runGh: async () => page([thread({ body: "あ".repeat(300) })]),
    });

    assert.equal(unresolved[0].excerpt.length, 203);
    assert.ok(unresolved[0].excerpt.endsWith("..."));
});

test("引数を解釈する", () => {
    assert.deepEqual(parseArguments(["--repo", "owner/name", "--pr", "12"]), { owner: "owner", name: "name", number: 12 });
});

test("不正な引数を拒否する", () => {
    assert.throws(() => parseArguments(["--repo", "ownername", "--pr", "12"]), /owner/);
    assert.throws(() => parseArguments(["--repo", "owner/name", "--pr", "0"]), /positive integer/);
    assert.throws(() => parseArguments(["--repo", "owner/name"]), /Usage/);
});
