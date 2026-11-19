import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join, win32 } from "node:path";

export const STATE_FILE = join(homedir(), ".local", "agent-source", "state", "bitwarden-vault", "broker.json");
export const DEFAULT_IDLE_MINUTES = 15;
const MAX_IDLE_MINUTES = 12 * 60;

// Bitwarden の項目種別（CipherType）を表す数値。
const ITEM_TYPES = { 1: "login", 2: "note", 3: "card", 4: "identity", 5: "sshKey" };
// Bitwarden のカスタムフィールドの種別（FieldType）と、URI の自動入力の判定方法（UriMatchType）を表す数値。null はアプリの既定の判定方法に従うことを示す。
const FIELD_TYPES = { 0: "text", 1: "hidden", 2: "boolean", 3: "linked" };
const URI_MATCHES = { default: null, domain: 0, host: 1, startsWith: 2, exact: 3, regex: 4, never: 5 };
const LIST_DETAILS = ["uris", "username", "dates", "fields", "flags", "sshKey", "card", "passkeys"];
const COMPARE_FIELDS = ["password", "totp", "card.number", "notes"];
// bw report password-health の出力のうち、エージェントに返す項目。CLI のバージョンによって出力に情報が増えても返さないよう、許可した項目に限る。
const HEALTH_FIELDS = ["name", "passwordStrength", "reuseCount"];
const EXPOSURE_FIELDS = ["exposed", "exposedCount", "exposedError"];
const ITEM_NAME_PATTERN = /^[A-Za-z0-9]+(?:[A-Za-z0-9.]*)-(?:Token|Account|KeyPair|SymmetricKey)-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REPO_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENVIRONMENT_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const HOST_PATTERN = /^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*@)?[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const SSH_FILE_PATTERN = /^ssh(\.exe)?$/i;
// UNC パスと、Git Bash 形式のパス (/usr/bin/ssh) を除くため、ドライブ文字で始まるパスに限る。
const LOCAL_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
// 制御文字 (Cc) は端末の制御シーケンスで画面を書き換え、書式制御文字 (Cf) は双方向テキストの制御で表示順を入れ替える。
const UNSAFE_DISPLAY_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;
const CLIENT_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,39}$/u;
const MIN_GENERATED_LENGTH = 16;
const MAX_GENERATED_LENGTH = 128;
const MIN_GENERATED_WORDS = 3;
const MAX_GENERATED_WORDS = 20;

export function assertItemName(name) {
    if (typeof name !== "string" || !ITEM_NAME_PATTERN.test(name)) {
        throw new Error(`Item name does not follow the naming rule {Service}-{Token|Account|KeyPair|SymmetricKey}-{Label}: ${JSON.stringify(name)}`);
    }
    return name;
}

export function listDetails(value) {
    if (value === undefined) {
        return [];
    }
    const details = String(value).split(",").map((detail) => detail.trim()).filter((detail) => detail.length > 0);
    const unknown = details.filter((detail) => !LIST_DETAILS.includes(detail));
    if (unknown.length > 0) {
        throw new Error(`Unknown --with value: ${unknown.join(", ")}. Use ${LIST_DETAILS.join(", ")}.`);
    }
    return [...new Set(details)];
}

function nonEmpty(value) {
    return typeof value === "string" && value.length > 0;
}

function fieldTypeName(type) {
    return FIELD_TYPES[type] ?? `unknown(${type})`;
}

function matchName(match) {
    const name = Object.keys(URI_MATCHES).find((key) => URI_MATCHES[key] === (match ?? null));
    return name ?? `unknown(${match})`;
}

// 下 4 桁が番号の大半を占める短い値では番号そのものを返すことになるため、ISO/IEC 7812 のカード番号の最短桁数（8 桁）に満たない値や数字以外を含む値では返さない。
const MIN_CARD_NUMBER_DIGITS = 8;

function cardLast4(number) {
    if (typeof number !== "string") {
        return null;
    }
    const digits = number.replace(/[\s-]+/g, "");
    return /^\d+$/.test(digits) && digits.length >= MIN_CARD_NUMBER_DIGITS ? digits.slice(-4) : null;
}

