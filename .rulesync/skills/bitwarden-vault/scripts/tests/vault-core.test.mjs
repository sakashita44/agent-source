import assert from "node:assert/strict";
import test from "node:test";
import { run } from "../bw-vault.mjs";
import {
    applyEdit,
    assertItemName,
    assertNewFolderName,
    assertReason,
    buildArbitraryCommand,
    buildFixedCommand,
    buildLoginItem,
    changedItems,
    charDisplayWidth,
    clientName,
    compareFields,
    compareItems,
    displaySafe,
    displaySafeOutput,
    findFolderId,
    findItemByName,
    folderChange,
    folderLabel,
    generateArgs,
    idleMinutes,
    listDetails,
    needsNoteApproval,
    noteContents,
    parseUris,
    partitionMove,
    passwordOf,
    selectItems,
    summarizeFolders,
    summarizeHealth,
    summarizeItems,
    uniqueNames,
} from "../vault-core.mjs";

const SECRET = "dummy-secret-value-0123456789";

const items = [
    { id: "1", name: "GitHub-Token-ClaudeDesktopMCP", type: 1, folderId: "f1", login: { password: SECRET } },
    { id: "2", name: "Google-Account-University", type: 1, folderId: null, login: { password: "" } },
    { id: "3", name: "Recovery-Note", type: 2, folderId: "missing", notes: SECRET },
    { id: "4", name: "Deleted-Token-Old", type: 1, folderId: null, deletedDate: "2026-10-01T00:00:00Z", login: { password: SECRET } },
    { id: "5", name: "Dup-Token-A", type: 1, login: { password: SECRET } },
    { id: "6", name: "Dup-Token-A", type: 1, login: { password: SECRET } },
];
const folders = [{ id: null, name: "No Folder" }, { id: "f1", name: "Dev" }];

test("命名規則に合う項目名を受け付ける", () => {
    for (const name of ["GitHub-Token-ClaudeDesktopMCP", "Google-Account-University", "SSH-KeyPair-HomePC-202602", "API-SymmetricKey-HMAC2026"]) {
        assert.equal(assertItemName(name), name);
    }
});

test("命名規則に合わない項目名を拒否する", () => {
    for (const name of ["GitHub-token-x", "GitHub-Token-", "-Token-x", "GitHub Token x", "GitHub-Key Pair-x", "", undefined]) {
        assert.throws(() => assertItemName(name), /naming rule/, String(name));
    }
});

test("一覧は秘密値を含まず、ゴミ箱の項目を除く", () => {
    const summaries = summarizeItems(items, folders);
    assert.ok(!JSON.stringify(summaries).includes(SECRET));
    assert.deepEqual(summaries.map((item) => item.name), [
        "Dup-Token-A",
        "Dup-Token-A",
        "GitHub-Token-ClaudeDesktopMCP",
        "Google-Account-University",
        "Recovery-Note",
    ]);
    assert.deepEqual(summaries.find((item) => item.name === "GitHub-Token-ClaudeDesktopMCP"), {
        name: "GitHub-Token-ClaudeDesktopMCP",
        folder: "Dev",
        type: "login",
        hasPassword: true,
    });
    assert.equal(summaries.find((item) => item.name === "Google-Account-University").hasPassword, false);
    assert.equal(summaries.find((item) => item.name === "Recovery-Note").folder, null);
});

test("一覧の追加情報は指定したものだけを返し、値を含めない", () => {
    const item = {
        id: "7", name: "Example-Account-Main", type: 1, notes: SECRET, favorite: true, reprompt: 1,
        creationDate: "2026-01-01T00:00:00Z", revisionDate: "2026-02-01T00:00:00Z",
        login: { username: "saka", password: SECRET, totp: SECRET, passwordRevisionDate: null, uris: [{ uri: "https://example.com", match: null }, { uri: "https://a.example.com", match: 1 }] },
        fields: [{ name: "PIN", value: SECRET, type: 0 }, { name: "API", value: SECRET, type: 1 }],
    };
    assert.deepEqual(Object.keys(summarizeItems([item], [])[0]), ["name", "folder", "type", "hasPassword"]);
    const [summary] = summarizeItems([item], [], listDetails("uris,username,dates,fields,flags"));
    assert.ok(!JSON.stringify(summary).includes(SECRET));
    assert.deepEqual(summary.uris, [{ uri: "https://example.com", match: "default" }, { uri: "https://a.example.com", match: "host" }]);
    assert.equal(summary.username, "saka");
    assert.deepEqual(summary.fields, [{ name: "PIN", type: "text" }, { name: "API", type: "hidden" }]);
    assert.deepEqual([summary.hasNotes, summary.hasTotp, summary.favorite, summary.reprompt], [true, true, true, true]);
    assert.throws(() => listDetails("uris,password"), /Unknown --with/);
});

