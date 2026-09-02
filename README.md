# agent-source

`agent-source` は、複数のエージェント環境へ配布するルール、Skill、CLI 参照、MCP 設定を Rulesync の入力として管理するリポジトリである。リポジトリ内の入力を正本とし、各環境へ生成されたファイルは編集元として扱わない。

## 要求環境

- Node.js 22 以上
- Rulesync 16.3.0 以上

初回またはlockfile更新後に、リポジトリで固定したRulesyncを導入する。

```powershell
npm ci
```

リポジトリルートを作業ディレクトリとし、PowerShell からスクリプトを実行する。スクリプトは自身の配置からリポジトリルートを解決するため、特定の端末設定や絶対パスを必要としない。

## ディレクトリ構成

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

- `rulesync.jsonc`: 生成対象と配布する機能を定める
- `.rulesync/rules/`: 全環境に共通する規則と、エージェントごとのサブエージェント利用規則を収める
- `.rulesync/skills/`: 実装、成果物、文章、検証、Git、サブエージェント利用の原則を Skill 単位で収める
- `.rulesync/skills/subagent/references/`: 各 CLI やエージェント機能を使うための環境別参照を収める
- `.rulesync/mcp.jsonc`: 配布する MCP 設定を定める
- `scripts/verify.ps1`: 隔離した一時ホームへ生成し、設定の非破壊性と生成結果を検証する
- `scripts/apply.ps1`: dry-run、旧 Skill のバックアップと限定削除、実ホームへの生成、生成結果の検査を行う

Rulesync は `claudecode`、`codexcli`、`antigravity-ide`、`antigravity-cli` を対象とし、rules、skills、MCP を配布する。

`tmp/` は Git の管理対象外であり、検証用ホームと適用前バックアップの保存先として使用される。

## 実行手順

### 生成差分の確認

dry-run は、実ホーム、バックアップ、旧 Skill、生成結果を変更せず、Rulesync が生成する差分を表示する。

```powershell
./scripts/apply.ps1 -DryRun
```

strict doctor と dry-run が成功すると、`Dry-run completed.`と表示して終了する。表示された差分が意図した配布内容だけであることを確認すること。

### 実ホームへの適用

実行前に「生成差分の確認」が成功し、生成内容が意図した状態であることを確認すること。`apply.ps1` は旧 Skill をバックアップして削除し、Rulesync の生成結果を実ホームへ書き込む。バックアップ対象は旧 Skill だけであり、Rulesync が生成する rules、MCP 設定、新しい Skill は含まない。生成先に残す必要がある状態は、Git または別のバックアップで復元できる状態にしてから実行すること。

```powershell
./scripts/apply.ps1
```

`apply.ps1` は `HOME`、未設定の場合は `USERPROFILE` から対象ホームを解決し、次の順序で処理する。

1. strict doctor と dry-run を実行し、生成元と生成内容を検査する
2. 旧 Skill を安全に退避して削除する
   - `.claude/skills`、`.agents/skills`、`.gemini/config/skills`、`.gemini/antigravity-cli/skills` に残る削除対象を列挙する
   - `tmp/backups/<timestamp>-pre-rulesync-apply` へ元の相対パスを保ってコピーする
   - コピー元とバックアップのファイル数、相対パス、SHA-256 が一致することを確認する
   - 検証に成功した旧 Skill ディレクトリだけを削除する
3. 生成と check を実行する

削除対象は、リポジトリの正本から除かれた名前のうち、対象ホームに存在するディレクトリのみである。対象外の Skill と設定ファイルは削除されない。

すべての処理が成功すると、`Apply completed.`と表示する。旧 Skill をバックアップした場合は、バックアップ先も表示する。バックアップは適用成功後も `tmp/backups/` に残る。

## 補助検証

Rulesync の生成挙動を実ホームから分離して確認する場合は、`verify.ps1` を使用する。スクリプトは既存の `tmp/home` を削除して作り直し、`HOME` と `USERPROFILE` をそのパスへ一時的に切り替える。実ホームは変更しない。

```powershell
./scripts/verify.ps1
```

`verify.ps1` は `tmp/home` の安全境界を確認し、strict doctor、dry-run、生成、check を実行する。既存の `.claude.json` に見立てた設定の未知のキーが保持されることも検査する。すべての検査が成功すると、`Verification completed. Test home: <path>`と表示する。失敗した場合は、表示された原因を解消してから同じコマンドを再実行できる。

## 失敗時の確認

- strict doctor または dry-run が失敗した: 旧 Skill のバックアップと削除、Rulesync の生成は始まらない。表示された設定エラーを解消してから再実行すること
- 補助検証が失敗した: 実ホームは変更されない。`tmp/home` の内容を診断に使い、原因を解消してから `verify.ps1` を再実行すること
- バックアップの検証が失敗した: 旧 Skill は削除されない。エラーに示されたコピー元、バックアップ、相対パス、SHA-256 を確認すること
- 旧 Skill の削除後に生成または check が失敗した: エラーに示されたバックアップを元の相対パスへ再配置すること。Rulesync が生成した rules、MCP 設定、新しい Skill は、実行前に確保した復元手段を使って戻すこと