// Bitwarden の fido2Credentials では、discoverable が真偽値ではなく文字列（"true" / "false"）で格納される場合がある。
function discoverableFlag(value) {
    if (value === true || value === "true") {
        return true;
    }
    if (value === false || value === "false") {
        return false;
    }
    return null;
}

const DETAIL_BUILDERS = {
    uris: (item) => ({ uris: (item.login?.uris ?? []).map((uri) => ({ uri: uri.uri, match: matchName(uri.match) })) }),
    username: (item) => ({ username: item.login?.username ?? null }),
    dates: (item) => ({
        created: item.creationDate ?? null,
        revised: item.revisionDate ?? null,
        passwordRevised: item.login?.passwordRevisionDate ?? null,
    }),
    fields: (item) => ({ fields: (item.fields ?? []).map((field) => ({ name: field.name, type: fieldTypeName(field.type) })) }),
    flags: (item) => ({
        hasNotes: nonEmpty(item.notes),
        hasTotp: nonEmpty(item.login?.totp),
        favorite: item.favorite === true,
        reprompt: item.reprompt === 1,
    }),
    // 秘密鍵（sshKey.privateKey）は返さず、公開鍵とフィンガープリントに限る。
    sshKey: (item) => ({
        sshKey: item.sshKey ? { publicKey: item.sshKey.publicKey ?? null, keyFingerprint: item.sshKey.keyFingerprint ?? null } : null,
    }),
    // カード番号の全桁（number）とセキュリティコード（code）は返さず、メタデータと下 4 桁に限る。
    card: (item) => ({
        card: item.card ? {
            brand: item.card.brand ?? null,
            cardholderName: item.card.cardholderName ?? null,
            expMonth: item.card.expMonth ?? null,
            expYear: item.card.expYear ?? null,
            last4: cardLast4(item.card.number),
        } : null,
    }),
    // fido2Credentials には秘密鍵（keyValue）や WebAuthn の識別子・署名カウンタ（credentialId, userHandle, counter）も含まれるため、公開属性に限って返す。
    passkeys: (item) => ({
        passkeys: (item.login?.fido2Credentials ?? []).map((cred) => ({
            rpId: cred.rpId ?? null,
            rpName: cred.rpName ?? null,
            userName: cred.userName ?? null,
            userDisplayName: cred.userDisplayName ?? null,
            discoverable: discoverableFlag(cred.discoverable),
            created: cred.creationDate ?? null,
        })),
    }),
};

export function summarizeItems(items, folders, details = []) {
    const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));
    return items
        .filter((item) => !item.deletedDate)
        .map((item) => Object.assign(
            {
                name: item.name,
                folder: item.folderId ? folderNames.get(item.folderId) ?? null : null,
                type: ITEM_TYPES[item.type] ?? `unknown(${item.type})`,
                hasPassword: nonEmpty(item.login?.password),
            },
            ...details.map((detail) => DETAIL_BUILDERS[detail](item)),
        ))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function noteContents(item) {
    const fields = (item.fields ?? []).map((field) => {
        const type = fieldTypeName(field.type);
        // 隠しフィールドには API キーなどの秘密値が格納されるため、値は text と boolean に限って返す。
        return type === "text" || type === "boolean" ? { name: field.name, type, value: field.value ?? null } : { name: field.name, type };
    });
    return { name: item.name, notes: nonEmpty(item.notes) ? item.notes : null, fields };
}

// メモとテキストのフィールドにはリカバリーコードなどの秘密値が書かれることがあるため、値がある場合に限り承認を求める。
export function needsNoteApproval(contents) {
    return contents.notes !== null || contents.fields.some((field) => field.type === "text" && nonEmpty(field.value));
}

export function parseUris(json) {
    let uris;
    try {
        uris = JSON.parse(json);
    } catch {
        throw new Error("--uris must be a JSON array such as [{\"uri\":\"https://example.com\",\"match\":\"host\"}].");
    }
    if (!Array.isArray(uris)) {
        throw new Error("--uris must be a JSON array.");
    }
    return uris.map((entry) => {
        const { uri, match = "default" } = entry ?? {};
        if (!nonEmpty(uri)) {
            throw new Error(`Each URI needs a non-empty "uri": ${JSON.stringify(entry)}.`);
        }
        if (!Object.hasOwn(URI_MATCHES, match)) {
            throw new Error(`Unknown match ${JSON.stringify(match)}. Use ${Object.keys(URI_MATCHES).join(", ")}.`);
        }
        return { uri, match };
    });
}

