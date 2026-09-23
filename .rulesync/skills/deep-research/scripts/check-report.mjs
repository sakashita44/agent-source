#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// レポートの言語は依頼に合わせるため、除外する見出しも言語ごとに持つ。
const EXCLUDED_SECTION_PATTERN = /^(エグゼクティブサマリ|結論と示唆|未解決の論点|Sources|Executive Summary|Conclusion|Implications|Open Questions|Limitations)/i;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
// 脚注の定義行 `[^id]:` を参照として数えないため、直後のコロンを除く。
const FOOTNOTE_REFERENCE_PATTERN = /\[\^([^\]\s]+)\](?!:)/g;
// 定義は1行に収める規約（references/report-guidelines.md）のため、継続行は読まない。
// Sourcesは箇条書きで書かれることが多いため、リスト記号付きの `- [^id]:` も定義として受け付ける。
const FOOTNOTE_DEFINITION_PATTERN = /^\s*(?:[-*+]\s+)?\[\^([^\]\s]+)\]:(.*)$/;

// SKILL.mdの「機械検証」節の表と対応させる。到達性を確認できなかった場合を成功と区別するため2に分ける。
export const EXIT_PASS = 0;
export const EXIT_FAIL = 1;
export const EXIT_UNVERIFIED = 2;

function splitSections(markdown) {
    const sections = [];
    let current = { heading: null, lines: [] };
    for (const line of markdown.split(/\r?\n/)) {
        if (/^## /.test(line)) {
            sections.push(current);
            current = { heading: line.slice(3).trim(), lines: [] };
            continue;
        }
        current.lines.push(line);
    }
    sections.push(current);
    return sections;
}

function isSourcesSection(section) {
    return section.heading !== null && /^Sources/.test(section.heading);
}

function sourcesLines(markdown) {
    return splitSections(markdown).filter(isSourcesSection).flatMap((section) => section.lines);
}

function bodyLines(markdown) {
    return splitSections(markdown).filter((section) => !isSourcesSection(section)).flatMap((section) => section.lines);
}

