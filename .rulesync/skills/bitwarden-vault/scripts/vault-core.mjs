import { homedir } from "node:os";
import { join, win32 } from "node:path";

export const STATE_FILE = join(homedir(), ".local", "agent-source", "state", "bitwarden-vault", "broker.json");
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

// Bitwarden の項目種別（CipherType）を表す数値。
const ITEM_TYPES = { 1: "login", 2: "note", 3: "card", 4: "identity", 5: "sshKey" };
const ITEM_NAME_PATTERN = /^[A-Za-z0-9]+(?:[A-Za-z0-9.]*)-(?:Token|Account|KeyPair)-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REPO_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENVIRONMENT_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const HOST_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const SSH_FILE_PATTERN = /^ssh(\.exe)?$/i;
const CLIENT_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,39}$/u;
const MIN_GENERATED_LENGTH = 16;
const MAX_GENERATED_LENGTH = 128;

export function assertItemName(name) {
    if (typeof name !== "string" || !ITEM_NAME_PATTERN.test(name)) {
        throw new Error(`Item name does not follow the naming rule {Service}-{Token|Account|KeyPair}-{Label}: ${JSON.stringify(name)}`);
    }
    return name;
}

export function summarizeItems(items, folders) {
    const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));
    return items
        .filter((item) => !item.deletedDate)
        .map((item) => ({
            name: item.name,
            folder: item.folderId ? folderNames.get(item.folderId) ?? null : null,
            type: ITEM_TYPES[item.type] ?? `unknown(${item.type})`,
            hasPassword: typeof item.login?.password === "string" && item.login.password.length > 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function findItemByName(items, name) {
    const matches = items.filter((item) => !item.deletedDate && item.name === name);
    if (matches.length === 0) {
        throw new Error(`No item is named ${JSON.stringify(name)}.`);
    }
    if (matches.length > 1) {
        throw new Error(`${matches.length} items are named ${JSON.stringify(name)}. Rename them in Bitwarden so that the name is unique.`);
    }
    return matches[0];
}

export function passwordOf(item) {
    const password = item.login?.password;
    if (typeof password !== "string" || password.length === 0) {
        throw new Error(`Item ${JSON.stringify(item.name)} has no password.`);
    }
    return password;
}

export function buildFixedCommand(target, options) {
    switch (target) {
        case "gh-secret": {
            const { repo, name, env } = options;
            if (typeof repo !== "string" || !REPO_PATTERN.test(repo)) {
                throw new Error(`Invalid repository: ${JSON.stringify(repo)}. Use owner/name.`);
            }
            if (typeof name !== "string" || !SECRET_NAME_PATTERN.test(name)) {
                throw new Error(`Invalid secret name: ${JSON.stringify(name)}.`);
            }
            if (env !== undefined && (typeof env !== "string" || !ENVIRONMENT_PATTERN.test(env))) {
                throw new Error(`Invalid environment: ${JSON.stringify(env)}.`);
            }
            const args = ["secret", "set", name, "--repo", repo];
            if (env !== undefined) {
                args.push("--env", env);
            }
            return {
                file: "gh",
                args,
                appendNewline: false,
                summary: [
                    ["送信先", "GitHub Actions の secret"],
                    ["リポジトリ", repo],
                    ["環境", env ?? "(リポジトリの secret)"],
                    ["Secret 名", name],
                ],
                question: `リポジトリ ${repo} の secret ${name} に登録しますか？`,
                done: `リポジトリ ${repo} の secret ${name} に登録しました。`,
                action: "secret の登録",
            };
        }
        case "ssh-sudo": {
            const { host, ssh = "ssh" } = options;
            if (typeof host !== "string" || !HOST_PATTERN.test(host)) {
                throw new Error(`Invalid host: ${JSON.stringify(host)}.`);
            }
            if (ssh !== "ssh" && (typeof ssh !== "string" || !win32.isAbsolute(ssh) || !SSH_FILE_PATTERN.test(win32.basename(ssh)))) {
                throw new Error(`Invalid ssh executable: ${JSON.stringify(ssh)}. Give an absolute path to ssh or ssh.exe.`);
            }
            return {
                file: ssh,
                // sudo -S は標準入力の改行までをパスワードとして読み取る。
                args: ["-o", "BatchMode=yes", "--", host, "sudo -S -p '' -v"],
                appendNewline: true,
                summary: [
                    ["送信先", "リモートホストの sudo 認証"],
                    ["ホスト", host],
                    ["ssh", ssh === "ssh" ? "ssh (PATH から解決)" : ssh],
                ],
                question: `${host} で sudo の認証を更新しますか？`,
                done: `${host} で sudo の認証を更新しました。`,
                action: "sudo の認証の更新",
            };
        }
        default:
            throw new Error(`Unknown target: ${JSON.stringify(target)}. Use gh-secret or ssh-sudo.`);
    }
}

export function buildArbitraryCommand(argv) {
    if (!Array.isArray(argv) || argv.length === 0 || !argv.every((arg) => typeof arg === "string")) {
        throw new Error("Give the command as a non-empty list of arguments after --.");
    }
    if (argv[0].length === 0) {
        throw new Error("The command name is empty.");
    }
    return {
        file: argv[0],
        args: argv.slice(1),
        appendNewline: true,
        summary: [["コマンド", JSON.stringify(argv)]],
        question: "このコマンドに秘密値を渡して実行しますか？",
        done: "コマンドが終了コード 0 で終了しました。",
        action: "コマンドの実行",
    };
}

export function generateArgs(length, special) {
    const parsed = Number(length);
    if (!Number.isInteger(parsed) || parsed < MIN_GENERATED_LENGTH || parsed > MAX_GENERATED_LENGTH) {
        throw new Error(`Length must be an integer from ${MIN_GENERATED_LENGTH} to ${MAX_GENERATED_LENGTH}.`);
    }
    return ["generate", special ? "-ulns" : "-uln", "--length", String(parsed)];
}

export function buildLoginItem({ name, folderId, password }) {
    return {
        organizationId: null,
        collectionIds: null,
        folderId: folderId ?? null,
        type: 1,
        name,
        notes: null,
        favorite: false,
        fields: [],
        login: { uris: [], username: null, password, totp: null },
        secureNote: null,
        card: null,
        identity: null,
        reprompt: 0,
    };
}

export function findFolderId(folders, name) {
    if (name === undefined) {
        return null;
    }
    const match = folders.find((folder) => folder.id !== null && folder.name === name);
    if (!match) {
        throw new Error(`No folder is named ${JSON.stringify(name)}.`);
    }
    return match.id;
}

export function clientName(client) {
    return typeof client === "string" && CLIENT_PATTERN.test(client) ? client : "エージェント";
}

export function assertReason(reason) {
    if (typeof reason !== "string" || reason.trim().length === 0) {
        throw new Error("Give --reason to explain the request to the user.");
    }
    return reason.trim();
}