export function describeUris(uris) {
    return uris.length === 0 ? ["(なし)"] : uris.map(({ uri, match }) => `${uri} (判定: ${typeof match === "string" ? match : matchName(match)})`);
}

// folderId は undefined で変更なし、null でフォルダなしを表す。
export function applyEdit(item, { name, notes, appendNotes, uris, username, folderId }) {
    if (notes !== undefined && appendNotes !== undefined) {
        throw new Error("Give either --notes or --append-notes, not both.");
    }
    if ([name, notes, appendNotes, uris, username, folderId].every((change) => change === undefined)) {
        throw new Error("Give at least one of --rename, --notes, --append-notes, --uris, --username, --folder, or --no-folder.");
    }
    if (uris !== undefined && item.type !== 1) {
        throw new Error(`Item ${JSON.stringify(item.name)} is not a login item, so it has no URIs.`);
    }
    if (username !== undefined && item.type !== 1) {
        throw new Error(`Item ${JSON.stringify(item.name)} is not a login item, so it has no username.`);
    }
    const edited = structuredClone(item);
    if (name !== undefined) {
        if (!nonEmpty(name.trim())) {
            throw new Error("--rename must not be empty.");
        }
        edited.name = name.trim();
    }
    if (notes !== undefined) {
        edited.notes = nonEmpty(notes) ? notes : null;
    }
    if (appendNotes !== undefined) {
        if (!nonEmpty(appendNotes)) {
            throw new Error("--append-notes must not be empty.");
        }
        edited.notes = nonEmpty(item.notes) ? `${item.notes}\n${appendNotes}` : appendNotes;
    }
    if (uris !== undefined) {
        edited.login.uris = uris.map(({ uri, match }) => ({ match: URI_MATCHES[match], uri }));
    }
    if (username !== undefined) {
        edited.login.username = usernameValue(username);
    }
    if (folderId !== undefined) {
        edited.folderId = folderId;
    }
    return edited;
}

export function usernameValue(username) {
    if (username === undefined) {
        return null;
    }
    const trimmed = String(username).trim();
    return nonEmpty(trimmed) ? trimmed : null;
}

