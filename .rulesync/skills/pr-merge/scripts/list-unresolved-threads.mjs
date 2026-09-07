#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const QUERY = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          isResolved
          isOutdated
          path
          line
          comments(first: 1) {
            nodes { url body author { login } }
          }
        }
      }
    }
  }
}`;

// GitHubのGraphQLは reviewThreads へ isResolved を引数として受け付けない。
// 全件を取得してから未解決だけを残す。
export async function collectUnresolvedThreads({ owner, name, number, runGh }) {
    const unresolved = [];
    let cursor = null;

    for (;;) {
        const payload = await runGh({ query: QUERY, owner, name, number, cursor });
        const threads = payload?.data?.repository?.pullRequest?.reviewThreads;
        if (!threads) {
            throw new Error("Response did not contain reviewThreads. The pull request may not exist.");
        }

        for (const node of threads.nodes ?? []) {
            if (node.isResolved) {
                continue;
            }
            const comment = node.comments?.nodes?.[0] ?? {};
            unresolved.push({
                path: node.path ?? null,
                line: node.line ?? null,
                outdated: Boolean(node.isOutdated),
                author: comment.author?.login ?? null,
                url: comment.url ?? null,
                excerpt: excerpt(comment.body ?? ""),
            });
        }

        if (!threads.pageInfo?.hasNextPage) {
            return unresolved;
        }
        cursor = threads.pageInfo.endCursor;
    }
}

function excerpt(body) {
    const singleLine = body.replace(/\s+/g, " ").trim();
    return singleLine.length > 200 ? `${singleLine.slice(0, 200)}...` : singleLine;
}

export function parseArguments(argv) {
    const parsed = {};
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (key === "--repo") parsed.repo = value;
        else if (key === "--pr") parsed.pr = value;
        else throw new Error(`Unknown argument: ${key}`);
    }

    if (!parsed.repo || !parsed.pr) {
        throw new Error("Usage: list-unresolved-threads.mjs --repo <owner/name> --pr <number>");
    }

    const [owner, name] = parsed.repo.split("/");
    if (!owner || !name) {
        throw new Error(`--repo must be <owner>/<name>, received: ${parsed.repo}`);
    }

    const number = Number.parseInt(parsed.pr, 10);
    if (!Number.isInteger(number) || number <= 0) {
        throw new Error(`--pr must be a positive integer, received: ${parsed.pr}`);
    }

    return { owner, name, number };
}

function runGhCommand({ query, owner, name, number, cursor }) {
    const args = [
        "api", "graphql",
        "-f", `query=${query}`,
        // ownerとnameはGraphQL上でString!である。-F は数値に見える値を整数へ変換するため、
        // 数字だけの名前で型不整合になる。文字列は -f で渡す。
        "-f", `owner=${owner}`,
        "-f", `name=${name}`,
        "-F", `number=${number}`,
    ];
    if (cursor !== null && cursor !== undefined) {
        args.push("-f", `cursor=${cursor}`);
    }

    const stdout = execFileSync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout);
}

async function main() {
    const { owner, name, number } = parseArguments(process.argv.slice(2));
    const unresolved = await collectUnresolvedThreads({ owner, name, number, runGh: runGhCommand });
    process.stdout.write(`${JSON.stringify({ count: unresolved.length, unresolved }, null, 2)}\n`);
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
