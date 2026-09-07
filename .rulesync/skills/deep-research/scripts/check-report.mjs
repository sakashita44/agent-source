#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// レポートの言語は依頼に合わせるため、除外する見出しも言語ごとに持つ。
const EXCLUDED_SECTION_PATTERN = /^(エグゼクティブサマリ|結論と示唆|未解決の論点|Sources|Executive Summary|Conclusion|Implications|Open Questions|Limitations)/i;
const URL_PATTERN = /https?:\/\/[^\s)\]>"']+/g;

export function extractSourceUrls(markdown) {
    const urls = new Set();
    let inSources = false;

    for (const line of markdown.split(/\r?\n/)) {
        if (/^## /.test(line)) {
            inSources = /^## Sources/.test(line);
            continue;
        }
        if (!inSources) {
            continue;
        }
        for (const url of line.match(URL_PATTERN) ?? []) {
            urls.add(url.replace(/[.,]+$/, ""));
        }
    }

    return [...urls];
}

export function findSectionsWithoutCitation(markdown) {
    const missing = [];
    let section = null;
    let cited = false;

    const close = () => {
        if (section !== null && !cited && !EXCLUDED_SECTION_PATTERN.test(section)) {
            missing.push(section);
        }
    };

    for (const line of markdown.split(/\r?\n/)) {
        if (/^## /.test(line)) {
            close();
            section = line.slice(3).trim();
            cited = false;
            continue;
        }
        if (/\[\^/.test(line) || /https?:\/\//.test(line)) {
            cited = true;
        }
    }
    close();

    return missing;
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

export function parseArguments(argv) {
    const parsed = { checkLinks: false };
    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        if (key === "--report") parsed.report = argv[++index];
        else if (key === "--min-sources") parsed.minSources = argv[++index];
        else if (key === "--check-links") parsed.checkLinks = true;
        else throw new Error(`Unknown argument: ${key}`);
    }

    if (!parsed.report || parsed.minSources === undefined) {
        throw new Error("Usage: check-report.mjs --report <report.md> --min-sources <number> [--check-links]");
    }

    const minSources = Number.parseInt(parsed.minSources, 10);
    if (!Number.isInteger(minSources) || minSources < 0) {
        throw new Error(`--min-sources must be a non-negative integer, received: ${parsed.minSources}`);
    }

    return { report: parsed.report, minSources, checkLinks: parsed.checkLinks };
}

async function main() {
    const { report, minSources, checkLinks } = parseArguments(process.argv.slice(2));

    let markdown;
    try {
        markdown = readFileSync(report, "utf8");
    } catch {
        process.stdout.write(`FAIL: ${report} が存在しない\n`);
        process.exit(1);
    }

    let failed = false;
    const urls = extractSourceUrls(markdown);

    if (urls.length >= minSources) {
        process.stdout.write(`PASS: Sourcesのユニークurl数 ${urls.length} (>= ${minSources})\n`);
    } else {
        process.stdout.write(`FAIL: Sourcesのユニークurl数 ${urls.length} (< ${minSources})\n`);
        failed = true;
    }

    const missing = findSectionsWithoutCitation(markdown);
    if (missing.length === 0) {
        process.stdout.write("PASS: 全本文セクションに文中引用あり\n");
    } else {
        for (const section of missing) {
            process.stdout.write(`FAIL: セクション「${section}」に文中引用がない\n`);
        }
        failed = true;
    }

    if (checkLinks) {
        try {
            const { unreachable, offline } = await checkLinkReachability(urls);
            if (offline) {
                process.stdout.write(`SKIP: ネットワークへ到達できないため、リンクの到達性を検査しない（対象 ${urls.length} 件）\n`);
            } else if (unreachable.length === 0) {
                process.stdout.write(`PASS: Sourcesの${urls.length}件すべてが到達可能\n`);
            } else {
                for (const entry of unreachable) {
                    process.stdout.write(`FAIL: 到達できないurl ${entry.url} (${entry.reason})\n`);
                }
                failed = true;
            }
        } catch (error) {
            process.stdout.write(`SKIP: リンク到達性を検査できない (${error.message})\n`);
        }
    }

    process.stdout.write(`RESULT: ${failed ? "FAIL" : "PASS"}\n`);
    process.exit(failed ? 1 : 0);
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
        process.exit(1);
    });
}