// 照合を省略した場合も bw は exposed: false を出力するため、照合した場合に限って漏えいの項目を返し、未照合を「該当なし」と誤読させない。
export function summarizeHealth(report, { exposed = false } = {}) {
    if (!Array.isArray(report)) {
        throw new Error("bw report password-health returned an unexpected format.");
    }
    const keys = exposed ? [...HEALTH_FIELDS, ...EXPOSURE_FIELDS] : HEALTH_FIELDS;
    return report
        .map((entry) => Object.fromEntries(keys.filter((key) => Object.hasOwn(entry, key)).map((key) => [key, entry[key]])))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
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

export function matchesSearch(name, search) {
    return typeof search !== "string" || search.length === 0 || name.toLowerCase().includes(search.toLowerCase());
}

export function assertItemSelection({ names, search, all }, { minNamed = 1 } = {}) {
    if (Array.isArray(names) && names.length > 0) {
        if (minNamed > 1) {
            uniqueNames(names);
            if (names.length < minNamed) {
                throw new Error(`Give at least two --item values to compare.`);
            }
        }
        return;
    }
    if (all === true || (typeof search === "string" && search.length > 0)) {
        return;
    }
    throw new Error("Give --item, --search, or --all to choose the items.");
}

export function selectItems(items, { names, search, all }, options) {
    assertItemSelection({ names, search, all }, options);
    if (Array.isArray(names) && names.length > 0) {
        return names.map((name) => findItemByName(items, name));
    }
    return items.filter((item) => !item.deletedDate && matchesSearch(item.name, search));
}

export function compareFields(value) {
    if (value === undefined || value === null) {
        throw new Error("Give at least one --field.");
    }
    const rawValues = Array.isArray(value) ? value : [value];
    const fields = rawValues
        .flatMap((entry) => String(entry).split(","))
        .map((field) => field.trim())
        .filter((field) => field.length > 0);
    if (fields.length === 0) {
        throw new Error("Give at least one --field.");
    }
    for (const field of fields) {
        if (field.startsWith("field:")) {
            if (field.slice("field:".length).length === 0) {
                throw new Error('Custom field name after "field:" must not be empty.');
            }
            continue;
        }
        if (!COMPARE_FIELDS.includes(field)) {
            throw new Error(`Unknown --field value: ${field}. Use ${COMPARE_FIELDS.join(", ")}, or field:<name>.`);
        }
    }
    return [...new Set(fields)];
}

function extractCompareValue(item, field) {
    if (field === "password") {
        return nonEmpty(item.login?.password) ? item.login.password : null;
    }
    if (field === "totp") {
        return nonEmpty(item.login?.totp) ? item.login.totp : null;
    }
    if (field === "card.number") {
        if (typeof item.card?.number !== "string") {
            return null;
        }
        const normalized = item.card.number.replace(/[\s-]+/g, "");
        return normalized.length > 0 ? normalized : null;
    }
    if (field === "notes") {
        return nonEmpty(item.notes) ? item.notes.replace(/\r\n/g, "\n") : null;
    }
    if (field.startsWith("field:")) {
        const customName = field.slice("field:".length);
        // Bitwarden は 1 つの項目に同名のカスタムフィールドを複数持てるため、値が空でない最初の項目を対象にする。
        const match = (item.fields ?? []).find((entry) => entry.name === customName && nonEmpty(entry.value));
        return match ? match.value : null;
    }
    throw new Error(`Unknown --field value: ${field}.`);
}

export function compareItems(items, fields) {
    const resultFields = {};
    for (const field of fields) {
        const byValue = new Map();
        const missing = [];
        for (const item of items) {
            const value = extractCompareValue(item, field);
            if (value === null) {
                missing.push(item.name);
                continue;
            }
            const group = byValue.get(value) ?? [];
            group.push(item.name);
            byValue.set(value, group);
        }
        const groups = [...byValue.values()]
            .filter((group) => group.length >= 2)
            .map((group) => group.sort((a, b) => a.localeCompare(b)))
            .sort((a, b) => a[0].localeCompare(b[0]));
        missing.sort((a, b) => a.localeCompare(b));
        resultFields[field] = { groups, missing };
    }
    // groups と missing は項目名で示すため、同名の項目が対象にあると別々の項目を区別できない。その名前を示し、利用者に改名を依頼できるようにする。
    const duplicateNames = [...new Set(items.map((item) => item.name).filter((name, index, names) => names.indexOf(name) !== index))]
        .sort((a, b) => a.localeCompare(b));
    return { itemCount: items.length, duplicateNames, fields: resultFields };
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
            if (ssh !== "ssh" && (typeof ssh !== "string" || !LOCAL_DRIVE_PATH_PATTERN.test(ssh) || !SSH_FILE_PATTERN.test(win32.basename(ssh)))) {
                throw new Error(`Invalid ssh executable: ${JSON.stringify(ssh)}. Give a Windows path to ssh.exe that starts with a drive letter, such as C:\\Windows\\System32\\OpenSSH\\ssh.exe.`);
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

export function generateArgs({
    length,
    uppercase,
    lowercase,
    number,
    special,
    passphrase,
    words,
    separator,
    capitalize,
    includeNumber,
} = {}) {
    if (passphrase === true) {
        // bw generate は --passphrase 指定時に --length や文字種フラグをエラーにせず無視するため、併用をここで拒否する。
        if (length !== undefined || uppercase !== undefined || lowercase !== undefined || number !== undefined || special !== undefined) {
            throw new Error("--length, --uppercase, --lowercase, --number, and --special cannot be used with --passphrase.");
        }
        const parsedWords = Number(words ?? 4);
        // bw generate は --words が 3 未満でもエラーにせず 3 語へ丸めるため、範囲を事前に検証する。
        if (!Number.isInteger(parsedWords) || parsedWords < MIN_GENERATED_WORDS || parsedWords > MAX_GENERATED_WORDS) {
            throw new Error(`Words must be an integer from ${MIN_GENERATED_WORDS} to ${MAX_GENERATED_WORDS}.`);
        }
        const resolvedSeparator = separator ?? "-";
        // bw generate の --separator は複数文字を渡すと先頭 1 文字だけを使い、"space" と "empty" を特殊値として解釈するため、1 文字に限る。
        if (typeof resolvedSeparator !== "string" || Array.from(resolvedSeparator).length !== 1 || /[\s\p{Cc}\p{Cf}]/u.test(resolvedSeparator)) {
            throw new Error("Separator must be a single non-whitespace character.");
        }
        return [
            "generate",
            "--passphrase",
            "--words",
            String(parsedWords),
            "--separator",
            resolvedSeparator,
            ...(capitalize === true ? ["--capitalize"] : []),
            ...(includeNumber === true ? ["--includeNumber"] : []),
        ];
    }
    if (words !== undefined || separator !== undefined || capitalize === true || includeNumber === true) {
        throw new Error("--words, --separator, --capitalize, and --include-number require --passphrase.");
    }
    const parsedLength = Number(length ?? 32);
    if (!Number.isInteger(parsedLength) || parsedLength < MIN_GENERATED_LENGTH || parsedLength > MAX_GENERATED_LENGTH) {
        throw new Error(`Length must be an integer from ${MIN_GENERATED_LENGTH} to ${MAX_GENERATED_LENGTH}.`);
    }
    const useNumber = number ?? true;
    const flags = `${(uppercase ?? true) ? "u" : ""}${(lowercase ?? true) ? "l" : ""}${useNumber ? "n" : ""}${(special ?? false) ? "s" : ""}`;
    if (flags.length === 0) {
        throw new Error("Enable at least one character set (--uppercase, --lowercase, --number, or --special).");
    }
    // bw generate は -n を省いても数字の最小文字数（--minNumber）の既定値 1 により数字を含めるため、数字を除く場合は 0 を明示する。
    return ["generate", `-${flags}`, ...(useNumber ? [] : ["--minNumber", "0"]), "--length", String(parsedLength)];
}

export function buildLoginItem({ name, folderId, username, uris = [], notes, password }) {
    return {
        organizationId: null,
        collectionIds: null,
        folderId: folderId ?? null,
        type: 1,
        name,
        notes: nonEmpty(notes) ? notes : null,
        favorite: false,
        fields: [],
        login: { uris: uris.map(({ uri, match }) => ({ match: URI_MATCHES[match], uri })), username: usernameValue(username), password, totp: null },
        secureNote: null,
        card: null,
        identity: null,
        reprompt: 0,
    };
}

// bw list folders は、フォルダなしを表す「No Folder」を、空でない ID を持たない項目として含めて返す。
function namedFolders(folders) {
    return folders.filter((folder) => typeof folder.id === "string" && folder.id.length > 0);
}

export function findFolderId(folders, name) {
    if (name === undefined) {
        return null;
    }
    const named = namedFolders(folders);
    const matches = named.filter((folder) => folder.name === name);
    if (matches.length === 0) {
        throw new Error(`No folder is named ${JSON.stringify(name)}. Folders: ${named.map((folder) => JSON.stringify(folder.name)).join(", ") || "(none)"}.`);
    }
    // Bitwarden は同名のフォルダを許容する。承認画面では名前でしか区別できないため、どちらかを推測で選ばない。
    if (matches.length > 1) {
        throw new Error(`${matches.length} folders are named ${JSON.stringify(name)}. Rename them in Bitwarden so that the name is unique.`);
    }
    return matches[0].id;
}

// 存在しないフォルダは作成せずに拒否する。項目の変更の承認でフォルダまで作成すると、入力の誤りで不要なフォルダが増えるため、作成は folder-create で別に承認を得る。
export function folderChange(folders, { folder, noFolder = false }) {
    if (folder !== undefined && noFolder) {
        throw new Error("Give either --folder or --no-folder, not both.");
    }
    if (noFolder) {
        return null;
    }
    return folder === undefined ? undefined : findFolderId(folders, folder);
}

export function folderLabel(folders, folderId) {
    if (folderId === null || folderId === undefined) {
        return "(なし)";
    }
    return folders.find((folder) => folder.id === folderId)?.name ?? `(不明なフォルダ ${folderId})`;
}

// 削除されたフォルダの ID が残る項目は、summarizeItems と同じくフォルダなしとして数える。
export function summarizeFolders(items, folders) {
    const named = namedFolders(folders);
    const known = new Set(named.map((folder) => folder.id));
    const live = items.filter((item) => !item.deletedDate);
    const count = (folderId) => live.filter((item) => (known.has(item.folderId) ? item.folderId : null) === folderId).length;
    return {
        folders: named
            .map((folder) => ({ name: folder.name, items: count(folder.id) }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        unfiledItems: count(null),
    };
}

export function partitionMove(items, folderId) {
    const inPlace = (item) => (item.folderId ?? null) === folderId;
    return { targets: items.filter((item) => !inPlace(item)), unchanged: items.filter(inPlace).map((item) => item.name) };
}

// 同期後の一覧から消えた項目も、別の場所で変更された項目として扱う。
export function changedItems(items, latest) {
    const current = new Map(latest.map((item) => [item.id, item]));
    return items.filter((item) => current.get(item.id)?.revisionDate !== item.revisionDate).map((item) => item.name);
}

export function assertNewFolderName(folders, name) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!nonEmpty(trimmed)) {
        throw new Error("Give --name for the new folder.");
    }
    if (/[\p{Cc}\p{Cf}]/u.test(trimmed)) {
        throw new Error("The folder name must not contain control or format characters.");
    }
    if (namedFolders(folders).some((folder) => folder.name === trimmed)) {
        throw new Error(`A folder named ${JSON.stringify(trimmed)} already exists.`);
    }
    return trimmed;
}

export function uniqueNames(names) {
    if (!Array.isArray(names) || names.length === 0) {
        throw new Error("Give at least one --item.");
    }
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    if (duplicates.length > 0) {
        throw new Error(`--item is given more than once: ${[...new Set(duplicates)].map((name) => JSON.stringify(name)).join(", ")}.`);
    }
    return names;
}

export function idleMinutes(value) {
    if (value === undefined) {
        return DEFAULT_IDLE_MINUTES;
    }
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < DEFAULT_IDLE_MINUTES || minutes > MAX_IDLE_MINUTES) {
        throw new Error(`--idle-minutes must be an integer from ${DEFAULT_IDLE_MINUTES} to ${MAX_IDLE_MINUTES}.`);
    }
    return minutes;
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

export function displaySafe(text) {
    return String(text).replace(UNSAFE_DISPLAY_CHARACTERS, (char) => `\\u{${char.codePointAt(0).toString(16)}}`);
}

// 制御文字 (Cc) には改行も含まれるため、行に分けてから無害化し、改行だけを残す。
export function displaySafeOutput(text) {
    return String(text).replace(/\r\n/g, "\n").split("\n").map(displaySafe).join("\n");
}

// 端末の raw mode で Backspace の消去幅を合わせるため、Unicode の East Asian Width (Wide/Fullwidth) と、既定で絵文字として表示される文字（Emoji_Presentation）を 2 桁幅と判定する。
export function charDisplayWidth(char) {
    const cp = char.codePointAt(0);
    if (cp === undefined) {
        return 0;
    }
    if (/^\p{Emoji_Presentation}/u.test(char)) {
        return 2;
    }
    if (
        (cp >= 0x1100 && cp <= 0x115f)
        || cp === 0x2329
        || cp === 0x232a
        || (cp >= 0x2e80 && cp <= 0x303e)
        || (cp >= 0x3040 && cp <= 0xa4cf)
        || (cp >= 0xac00 && cp <= 0xd7a3)
        || (cp >= 0xf900 && cp <= 0xfaff)
        || (cp >= 0xfe10 && cp <= 0xfe19)
        || (cp >= 0xfe30 && cp <= 0xfe6f)
        || (cp >= 0xff01 && cp <= 0xff60)
        || (cp >= 0xffe0 && cp <= 0xffe6)
        || (cp >= 0x20000 && cp <= 0x2fffd)
        || (cp >= 0x30000 && cp <= 0x3fffd)
    ) {
        return 2;
    }
    return 1;
}

export function readState() {
    if (!existsSync(STATE_FILE)) {
        return null;
    }
    try {
        const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
        return Number.isInteger(state?.pid) ? state : null;
    } catch {
        return null;
    }
}

export function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // シグナル 0 は存在の確認だけを行う。EPERM は、送信の権限がないもののプロセスは存在することを示す。
        return error.code === "EPERM";
    }
}

export function canConnect(port) {
    return new Promise((resolve) => {
        const socket = connect({ host: "127.0.0.1", port });
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("error", () => resolve(false));
    });
}