test("SSH キーの追加情報は公開鍵とフィンガープリントだけを返し、秘密鍵を含めない", () => {
    const sshItem = {
        id: "8", name: "SSH-KeyPair-HomePC", type: 5,
        sshKey: { privateKey: SECRET, publicKey: "ssh-ed25519 AAAAC3Nza dummy", keyFingerprint: "SHA256:dummyFingerprint" },
    };
    const summaries = summarizeItems([sshItem, items[0]], folders, listDetails("sshKey"));
    assert.ok(!JSON.stringify(summaries).includes(SECRET));
    const ssh = summaries.find((item) => item.name === sshItem.name);
    const login = summaries.find((item) => item.name === items[0].name);
    assert.deepEqual(ssh.sshKey, { publicKey: "ssh-ed25519 AAAAC3Nza dummy", keyFingerprint: "SHA256:dummyFingerprint" });
    assert.equal(login.sshKey, null);
});

test("カードの追加情報はメタデータと下 4 桁だけを返し、番号全桁と CVV を含めない", () => {
    const cardItem = {
        id: "11",
        name: "Corp-Card-Main",
        type: 3,
        card: {
            brand: "Visa",
            cardholderName: "TARO YAMADA",
            number: "4111-2222 3333-4567",
            expMonth: "08",
            expYear: "2029",
            code: SECRET,
        },
    };
    const shortCard = {
        id: "12",
        name: "Corp-Card-Short",
        type: 3,
        // 8 桁未満の番号では、下 4 桁が番号の大半を占める。
        card: { brand: "Other", number: "9876-543", code: SECRET },
    };
    const summaries = summarizeItems([cardItem, shortCard, items[0]], folders, listDetails("card"));
    assert.ok(!JSON.stringify(summaries).includes(SECRET));
    assert.ok(!JSON.stringify(summaries).includes("4111"));
    assert.ok(!JSON.stringify(summaries).includes("6543"));
    assert.deepEqual(summaries.find((item) => item.name === cardItem.name).card, {
        brand: "Visa",
        cardholderName: "TARO YAMADA",
        expMonth: "08",
        expYear: "2029",
        last4: "4567",
    });
    assert.deepEqual(summaries.find((item) => item.name === shortCard.name).card, {
        brand: "Other",
        cardholderName: null,
        expMonth: null,
        expYear: null,
        last4: null,
    });
    assert.equal(summaries.find((item) => item.name === items[0].name).card, null);
});

test("パスキーの追加情報は公開属性だけを返し、秘密鍵や識別子を含めない", () => {
    const passkeyItem = {
        id: "13",
        name: "GitHub-Account-Passkey",
        type: 1,
        login: {
            fido2Credentials: [
                {
                    credentialId: "cred-id-secret",
                    keyType: "public-key",
                    keyAlgorithm: "ECDSA",
                    keyCurve: "P-256",
                    keyValue: SECRET,
                    rpId: "github.com",
                    rpName: "GitHub",
                    userHandle: "user-handle-secret",
                    userName: "saka",
                    userDisplayName: "Saka",
                    counter: "5",
                    discoverable: "true",
                    creationDate: "2026-05-01T00:00:00Z",
                },
                {
                    rpId: "example.com",
                    discoverable: false,
                },
            ],
        },
    };
    const summaries = summarizeItems([passkeyItem, items[0]], folders, listDetails("passkeys"));
    const serialized = JSON.stringify(summaries);
    assert.ok(!serialized.includes(SECRET));
    assert.ok(!serialized.includes("cred-id-secret"));
    assert.ok(!serialized.includes("user-handle-secret"));
    assert.ok(!serialized.includes("counter"));
    assert.deepEqual(summaries.find((item) => item.name === passkeyItem.name).passkeys, [
        {
            rpId: "github.com",
            rpName: "GitHub",
            userName: "saka",
            userDisplayName: "Saka",
            discoverable: true,
            created: "2026-05-01T00:00:00Z",
        },
        {
            rpId: "example.com",
            rpName: null,
            userName: null,
            userDisplayName: null,
            discoverable: false,
            created: null,
        },
    ]);
    assert.deepEqual(summaries.find((item) => item.name === items[0].name).passkeys, []);
});

