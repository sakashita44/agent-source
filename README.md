# agent-source

`agent-source` は、複数のエージェント環境へ配布するルール、Skill、CLI 参照、MCP 設定を Rulesync の入力として管理するリポジトリである。リポジトリ内の入力を正本とし、各環境へ生成されたファイルは編集元として扱わない。

## 正本と責務

- `rulesync.jsonc`: 生成対象と配布する機能を定める
- `.rulesync/rules/`: 全環境に共通する規則と、エージェントごとのサブエージェント利用規則を収める
- `.rulesync/skills/`: 実装、成果物、文章、検証、Git、サブエージェント利用の原則を Skill 単位で収める
- `.rulesync/skills/subagent/references/`: 各 CLI やエージェント機能を使うための環境別参照を収める
- `.rulesync/mcp.jsonc`: 配布する MCP 設定を定める
- `scripts/verify.ps1`: 隔離した一時ホームへ生成し、設定の非破壊性と生成結果を検証する
- `scripts/apply.ps1`: dry-run、旧 Skill のバックアップと限定削除、実ホームへの生成、生成結果の検査を行う

Rulesync の対象は `claudecode`、`codexcli`、`antigravity-ide`、`antigravity-cli` である。配布機能は rules、skills、MCP である。

## 前提

実行環境には Node.js と既存の Rulesync 実行ファイルが必要である。スクリプトは PATH 上の `rulesync` またはリポジトリの `node_modules/.bin/rulesync` を使用する。依存関係のインストール、更新、ダウンロードは行わない。

PowerShell からリポジトリ内のスクリプトを実行する。スクリプトは自身の配置からリポジトリルートを解決するため、特定の端末設定や絶対パスを必要としない。

## ディレクトリ

```text
agent-source/
├── .rulesync/
│   ├── rules/
│   ├── skills/
│   └── mcp.jsonc
├── scripts/
│   ├── apply.ps1
│   └── verify.ps1
├── tmp/
└── rulesync.jsonc
```

`tmp/` は検証用ホームと適用前バックアップの保存先であり、Git の管理対象外である。

## 配布手順

### Dry-run

実ホームを変更せず、Rulesync が生成する差分を確認する。

```powershell
./scripts/apply.ps1 -DryRun
```

Dry-run はバックアップ、旧 Skill の削除、通常の生成、生成結果の書き込みを行わない。

### 隔離ホームでの検証

```powershell
./scripts/verify.ps1
```

`verify.ps1` は `tmp/home` を安全境界として確認してから作り直し、`HOME` と `USERPROFILE` をそのパスへ一時的に切り替える。隔離ホームで strict doctor、dry-run、生成、check を実行し、既存の `.claude.json` の未知のキーが保持されることを検査する。実ホームは変更しない。

### 実ホームへの適用

```powershell
./scripts/apply.ps1
```

`apply.ps1` は `HOME`、未設定の場合は `USERPROFILE` から対象ホームを解決する。適用処理は次の順序で進む。

1. strict doctorとdry-runを実行し、生成元と生成内容を検査する
2. `.claude/skills`、`.agents/skills`、`.gemini/config/skills`、`.gemini/antigravity-cli/skills` に残る削除対象の旧 Skill を列挙する
3. 旧 Skill を `tmp/backups/<timestamp>-pre-rulesync-apply` へ元の相対パスを保ってコピーする
4. コピー元とバックアップの全ファイルについて、ファイル数、相対パス、SHA-256 が一致することを確認する
5. 検証に成功した旧 Skill ディレクトリだけを削除する
6. 生成とcheckを実行する

削除対象は、リポジトリの正本から除かれた名前のうち、対象ホームに存在するディレクトリだけである。対象外の Skill と設定ファイルは削除しない。

バックアップ検証に失敗した場合は、旧 Skill を削除しない。削除後に処理が失敗した場合は、エラーに示されたバックアップの内容を、相対構造を保ったまま対象ホームへ再配置する。Rulesyncが生成したrules、MCP設定、新しいSkillはバックアップ対象に含まれないため、dry-runの内容と適用後の状態を確認して復旧する。バックアップは適用成功後も `tmp/backups/` に残る。

スクリプトの実行結果は環境にある Node.js、Rulesync と対象ホームの状態に依存する。リポジトリ更新後は dry-run と隔離ホームでの検証を行い、その結果を確認してから実ホームへ適用する。
