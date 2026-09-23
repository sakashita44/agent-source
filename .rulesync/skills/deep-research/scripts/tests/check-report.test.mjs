import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
    EXIT_FAIL,
    EXIT_PASS,
    EXIT_UNVERIFIED,
    checkLinkReachability,
    extractSourceUrls,
    findFootnoteProblems,
    findSectionsWithoutCitation,
    findUrlsMissingFromLedger,
    normalizeUrl,
    parseArguments,
    trimTrailingPunctuation,
} from "../check-report.mjs";

const SCRIPT = fileURLToPath(new URL("../check-report.mjs", import.meta.url));

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
    const { urls } = extractSourceUrls(REPORT);
    assert.deepEqual(urls, ["https://example.invalid/a", "https://example.invalid/b"]);
});

test("本文中のurlをSourcesの件数に数えない", () => {
    const markdown = "## 背景\n<https://example.invalid/body>\n\n## Sources\n<https://example.invalid/a>\n";
    assert.deepEqual(extractSourceUrls(markdown).urls, ["https://example.invalid/a"]);
});

test("Sourcesセクションがない場合は空になる", () => {
    assert.deepEqual(extractSourceUrls("## 背景\n本文だけ。\n").urls, []);
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
    assert.deepEqual(extractSourceUrls(markdown).urls, ["https://example.invalid/a"]);
});

test("queryやfragmentだけが異なるurlを同じソースとして数える", () => {
    const markdown = [
        "## Sources",
        "- https://example.invalid/page",
        "- https://example.invalid/page?utm_source=x",
        "- https://example.invalid/page?x=2#section",
        "- https://EXAMPLE.invalid/page/",
        "- https://example.invalid/other",
    ].join("\n");
    assert.deepEqual(extractSourceUrls(markdown).urls, ["https://example.invalid/page", "https://example.invalid/other"]);
});

test("正規化はquery、fragment、末尾のスラッシュを除き、ホスト名を小文字にする", () => {
    assert.equal(normalizeUrl("https://Example.invalid/a/?q=1#f"), "https://example.invalid/a");
    assert.equal(normalizeUrl("https://example.invalid/"), "https://example.invalid/");
    assert.equal(normalizeUrl("http://example.invalid/a"), "http://example.invalid/a");
});

test("解釈できないurlを別に報告し件数に数えない", () => {
    const markdown = "## Sources\n- http://[::1\n- https://example.invalid/a\n";
    assert.deepEqual(extractSourceUrls(markdown), { urls: ["https://example.invalid/a"], invalid: ["http://[::1"] });
});

test("Sourcesに定義されていない脚注参照を報告する", () => {
    const markdown = "## 背景\n事実である[^1]。別の事実[^2]。\n\n## Sources\n[^1]: https://example.invalid/a\n";
    assert.deepEqual(findFootnoteProblems(markdown), { undefinedReferences: ["2"], definitionsWithoutUrl: [] });
});

test("本文にある脚注定義をSourcesの定義として扱わない", () => {
    const markdown = "## 背景\n事実である[^1]。\n[^1]: https://example.invalid/a\n\n## Sources\n- https://example.invalid/a\n";
    assert.deepEqual(findFootnoteProblems(markdown).undefinedReferences, ["1"]);
});

test("urlを含まない脚注定義を報告する", () => {
    const markdown = "## 背景\n事実である[^1]。\n\n## Sources\n- [^1]: 書籍のタイトルのみ\n";
    assert.deepEqual(findFootnoteProblems(markdown), { undefinedReferences: [], definitionsWithoutUrl: ["1"] });
});

test("未定義の脚注だけを持つセクションを引用なしとして報告する", () => {
    const markdown = "## 背景\n事実である[^9]。\n\n## Sources\n[^1]: https://example.invalid/a\n";
    assert.deepEqual(findSectionsWithoutCitation(markdown), ["背景"]);
});

test("調査台帳にないSourcesのurlを報告する", () => {
    const ledger = "# 参照ソース台帳\n- https://example.invalid/a?from=search — 公式\n";
    const missing = findUrlsMissingFromLedger(["https://example.invalid/a#top", "https://example.invalid/b"], ledger);
    assert.deepEqual(missing, ["https://example.invalid/b"]);
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
    assert.deepEqual(parseArguments(["--report", "r.md", "--min-sources", "10"]), { report: "r.md", minSources: 10, ledger: undefined, checkLinks: false });
    assert.equal(parseArguments(["--report", "r.md", "--min-sources", "0", "--check-links"]).checkLinks, true);
    assert.equal(parseArguments(["--report", "r.md", "--min-sources", "0", "--ledger", "s.md"]).ledger, "s.md");
});