test("照合するフィールド指定を検証し、順序を保って重複を除く", () => {
    assert.deepEqual(compareFields("password, totp"), ["password", "totp"]);
    assert.deepEqual(compareFields(["password,card.number", "totp,password", "field:PIN"]), [
        "password",
        "card.number",
        "totp",
        "field:PIN",
    ]);
    assert.deepEqual(compareFields("notes"), ["notes"]);
    assert.throws(() => compareFields(undefined), /at least one --field/);
    assert.throws(() => compareFields([]), /at least one --field/);
    assert.throws(() => compareFields(" , "), /at least one --field/);
    assert.throws(() => compareFields("field:"), /must not be empty/);
    assert.throws(() => compareFields("field:   "), /must not be empty/);
    assert.throws(() => compareFields("username"), /Unknown --field value: username/);
});

test("秘密値の一致照合は秘密値を返さず、一致グループと未設定だけを返す", () => {
    const compareSource = [
        {
            id: "c1",
            name: "ItemB",
            type: 1,
            notes: "line1\r\nline2",
            login: { password: `${SECRET}-1`, totp: "TOTP-A" },
            fields: [{ name: "PIN", value: "", type: 1 }, { name: "PIN", value: "9999", type: 1 }],
        },
        {
            id: "c2",
            name: "ItemA",
            type: 1,
            notes: "line1\nline2",
            login: { password: `${SECRET}-1`, totp: "TOTP-UNIQUE" },
            fields: [{ name: "PIN", value: "9999", type: 0 }],
        },
        {
            id: "c3",
            name: "ItemD",
            type: 3,
            card: { number: "4111 2222-3333 4444" },
            fields: [{ name: "Flag", value: "true", type: 2 }],
        },
        {
            id: "c4",
            name: "ItemC",
            type: 3,
            card: { number: "4111-2222-3333-4444" },
            fields: [{ name: "Flag", value: "true", type: 0 }],
        },
        {
            id: "c5",
            name: "ItemE",
            type: 3,
            notes: "",
            card: { number: "  --- " },
            login: { password: `${SECRET}-UNIQUE`, totp: "" },
        },
    ];
    const result = compareItems(compareSource, ["password", "totp", "card.number", "notes", "field:PIN", "field:Flag"]);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(SECRET));
    assert.ok(!serialized.includes("TOTP-"));
    assert.ok(!serialized.includes("4111"));
    assert.ok(!serialized.includes("9999"));
    assert.ok(!serialized.includes("line1"));
    assert.equal(result.itemCount, 5);
    assert.deepEqual(result.fields.password, {
        groups: [["ItemA", "ItemB"]],
        missing: ["ItemC", "ItemD"],
    });
    assert.deepEqual(result.fields.totp, {
        groups: [],
        missing: ["ItemC", "ItemD", "ItemE"],
    });
    assert.deepEqual(result.fields["card.number"], {
        groups: [["ItemC", "ItemD"]],
        missing: ["ItemA", "ItemB", "ItemE"],
    });
    assert.deepEqual(result.fields.notes, {
        groups: [["ItemA", "ItemB"]],
        missing: ["ItemC", "ItemD", "ItemE"],
    });
    assert.deepEqual(result.fields["field:PIN"], {
        groups: [["ItemA", "ItemB"]],
        missing: ["ItemC", "ItemD", "ItemE"],
    });
    assert.deepEqual(result.fields["field:Flag"], {
        groups: [["ItemC", "ItemD"]],
        missing: ["ItemA", "ItemB", "ItemE"],
    });
    assert.deepEqual(result.duplicateNames, []);
    assert.deepEqual(compareItems([], ["password"]), { itemCount: 0, duplicateNames: [], fields: { password: { groups: [], missing: [] } } });
    assert.deepEqual(compareItems([compareSource[0]], ["password"]), { itemCount: 1, duplicateNames: [], fields: { password: { groups: [], missing: [] } } });
});