function withoutCode(lines) {
    let fence = null;
    return lines.map((line) => {
        const marker = line.match(/^\s*(```|~~~)/)?.[1];
        if (fence === null && marker) {
            fence = marker;
            return "";
        }
        if (fence !== null) {
            if (marker === fence) fence = null;
            return "";
        }
        return line.replace(/`[^`]*`/g, "");
    });
}

function findUrls(line) {
    return (line.match(URL_PATTERN) ?? []).map(trimTrailingPunctuation);
}

// 同じページにqueryやfragmentを付けた変種で最低ソース数を水増しさせないため、これらを除いて比較する。
// ホスト名の小文字化はURLパーサーが行う。
export function normalizeUrl(url) {
    const parsed = new URL(url);
    const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, "") : parsed.pathname;
    return `${parsed.protocol}//${parsed.host}${path}`;
}

function collectUniqueUrls(lines) {
    const byKey = new Map();
    const invalid = [];
    for (const line of lines) {
        for (const url of findUrls(line)) {
            let key;
            try {
                key = normalizeUrl(url);
            } catch {
                if (!invalid.includes(url)) invalid.push(url);
                continue;
            }
            if (!byKey.has(key)) byKey.set(key, url);
        }
    }
    return { urls: [...byKey.values()], invalid };
}

export function extractSourceUrls(markdown) {
    return collectUniqueUrls(sourcesLines(markdown));
}

// 括弧を含むurlがあるため、末尾の記号は一律に落とさない。閉じ括弧は、対応する開き括弧が
// 足りない場合だけ落とす。Wikipediaのような `..._(language_model)` を途中で切らないため。
export function trimTrailingPunctuation(url) {
    let result = url;
    for (;;) {
        const last = result.slice(-1);
        if (".,;:!?".includes(last)) {
            result = result.slice(0, -1);
            continue;
        }
        if (last === ")" || last === "]") {
            const open = last === ")" ? "(" : "[";
            const opens = result.split(open).length - 1;
            const closes = result.split(last).length - 1;
            if (closes > opens) {
                result = result.slice(0, -1);
                continue;
            }
        }
        return result;
    }
}

// Sources以外に置いた脚注定義は定義として扱わない（references/report-guidelines.md）。
function collectFootnoteDefinitions(markdown) {
    const definitions = new Map();
    for (const line of sourcesLines(markdown)) {
        const match = line.match(FOOTNOTE_DEFINITION_PATTERN);
        if (match) {
            definitions.set(match[1], findUrls(match[2]).length > 0);
        }
    }
    return definitions;
}

export function findFootnoteProblems(markdown) {
    const definitions = collectFootnoteDefinitions(markdown);
    const undefinedReferences = new Set();
    for (const line of withoutCode(bodyLines(markdown))) {
        for (const [, id] of line.matchAll(FOOTNOTE_REFERENCE_PATTERN)) {
            if (!definitions.has(id)) undefinedReferences.add(id);
        }
    }
    const definitionsWithoutUrl = [...definitions].filter(([, hasUrl]) => !hasUrl).map(([id]) => id);
    return { undefinedReferences: [...undefinedReferences], definitionsWithoutUrl };
}

export function findSectionsWithoutCitation(markdown) {
    const definitions = collectFootnoteDefinitions(markdown);
    const citesResolvedFootnote = (line) => [...line.matchAll(FOOTNOTE_REFERENCE_PATTERN)].some(([, id]) => definitions.has(id));

    return splitSections(markdown)
        .filter((section) => section.heading !== null && !EXCLUDED_SECTION_PATTERN.test(section.heading))
        // 出典は脚注と文中リンクのどちらの形式でもよいため、urlがあれば引用ありとみなす。
        .filter((section) => !withoutCode(section.lines).some((line) => citesResolvedFootnote(line) || /https?:\/\//.test(line)))
        .map((section) => section.heading);
}

export function findUrlsMissingFromLedger(urls, ledgerMarkdown) {
    const ledgerKeys = new Set();
    for (const line of ledgerMarkdown.split(/\r?\n/)) {
        for (const url of findUrls(line)) {
            try {
                ledgerKeys.add(normalizeUrl(url));
            } catch {
                continue;
            }
        }
    }
    return urls.filter((url) => !ledgerKeys.has(normalizeUrl(url)));
}

export async function checkLinkReachability(urls, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
    const unreachable = [];
    let networkErrors = 0;

    for (const url of urls) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            let response = await fetchImpl(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
            // HEAD を拒否して405や403を返すサイトがあるため、GETで確かめ直す。
            if (!response.ok) {
                response = await fetchImpl(url, { method: "GET", signal: controller.signal, redirect: "follow" });
            }
            if (!response.ok) {
                unreachable.push({ url, reason: `HTTP ${response.status}` });
            }
        } catch (error) {
            networkErrors += 1;
            unreachable.push({ url, reason: error.name === "AbortError" ? "timeout" : error.message });
        } finally {
            clearTimeout(timer);
        }
    }

    // 全件が通信エラーなら、リンク切れではなくネットワークを使えない環境とみなす。
    return { unreachable, offline: urls.length > 0 && networkErrors === urls.length };
}

const USAGE = "Usage: check-report.mjs --report <report.md> --min-sources <number> [--ledger <sources.md>] [--check-links]";

export function parseArguments(argv) {
    const parsed = { checkLinks: false };
    let index = 0;
    const readValue = () => {
        const value = argv[++index];
        if (value === undefined) throw new Error(USAGE);
        return value;
    };
    for (; index < argv.length; index += 1) {
        const key = argv[index];
        if (key === "--report") parsed.report = readValue();
        else if (key === "--min-sources") parsed.minSources = readValue();
        else if (key === "--ledger") parsed.ledger = readValue();
        else if (key === "--check-links") parsed.checkLinks = true;
        else throw new Error(`Unknown argument: ${key}`);
    }

    if (!parsed.report || parsed.minSources === undefined) {
        throw new Error(USAGE);
    }

    // Number.parseIntは "10junk" を10として、Numberは空文字や前後の空白、"1e3" を数値として受理する。
    // そのため先に数字だけの文字列かを確かめ、桁が多すぎて丸められた値はisSafeIntegerで拒否する。
    const minSources = Number(parsed.minSources);
    if (!/^\d+$/.test(parsed.minSources) || !Number.isSafeInteger(minSources)) {
        throw new Error(`--min-sources must be a non-negative integer, received: ${parsed.minSources}`);
    }

    return { report: parsed.report, minSources, ledger: parsed.ledger, checkLinks: parsed.checkLinks };
}

function readText(path) {
    try {
        return readFileSync(path, "utf8");
    } catch {
        return null;
    }
}

async function runChecks({ report, minSources, ledger, checkLinks }) {
    const write = (line) => process.stdout.write(`${line}\n`);
    const markdown = readText(report);
    if (markdown === null) {
        write(`FAIL: ${report} が存在しない`);
        write("RESULT: FAIL");
        return EXIT_FAIL;
    }

    let failed = false;
    let unverified = false;
    const { urls, invalid } = extractSourceUrls(markdown);

    if (urls.length >= minSources) {
        write(`PASS: Sourcesのユニークurl数 ${urls.length} (>= ${minSources})`);
    } else {
        write(`FAIL: Sourcesのユニークurl数 ${urls.length} (< ${minSources})`);
        failed = true;
    }

    for (const url of invalid) {
        write(`FAIL: Sourcesのurlを解釈できない ${url}`);
        failed = true;
    }

    const { undefinedReferences, definitionsWithoutUrl } = findFootnoteProblems(markdown);
    if (undefinedReferences.length === 0 && definitionsWithoutUrl.length === 0) {
        write("PASS: 本文の脚注参照はすべてSourcesの定義へ解決する");
    }
    for (const id of undefinedReferences) {
        write(`FAIL: 脚注 [^${id}] がSourcesに定義されていない`);
        failed = true;
    }
    for (const id of definitionsWithoutUrl) {
        write(`FAIL: 脚注 [^${id}] の定義にurlがない`);
        failed = true;
    }

    const missing = findSectionsWithoutCitation(markdown);
    if (missing.length === 0) {
        write("PASS: 全本文セクションに文中引用あり");
    } else {
        for (const section of missing) {
            write(`FAIL: セクション「${section}」に文中引用がない`);
        }
        failed = true;
    }

    if (ledger !== undefined) {
        const ledgerMarkdown = readText(ledger);
        if (ledgerMarkdown === null) {
            write(`FAIL: 調査台帳 ${ledger} が存在しない`);
            failed = true;
        } else {
            const notInLedger = findUrlsMissingFromLedger(urls, ledgerMarkdown);
            if (notInLedger.length === 0) {
                write(`PASS: Sourcesの${urls.length}件すべてが調査台帳にある`);
            } else {
                for (const url of notInLedger) {
                    write(`FAIL: 調査台帳にないurl ${url}`);
                }
                failed = true;
            }
        }
    }

    if (checkLinks) {
        try {
            const { unreachable, offline } = await checkLinkReachability(urls);
            if (offline) {
                write(`SKIP: ネットワークへ到達できないため、リンクの到達性を検査しない（対象 ${urls.length} 件）`);
                unverified = true;
            } else if (unreachable.length === 0) {
                write(`PASS: Sourcesの${urls.length}件すべてが到達可能`);
            } else {
                for (const entry of unreachable) {
                    write(`FAIL: 到達できないurl ${entry.url} (${entry.reason})`);
                }
                failed = true;
            }
        } catch (error) {
            write(`SKIP: リンク到達性を検査できない (${error.message})`);
            unverified = true;
        }
    }

    if (failed) {
        write("RESULT: FAIL");
        return EXIT_FAIL;
    }
    if (unverified) {
        write("RESULT: UNVERIFIED");
        return EXIT_UNVERIFIED;
    }
    write("RESULT: PASS");
    return EXIT_PASS;
}

async function main() {
    process.exit(await runChecks(parseArguments(process.argv.slice(2))));
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
    main().catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exit(EXIT_FAIL);
    });
}