test("不正な引数を拒否する", () => {
    assert.throws(() => parseArguments(["--report", "r.md"]), /Usage/);
    assert.throws(() => parseArguments(["--report", "r.md", "--min-sources"]), /Usage/);
    assert.throws(() => parseArguments(["--report", "r.md", "--min-sources", "1", "--ledger"]), /Usage/);
    for (const value of ["x", "10junk", "-1", "1.5", "", " 1", "1e3", "99999999999999999999"]) {
        assert.throws(() => parseArguments(["--report", "r.md", "--min-sources", value]), /non-negative integer/, `value: ${JSON.stringify(value)}`);
    }
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

test("括弧を含むurlを途中で切らない", () => {
    const markdown = "## Sources\n- <https://ja.wikipedia.org/wiki/Gemini_(言語モデル)>\n- https://example.invalid/a.\n";
    assert.deepEqual(extractSourceUrls(markdown).urls, [
        "https://ja.wikipedia.org/wiki/Gemini_(言語モデル)",
        "https://example.invalid/a",
    ]);
});

test("対応しない閉じ括弧だけを落とす", () => {
    assert.equal(trimTrailingPunctuation("https://example.invalid/a(b)"), "https://example.invalid/a(b)");
    assert.equal(trimTrailingPunctuation("https://example.invalid/a)"), "https://example.invalid/a");
    assert.equal(trimTrailingPunctuation("https://example.invalid/a,"), "https://example.invalid/a");
});

const VALID_REPORT = [
    "# 調査レポート",
    "",
    "## 背景",
    "事実である[^1]。",
    "",
    "## 現状",
    "別の事実である[^2]。",
    "",
    "## Sources",
    "[^1]: <https://example.invalid/a>",
    "[^2]: <https://example.invalid/b>",
    "",
].join("\n");

function runCli(files, args) {
    const dir = mkdtempSync(join(tmpdir(), "check-report-"));
    try {
        for (const [name, content] of Object.entries(files)) {
            writeFileSync(join(dir, name), content);
        }
        const resolved = args.map((arg) => (arg in files ? join(dir, arg) : arg));
        return spawnSync(process.execPath, [SCRIPT, ...resolved], { encoding: "utf8" });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test("CLI: 条件を満たすレポートはPASSで終了コード0を返す", () => {
    const result = runCli({ "report.md": VALID_REPORT, "sources.md": "- https://example.invalid/a\n- https://example.invalid/b\n" },
        ["--report", "report.md", "--min-sources", "2", "--ledger", "sources.md"]);
    assert.equal(result.status, EXIT_PASS, result.stdout);
    assert.match(result.stdout, /RESULT: PASS/);
});

test("CLI: 偽陽性の入力はFAILで終了コード1を返す", () => {
    const report = VALID_REPORT
        .replace("別の事実である[^2]。", "別の事実である[^3]。")
        .replace("[^2]: <https://example.invalid/b>", "[^2]: <https://example.invalid/a?variant=1>");
    const result = runCli({ "report.md": report, "sources.md": "- https://example.invalid/a\n" },
        ["--report", "report.md", "--min-sources", "2", "--ledger", "sources.md"]);
    assert.equal(result.status, EXIT_FAIL, result.stdout);
    assert.match(result.stdout, /FAIL: Sourcesのユニークurl数 1 \(< 2\)/);
    assert.match(result.stdout, /FAIL: 脚注 \[\^3\] がSourcesに定義されていない/);
    assert.match(result.stdout, /FAIL: セクション「現状」に文中引用がない/);
    assert.match(result.stdout, /RESULT: FAIL/);
});

test("CLI: 調査台帳にないurlがあるとFAILを返す", () => {
    const result = runCli({ "report.md": VALID_REPORT, "sources.md": "- https://example.invalid/a\n" },
        ["--report", "report.md", "--min-sources", "2", "--ledger", "sources.md"]);
    assert.equal(result.status, EXIT_FAIL, result.stdout);
    assert.match(result.stdout, /FAIL: 調査台帳にないurl https:\/\/example.invalid\/b/);
});

test("CLI: 存在しないレポートや不正な引数は終了コード1を返す", () => {
    const missing = runCli({}, ["--report", "missing.md", "--min-sources", "1"]);
    assert.equal(missing.status, EXIT_FAIL);
    assert.match(missing.stdout, /RESULT: FAIL/);

    const invalid = runCli({ "report.md": VALID_REPORT }, ["--report", "report.md", "--min-sources", "10junk"]);
    assert.equal(invalid.status, EXIT_FAIL);
    assert.match(invalid.stderr, /non-negative integer/);
});

// `.invalid` はRFC 6761で名前解決しないと定められているため、全件が通信エラーになりオフライン扱いになる。
test("CLI: リンクの到達性を確認できない場合はUNVERIFIEDで終了コード2を返す", () => {
    const result = runCli({ "report.md": VALID_REPORT }, ["--report", "report.md", "--min-sources", "2", "--check-links"]);
    assert.equal(result.status, EXIT_UNVERIFIED, result.stdout);
    assert.match(result.stdout, /SKIP: /);
    assert.match(result.stdout, /RESULT: UNVERIFIED/);
});