test("照合の対象に同名の項目があると、その名前を duplicateNames で示す", () => {
    const login = (id, name, password) => ({ id, name, type: 1, login: { password } });
    const result = compareItems(
        [login("d1", "Svc-Token-B", "x"), login("d2", "Svc-Token-A", "x"), login("d3", "Svc-Token-B", "y"), login("d4", "Svc-Token-A", "x"), login("d5", "Svc-Token-B", "z")],
        ["password"],
    );
    assert.deepEqual(result.duplicateNames, ["Svc-Token-A", "Svc-Token-B"]);
    // 同名の項目同士の一致は、groups では同じ名前の並びとしてしか表せない。duplicateNames はその判別のために返す。
    assert.deepEqual(result.fields.password.groups, [["Svc-Token-A", "Svc-Token-A", "Svc-Token-B"]]);
});

test("照合とメモの対象指定は名前・検索語・全件を解決し、ゴミ箱を除く", () => {
    assert.deepEqual(selectItems(items, { names: ["GitHub-Token-ClaudeDesktopMCP"] }).map((item) => item.id), ["1"]);
    assert.deepEqual(selectItems(items, { search: "token" }).map((item) => item.name), [
        "GitHub-Token-ClaudeDesktopMCP",
        "Dup-Token-A",
        "Dup-Token-A",
    ]);
    assert.equal(selectItems(items, { all: true }).length, 5);
    assert.throws(() => selectItems(items, {}), /Give --item, --search, or --all/);
    assert.throws(() => selectItems(items, { names: ["GitHub-Token-ClaudeDesktopMCP"] }, { minNamed: 2 }), /at least two --item/);
    assert.throws(() => selectItems(items, { names: ["GitHub-Token-ClaudeDesktopMCP", "GitHub-Token-ClaudeDesktopMCP"] }, { minNamed: 2 }), /more than once/);
});

test("メモとテキストのフィールドが空の項目だけを承認なしで返せる", () => {
    const empty = noteContents({ name: "A", notes: null, fields: [{ name: "Remember", value: "true", type: 2 }, { name: "API", value: SECRET, type: 1 }] });
    assert.equal(needsNoteApproval(empty), false);
    assert.ok(!JSON.stringify(empty).includes(SECRET));
    assert.equal(needsNoteApproval(noteContents({ name: "B", notes: SECRET })), true);
    assert.equal(needsNoteApproval(noteContents({ name: "C", notes: "", fields: [{ name: "PIN", value: SECRET, type: 0 }] })), true);
});

test("項目の変更は名前、メモ、URI 以外を保つ", () => {
    const item = {
        id: "8", type: 1, name: "Old-Token-X", notes: "1 行目", revisionDate: "r1", fields: [{ name: "API", value: SECRET, type: 1 }],
        passwordHistory: [{ password: SECRET }],
        login: { username: "saka", password: SECRET, totp: null, fido2Credentials: [{ id: "k" }], uris: [{ match: null, uri: "https://old.example.com" }] },
    };
    const edited = applyEdit(item, { name: " New-Token-X ", appendNotes: "2 行目", uris: parseUris('[{"uri":"https://new.example.com","match":"exact"}]') });
    assert.equal(edited.name, "New-Token-X");
    assert.equal(edited.notes, "1 行目\n2 行目");
    assert.deepEqual(edited.login.uris, [{ match: 3, uri: "https://new.example.com" }]);
    const strip = ({ name, notes, login: { uris, ...login }, ...rest }) => ({ ...rest, login });
    assert.deepEqual(strip(edited), strip(item));
    assert.equal(item.name, "Old-Token-X");
    assert.equal(applyEdit(item, { notes: "" }).notes, null);
    assert.throws(() => applyEdit(item, {}), /at least one/);
    assert.throws(() => applyEdit(item, { notes: "a", appendNotes: "b" }), /either/);
    assert.throws(() => applyEdit({ ...item, type: 2 }, { uris: [] }), /not a login/);
    assert.throws(() => parseUris('[{"uri":"https://x","match":"fuzzy"}]'), /Unknown match/);
});

