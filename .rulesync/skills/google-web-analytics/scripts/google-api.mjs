#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// Search Console API は、URL 検査を searchconsole.googleapis.com で、検索パフォーマンス、サイト、
// サイトマップを旧 Webmaster Tools API 由来の www.googleapis.com/webmasters/ で提供する。
// www.googleapis.com は他の Google API もホストするため、/webmasters/ 配下に限定する。
const ALLOWED_ENDPOINTS = [
    { host: "analyticsdata.googleapis.com", pathPrefix: "/" },
    { host: "analyticsadmin.googleapis.com", pathPrefix: "/" },
    { host: "searchconsole.googleapis.com", pathPrefix: "/" },
    { host: "www.googleapis.com", pathPrefix: "/webmasters/" },
];

const USAGE = "Usage: google-api.mjs <METHOD> <URL> [--body <json> | --body-file <path>]";

function parseArguments(argv) {
    let parsed;
    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            options: { body: { type: "string" }, "body-file": { type: "string" } },
        });
    } catch (error) {
        throw new Error(`${error.message}\n${USAGE}`);
    }

    const { positionals, values } = parsed;
    if (positionals.length !== 2) {
        throw new Error(USAGE);
    }
    if (values.body !== undefined && values["body-file"] !== undefined) {
        throw new Error(`Only one of --body and --body-file can be given.\n${USAGE}`);
    }

    const body = values["body-file"] !== undefined ? readFileSync(values["body-file"], "utf8") : values.body;
    if (body !== undefined) {
        try {
            JSON.parse(body);
        } catch (error) {
            throw new Error(`Request body is not valid JSON: ${error.message}`);
        }
    }

    const [method, url] = positionals;
    return { method: method.toUpperCase(), url: assertAllowedUrl(url), body };
}

export function assertAllowedUrl(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new Error(`Invalid URL: ${rawUrl}`);
    }

    const allowed = url.protocol === "https:"
        && url.username === ""
        && url.password === ""
        && url.port === ""
        && ALLOWED_ENDPOINTS.some(({ host, pathPrefix }) => url.hostname === host && url.pathname.startsWith(pathPrefix));
    if (!allowed) {
        const list = ALLOWED_ENDPOINTS.map(({ host, pathPrefix }) => `https://${host}${pathPrefix}`).join(", ");
        throw new Error(`URL is not allowed: ${rawUrl}. Allowed: ${list}`);
    }
    return url;
}

function getAccessToken() {
    try {
        return execFileSync("gcloud", ["auth", "application-default", "print-access-token"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        }).trim();
    } catch (error) {
        const detail = error.stderr ? String(error.stderr).trim() : error.message;
        throw new Error(`Failed to get an access token from Application Default Credentials.\n${detail}`);
    }
}

function formatJson(text) {
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}

async function main() {
    const { method, url, body } = parseArguments(process.argv.slice(2));
    const headers = { Authorization: `Bearer ${getAccessToken()}` };
    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, { method, headers, body });
    const text = formatJson(await response.text());
    if (!response.ok) {
        process.stderr.write(`HTTP ${response.status}\n${text}\n`);
        process.exit(1);
    }
    process.stdout.write(`${text}\n`);
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
