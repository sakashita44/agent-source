import assert from "node:assert/strict";
import test from "node:test";
import { checkLinkReachability, extractSourceUrls, findSectionsWithoutCitation, parseArguments } from "../check-report.mjs";

const REPORT = [
    "# 調査レポート",
    "",
    "## エグゼクティブサマリ",
    "引用のない要約。",
    "",
    "## 背景",
    "事実である[^1]。",
    "",
    "## 現状",
    "引用がない本文。",
    "",
    "## Sources",
    "- [^1]: <https://example.invalid/a>",
    "- <https://example.invalid/b>",
    "- <https://example.invalid/b>",
    "",
].join("\n");

test("Sourcesセクションのurlだけを重複なく数える", () => {
    const urls = extractSourceUrls(REPORT);
    assert.deepEqual(urls, ["https://example.invalid/a", "https://example.invalid/b"]);
});

test("本文中のurlをSourcesの件数に数えない", () => {
    const markdown = "## 背景\n<https://example.invalid/body>\n\n## Sources\n<https://example.invalid/a>\n";
    assert.deepEqual(extractSourceUrls(markdown), ["https://example.invalid/a"]);
});

test("Sourcesセクションがない場合は空になる", () => {
    assert.deepEqual(extractSourceUrls("## 背景\n本文だけ。\n"), []);
});

test("文中引用のないセクションを報告する", () => {
    assert.deepEqual(findSectionsWithoutCitation(REPORT), ["現状"]);
});

test("除外セクションを引用なしとして報告しない", () => {
    const markdown = "## エグゼクティブサマリ\n要約。\n\n## 結論と示唆\n結論。\n\n## 未解決の論点\n論点。\n";
    assert.deepEqual(findSectionsWithoutCitation(markdown), []);
});

test("CRLFの改行を扱える", () => {
    const markdown = "## Sources\r\n<https://example.invalid/a>\r\n";
    assert.deepEqual(extractSourceUrls(markdown), ["https://example.invalid/a"]);
});

test("到達しないurlを報告する", async () => {
    const { unreachable } = await checkLinkReachability(["https://example.invalid/a", "https://example.invalid/b"], {
        fetchImpl: async (url) => ({ ok: url.endsWith("/a"), status: 404 }),
    });

    assert.deepEqual(unreachable, [{ url: "https://example.invalid/b", reason: "HTTP 404" }]);
});

test("HEADを拒否するurlをGETで確かめ直す", async () => {
    const methods = [];
    const { unreachable } = await checkLinkReachability(["https://example.invalid/a"], {
        fetchImpl: async (_url, options) => {
            methods.push(options.method);
            return { ok: options.method === "GET", status: 405 };
        },
    });

    assert.deepEqual(methods, ["HEAD", "GET"]);
    assert.deepEqual(unreachable, []);
});

test("通信の失敗を到達不能として扱う", async () => {
    const { unreachable } = await checkLinkReachability(["https://example.invalid/a"], {
        fetchImpl: async () => { throw new Error("getaddrinfo ENOTFOUND"); },
    });

    assert.equal(unreachable.length, 1);
    assert.match(unreachable[0].reason, /ENOTFOUND/);
});

test("引数を解釈する", () => {
    assert.deepEqual(parseArguments(["--report", "r.md", "--min-sources", "10"]), { report: "r.md", minSources: 10, checkLinks: false });
    assert.equal(parseArguments(["--report", "r.md", "--min-sources", "0", "--check-links"]).checkLinks, true);
});

test("不正な引数を拒否する", () => {
    assert.throws(() => parseArguments(["--report", "r.md"]), /Usage/);
    assert.throws(() => parseArguments(["--report", "r.md", "--min-sources", "x"]), /non-negative integer/);
});

test("全件が通信エラーならオフラインとして扱う", async () => {
    const result = await checkLinkReachability(["https://example.invalid/a", "https://example.invalid/b"], {
        fetchImpl: async () => { throw new Error("getaddrinfo ENOTFOUND"); },
    });

    assert.equal(result.offline, true);
    assert.equal(result.unreachable.length, 2);
});

test("一部だけ通信エラーならオフラインとしない", async () => {
    const result = await checkLinkReachability(["https://example.invalid/a", "https://example.invalid/b"], {
        fetchImpl: async (url) => {
            if (url.endsWith("/a")) { return { ok: true, status: 200 }; }
            throw new Error("getaddrinfo ENOTFOUND");
        },
    });

    assert.equal(result.offline, false);
    assert.equal(result.unreachable.length, 1);
});