test("項目の変更でユーザー名とフォルダを変え、秘密値を保つ", () => {
    const item = {
        id: "9", type: 1, name: "Host-Account-X", folderId: "f1", fields: [{ name: "API", value: SECRET, type: 1 }],
        passwordHistory: [{ password: SECRET }],
        login: { username: "old", password: SECRET, totp: SECRET, fido2Credentials: [{ id: "k" }], uris: [] },
    };
    const edited = applyEdit(item, { username: " vpnuser ", folderId: null });
    assert.equal(edited.login.username, "vpnuser");
    assert.equal(edited.folderId, null);
    const strip = ({ folderId, login: { username, ...login }, ...rest }) => ({ ...rest, login });
    assert.deepEqual(strip(edited), strip(item));
    assert.equal(item.login.username, "old");
    assert.equal(applyEdit(item, { username: "" }).login.username, null);
    assert.equal(applyEdit(item, { folderId: "f2" }).folderId, "f2");
    assert.equal(applyEdit(item, { name: "Host-Account-Y" }).folderId, "f1");
    const sshKey = { id: "10", type: 5, name: "Home-KeyPair-X", folderId: null, sshKey: { privateKey: SECRET } };
    assert.equal(applyEdit(sshKey, { folderId: "f1" }).folderId, "f1");
    assert.throws(() => applyEdit(sshKey, { username: "x" }), /not a login/);
});

test("フォルダの変更はフォルダなしと既存のフォルダに限る", () => {
    assert.equal(folderChange(folders, {}), undefined);
    assert.equal(folderChange(folders, { noFolder: true }), null);
    assert.equal(folderChange(folders, { folder: "Dev" }), "f1");
    assert.throws(() => folderChange(folders, { folder: "Missing" }), /No folder/);
    assert.throws(() => folderChange(folders, { folder: "Dev", noFolder: true }), /either/);
    assert.equal(folderLabel(folders, "f1"), "Dev");
    assert.equal(folderLabel(folders, null), "(なし)");
    assert.match(folderLabel(folders, "gone"), /不明/);
});

test("生成する項目にユーザー名、URI、メモを登録する", () => {
    const item = buildLoginItem({
        name: "A-Account-B", password: SECRET, username: " vpnuser ", folderId: "f1",
        uris: parseUris('[{"uri":"https://vpn.example.com","match":"host"},{"uri":"https://x.example.com"}]'), notes: "用途: VPN",
    });
    assert.equal(item.login.username, "vpnuser");
    assert.equal(item.folderId, "f1");
    assert.deepEqual(item.login.uris, [{ match: 1, uri: "https://vpn.example.com" }, { match: null, uri: "https://x.example.com" }]);
    assert.equal(item.notes, "用途: VPN");
    assert.equal(item.login.password, SECRET);
    const bare = buildLoginItem({ name: "A-Account-B", password: SECRET, notes: "" });
    assert.equal(bare.login.username, null);
    assert.deepEqual(bare.login.uris, []);
    assert.equal(bare.notes, null);
    assert.equal(bare.folderId, null);
});

test("フォルダ一覧は空のフォルダも含め、ゴミ箱の項目を除き、削除されたフォルダの項目をフォルダなしとして数える", () => {
    const summary = summarizeFolders(items, [...folders, { id: "f2", name: "Empty" }]);
    assert.deepEqual(summary, { folders: [{ name: "Dev", items: 1 }, { name: "Empty", items: 0 }], unfiledItems: 4 });
    assert.ok(!JSON.stringify(summary).includes(SECRET));
});

test("作成するフォルダの名前は空でなく、既存のフォルダと重ならない", () => {
    assert.equal(assertNewFolderName(folders, " 自宅サービス "), "自宅サービス");
    assert.equal(assertNewFolderName(folders, "Servers/VPN"), "Servers/VPN");
    assert.throws(() => assertNewFolderName(folders, "Dev"), /already exists/);
    assert.throws(() => assertNewFolderName(folders, " "), /Give --name/);
    assert.throws(() => assertNewFolderName(folders, undefined), /Give --name/);
    assert.throws(() => assertNewFolderName(folders, "A‮B"), /control or format/);
    assert.throws(() => assertNewFolderName(folders, "A\nB"), /control or format/);
});

