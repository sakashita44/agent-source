import assert from "node:assert/strict";
import test from "node:test";
import {
    assertItemName,
    assertReason,
    buildArbitraryCommand,
    buildFixedCommand,
    buildLoginItem,
    clientName,
    findFolderId,
    findItemByName,
    generateArgs,
    passwordOf,
    summarizeItems,
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
    for (const name of ["GitHub-Token-ClaudeDesktopMCP", "Google-Account-University", "SSH-KeyPair-HomePC-202602"]) {
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
    for (const ssh of ["ssh.exe", "node.exe", "C:\\tools\\node.exe", "C:\\tools\\ssh.cmd", "C:\\tools\\ssh.exe.bat", "", 1]) {
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

test("生成する長さを制限する", () => {
    assert.deepEqual(generateArgs(32, false), ["generate", "-uln", "--length", "32"]);
    assert.deepEqual(generateArgs("64", true), ["generate", "-ulns", "--length", "64"]);
    for (const length of [15, 129, "abc", 20.5]) {
        assert.throws(() => generateArgs(length, false), /Length/, String(length));
    }
});

test("Login 項目の本文を組み立てる", () => {
    const item = buildLoginItem({ name: "Example-Token-Test", folderId: "f1", password: SECRET });
    assert.equal(item.type, 1);
    assert.equal(item.folderId, "f1");
    assert.equal(item.login.password, SECRET);
});

test("フォルダ名から ID を求める", () => {
    assert.equal(findFolderId(folders, undefined), null);
    assert.equal(findFolderId(folders, "Dev"), "f1");
    assert.throws(() => findFolderId(folders, "No Folder"), /No folder/);
    assert.throws(() => findFolderId(folders, "Missing"), /No folder/);
});

test("エージェントの名前は表示できる文字列に限る", () => {
    assert.equal(clientName("Claude Code"), "Claude Code");
    assert.equal(clientName("cc0"), "cc0");
    assert.equal(clientName("クロード 1号"), "クロード 1号");
    for (const client of [undefined, "", " Codex", "Codex\nyes", "\u001b[2J", "Codex‮", "x".repeat(41)]) {
        assert.equal(clientName(client), "エージェント", JSON.stringify(client));
    }
});

test("承認の説明を必須にする", () => {
    assert.equal(assertReason("  hp-z240 の sudo を更新する "), "hp-z240 の sudo を更新する");
    assert.throws(() => assertReason(""), /--reason/);
    assert.throws(() => assertReason(undefined), /--reason/);
});