test("一括移動の対象は重複なく 1 件以上に限る", () => {
    assert.deepEqual(uniqueNames(["A", "B"]), ["A", "B"]);
    assert.throws(() => uniqueNames([]), /at least one/);
    assert.throws(() => uniqueNames(undefined), /at least one/);
    assert.throws(() => uniqueNames(["A", "B", "A"]), /more than once: "A"/);
});

test("一括移動ではすでに移動先にある項目を変更しない", () => {
    const selected = [{ id: "1", name: "A", folderId: "f1" }, { id: "2", name: "B", folderId: null }, { id: "3", name: "C" }];
    assert.deepEqual(partitionMove(selected, "f1"), { targets: [selected[1], selected[2]], unchanged: ["A"] });
    assert.deepEqual(partitionMove(selected, null), { targets: [selected[0]], unchanged: ["B", "C"] });
});

test("承認を待つ間に変更または削除された項目を見つける", () => {
    const targets = [{ id: "1", name: "A", revisionDate: "r1" }, { id: "2", name: "B", revisionDate: "r1" }, { id: "3", name: "C", revisionDate: "r1" }];
    assert.deepEqual(changedItems(targets, [{ id: "1", revisionDate: "r1" }, { id: "2", revisionDate: "r2" }]), ["B", "C"]);
    assert.deepEqual(changedItems(targets, targets), []);
});

test("健全性の報告から許可したフィールドだけを残す", () => {
    const report = [{ object: "password-health", id: "1", name: "A", passwordStrength: 1, reuseCount: 2, exposed: false, password: SECRET }];
    assert.deepEqual(summarizeHealth(report)[0], { name: "A", passwordStrength: 1, reuseCount: 2 });
    assert.deepEqual(summarizeHealth(report, { exposed: true })[0], { name: "A", passwordStrength: 1, reuseCount: 2, exposed: false });
});

test("項目名の完全一致で 1 件に絞る", () => {
    assert.equal(findItemByName(items, "GitHub-Token-ClaudeDesktopMCP").id, "1");
    assert.throws(() => findItemByName(items, "GitHub-Token"), /No item/);
    assert.throws(() => findItemByName(items, "Deleted-Token-Old"), /No item/);
    assert.throws(() => findItemByName(items, "Dup-Token-A"), /2 items/);
});

test("エラーメッセージに秘密値を含めない", () => {
    assert.throws(() => passwordOf(items[1]), (error) => !error.message.includes(SECRET) && /no password/.test(error.message));
    assert.throws(() => passwordOf(items[2]), (error) => !error.message.includes(SECRET));
    assert.equal(passwordOf(items[0]), SECRET);
});

test("gh-secret のコマンドを組み立てる", () => {
    const plan = buildFixedCommand("gh-secret", { repo: "sakashita44/agent-source", name: "NOTION_API_KEY" });
    assert.equal(plan.file, "gh");
    assert.deepEqual(plan.args, ["secret", "set", "NOTION_API_KEY", "--repo", "sakashita44/agent-source"]);
    assert.equal(plan.appendNewline, false);
    const withEnv = buildFixedCommand("gh-secret", { repo: "o/r", name: "KEY", env: "production" });
    assert.deepEqual(withEnv.args.slice(-2), ["--env", "production"]);
});

test("ssh-sudo のコマンドを組み立てる", () => {
    const plan = buildFixedCommand("ssh-sudo", { host: "hp-z240" });
    assert.equal(plan.file, "ssh");
    assert.deepEqual(plan.args, ["-o", "BatchMode=yes", "--", "hp-z240", "sudo -S -p '' -v"]);
    assert.equal(plan.appendNewline, true);
    const openssh = "C:\\Windows\\System32\\OpenSSH\\ssh.exe";
    const withSsh = buildFixedCommand("ssh-sudo", { host: "hp-z240", ssh: openssh });
    assert.equal(withSsh.file, openssh);
    assert.ok(withSsh.summary.some(([, value]) => value === openssh));
});

test("ssh の実行ファイルは ssh または ssh.exe の絶対パスに限る", () => {
    for (const ssh of ["ssh.exe", "/usr/bin/ssh", "\\\\server\\share\\ssh.exe", "C:\\tools\\node.exe", "C:\\tools\\ssh.cmd", "C:\\tools\\ssh.exe.bat", "", 1]) {
        assert.throws(() => buildFixedCommand("ssh-sudo", { host: "hp-z240", ssh }), /ssh executable/, String(ssh));
    }
    assert.equal(buildFixedCommand("ssh-sudo", { host: "h", ssh: "C:\\Program Files\\Git\\usr\\bin\\ssh.exe" }).file, "C:\\Program Files\\Git\\usr\\bin\\ssh.exe");
});

test("固定の送信先の引数でオプションやシェルの解釈を招く値を拒否する", () => {
    assert.throws(() => buildFixedCommand("gh-secret", { repo: "--web", name: "KEY" }), /repository/);
    assert.throws(() => buildFixedCommand("gh-secret", { repo: "o/r", name: "KEY; rm" }), /secret name/);
    assert.throws(() => buildFixedCommand("gh-secret", { repo: "o/r", name: "KEY", env: "--x" }), /environment/);
    assert.throws(() => buildFixedCommand("ssh-sudo", { host: "-oProxyCommand=calc" }), /host/);
    assert.throws(() => buildFixedCommand("ssh-sudo", { host: "a b" }), /host/);
    assert.throws(() => buildFixedCommand("ssh-sudo", {}), /host/);
    assert.throws(() => buildFixedCommand("scp", {}), /Unknown target/);
});

test("任意のコマンドは引数の配列で受け取る", () => {
    const plan = buildArbitraryCommand(["smbpasswd", "-s", "-a", "saka"]);
    assert.equal(plan.file, "smbpasswd");
    assert.deepEqual(plan.args, ["-s", "-a", "saka"]);
    assert.equal(plan.appendNewline, true);
    assert.ok(plan.summary.some(([, value]) => value === JSON.stringify(["smbpasswd", "-s", "-a", "saka"])));
    assert.throws(() => buildArbitraryCommand([]), /non-empty/);
    assert.throws(() => buildArbitraryCommand("ssh host cat"), /non-empty/);
    assert.throws(() => buildArbitraryCommand([""]), /empty/);
});

test("生成するパスワードとパスフレーズのオプションを検証する", () => {
    assert.deepEqual(generateArgs(), ["generate", "-uln", "--length", "32"]);
    assert.deepEqual(generateArgs({ length: 32, special: false }), ["generate", "-uln", "--length", "32"]);
    assert.deepEqual(generateArgs({ length: "64", special: true }), ["generate", "-ulns", "--length", "64"]);
    assert.deepEqual(generateArgs({ uppercase: false, number: false, special: true }), ["generate", "-ls", "--minNumber", "0", "--length", "32"]);
    assert.throws(() => generateArgs({ uppercase: false, lowercase: false, number: false, special: false }), /at least one character set/);
    for (const length of [15, 129, "abc", 20.5]) {
        assert.throws(() => generateArgs({ length, special: false }), /Length/, String(length));
    }

    assert.deepEqual(generateArgs({ passphrase: true }), ["generate", "--passphrase", "--words", "4", "--separator", "-"]);
    assert.deepEqual(generateArgs({
        passphrase: true,
        words: "6",
        separator: "_",
        capitalize: true,
        includeNumber: true,
    }), ["generate", "--passphrase", "--words", "6", "--separator", "_", "--capitalize", "--includeNumber"]);
    assert.deepEqual(generateArgs({ passphrase: true, words: 3 }), ["generate", "--passphrase", "--words", "3", "--separator", "-"]);
    assert.deepEqual(generateArgs({ passphrase: true, words: 20 }), ["generate", "--passphrase", "--words", "20", "--separator", "-"]);
    for (const words of [2, 21, 4.5, "abc"]) {
        assert.throws(() => generateArgs({ passphrase: true, words }), /Words/, String(words));
    }
    for (const separator of ["", "--", " ", "\t", "\n", "\u00a0", "\u001b"]) {
        assert.throws(() => generateArgs({ passphrase: true, separator }), /Separator/, JSON.stringify(separator));
    }
    for (const option of [{ words: 4 }, { separator: "_" }, { capitalize: true }, { includeNumber: true }]) {
        assert.throws(() => generateArgs(option), /require --passphrase/);
    }
    for (const option of [{ length: 32 }, { uppercase: false }, { lowercase: true }, { number: false }, { special: true }]) {
        assert.throws(() => generateArgs({ passphrase: true, ...option }), /cannot be used with --passphrase/);
    }
});

test("フォルダ名から ID を求める", () => {
    assert.equal(findFolderId(folders, undefined), null);
    assert.equal(findFolderId(folders, "Dev"), "f1");
    assert.throws(() => findFolderId(folders, "No Folder"), /No folder/);
    assert.throws(() => findFolderId(folders, "Missing"), /No folder.*Folders: "Dev"\./);
    assert.throws(() => findFolderId([...folders, { id: "f9", name: "Dev" }], "Dev"), /2 folders are named "Dev"/);
});

test("ID のない「No Folder」を実在のフォルダとして扱わない", () => {
    const withoutId = [{ object: "folder", name: "No Folder" }, { id: "f1", name: "Dev" }];
    assert.throws(() => findFolderId(withoutId, "No Folder"), /No folder.*Folders: "Dev"\./);
    assert.throws(() => folderChange(withoutId, { folder: "No Folder" }), /No folder/);
    assert.deepEqual(summarizeFolders([], withoutId).folders, [{ name: "Dev", items: 0 }]);
    assert.equal(assertNewFolderName(withoutId, "No Folder"), "No Folder");
});

test("エージェントの名前は表示できる文字列に限る", () => {
    assert.equal(clientName("Claude Code"), "Claude Code");
    assert.equal(clientName("cc0"), "cc0");
    assert.equal(clientName("クロード 1号"), "クロード 1号");
    for (const client of [undefined, "", " Codex", "Codex\nyes", "\u001b[2J", "Codex‮", "x".repeat(41)]) {
        assert.equal(clientName(client), "エージェント", JSON.stringify(client));
    }
});

test("ロックまでの時間は 15 分から 12 時間に限る", () => {
    assert.equal(idleMinutes(undefined), 15);
    assert.equal(idleMinutes("720"), 720);
    for (const value of ["14", "721", "60.5", "abc", ""]) {
        assert.throws(() => idleMinutes(value), /--idle-minutes/, value);
    }
});

test("承認の説明を必須にする", () => {
    assert.equal(assertReason("  hp-z240 の sudo を更新する "), "hp-z240 の sudo を更新する");
    assert.throws(() => assertReason(""), /--reason/);
    assert.throws(() => assertReason(undefined), /--reason/);
});

test("画面へ表示する文字列から端末の制御と書式制御の文字を取り除く", () => {
    const shown = displaySafe("説明\u001b[2J\u001b[H偽の表示\n\u009b2J‮exe.sbat⁦");
    assert.ok(!/[\p{Cc}\p{Cf}]/u.test(shown));
    assert.equal(displaySafe("hp-z240 の sudo を更新する"), "hp-z240 の sudo を更新する");
    const output = displaySafeOutput("1 行目\r\n\u001b[30;40m2 行目\r上書き\n");
    assert.equal(output.split("\n").length, 3);
    assert.ok(!/[\p{Cc}\p{Cf}]/u.test(output.replaceAll("\n", "")));
});

test("端末の表示幅は半角文字を 1、全角文字と絵文字を 2 と数える", () => {
    assert.equal(charDisplayWidth(""), 0);
    // © と ☺ は既定で文字として表示されるため、絵文字の符号位置の近くにあっても 1 桁幅である。
    for (const ch of ["a", "1", "-", "ｱ", "©", "☺"]) {
        assert.equal(charDisplayWidth(ch), 1, ch);
    }
    for (const ch of ["あ", "漢", "！", "　", "한", "🔑", "✅", "⌚", "🀄", "🫠"]) {
        assert.equal(charDisplayWidth(ch), 2, ch);
    }
});

test("generate で --x と --no-x を同時に指定すると拒否する", async () => {
    for (const name of ["uppercase", "lowercase", "number"]) {
        await assert.rejects(
            run(["generate", "--name", "Svc-Token-Test", `--${name}`, `--no-${name}`, "--reason", "test"]),
            new RegExp(`either --${name} or --no-${name}`),
        );
    }
});

