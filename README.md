# agent-source

`agent-source` は、複数のエージェント環境へ配布するルール、Skill、サブエージェント定義、hook、MCP 設定を Rulesync の入力として管理するリポジトリである。各環境へ生成されたファイルは直接編集せず、リポジトリ内の入力を編集する。

## 要求環境

- Node.js 22 以上
- Rulesync 16.3.0 以上
- uv（`natural-japanese` Skill の同梱スクリプトを実行する場合）
- bash（配布した hook が `~` を含むコマンドを実行するため。Windows では Git Bash が該当する）

初回セットアップ時、または lockfile の更新後に、リポジトリで固定された Rulesync を導入する。

```powershell
npm ci
```

リポジトリルートを作業ディレクトリとし、PowerShell からスクリプトを実行する。スクリプトは自身の配置場所からリポジトリルートを解決するため、特定の環境設定や絶対パスの指定を必要としない。

## ディレクトリ構成

```text
agent-source/
├── .rulesync/
│   ├── rules/
│   ├── skills/
│   ├── subagents/
│   ├── hooks.jsonc
│   └── mcp.jsonc
├── hooks/
├── scripts/
│   ├── apply.ps1
│   └── verify.ps1
├── tmp/
├── AGENTS.md
├── CLAUDE.md
├── rulesync.jsonc
└── rulesync.lock
```

- `rulesync.jsonc`: 生成対象、配布する機能、外部から取得する Skill の取得元を定義する
- `.rulesync/rules/`: 全環境に共通する規則と、エージェントごとのサブエージェント利用規則を格納する
- `.rulesync/skills/`: 実装、成果物、文章、検証、Git、サブエージェント利用の原則を Skill 単位で格納する
- `.rulesync/mcp.jsonc`: 配布する MCP 設定を定義する
- `.rulesync/subagents/`: ツール制限を伴うサブエージェント定義を格納する
- `.rulesync/hooks.jsonc`: 配布する AI エージェントの hook を定義する
- `hooks/`: hook から呼び出すスクリプトを格納する。Rulesync は hook の設定ファイルのみを配布するため、`scripts/apply.ps1` が `~/.agent-source/hooks/` へ配置する
- `scripts/verify.ps1`: 隔離した一時的なホームディレクトリへ生成し、設定の非破壊性と生成結果を検証する
- `scripts/apply.ps1`: dry-run、Rulesync への移行前に手作業で配置していた Skill（以下、手動配置の Skill）のバックアップと対象を絞った削除、利用中のホームディレクトリへの生成、生成結果の検査を行う
- `AGENTS.md`: このリポジトリで作業するエージェント向けに、編集対象と生成されたファイルの区別、生成と適用の手段、Git 管理外ディレクトリの扱いを記載する
- `CLAUDE.md`: `AGENTS.md` を import する 1 行のみで構成する。これにより、`AGENTS.md` を読み込まない Claude Code にも同じ内容を反映できる

Rulesync は `claudecode`、`codexcli`、`antigravity-ide`、`antigravity-cli` を対象とし、rules、skills、subagents、hooks、MCP を配布する。配布する hook は、会話履歴の圧縮に備えて状態を書き出し、圧縮後に再度読み込ませる。この hook が利用する対象イベントに対応しているのは `claudecode` と `codexcli` のみであり、Antigravity では圧縮対策が機能しない。

`tmp/` は Git の管理対象外であり、検証用のホームディレクトリおよび適用前バックアップの保存先として使用する。

## 第三者 Skill の取得

外部リポジトリの Skill は `rulesync.jsonc` の `sources` で定義し、取得コマンドで取り込む。本体はこのリポジトリで管理せず、取得先の ref は `rulesync.lock` で固定する。

```powershell
npx rulesync install
```

- 取得先: `.rulesync/skills/.curated/`（Git の管理対象外）
- `rulesync.lock`: 解決した commit SHA と整合性ハッシュを記録する。この 1 ファイルのみを Git で管理する
- 上流へ追従する際は `npx rulesync install --update` を実行し、更新後の `rulesync.lock` をコミットする
- CI や再現性が必要な場面では `npx rulesync install --frozen` を使い、lockfile に固定された ref を指定して取得する

取得後は `scripts/apply.ps1` が他の Skill と同様の流れで配布する。取得していない環境では、定義した Skill のみが配布されない。

## 実行手順

### 生成差分の確認

dry-run は、利用中のホームディレクトリ、バックアップ、手動配置の Skill、生成結果を変更せず、Rulesync が生成する差分を表示する。

```powershell
./scripts/apply.ps1 -DryRun
```

strict doctor と dry-run が成功すると、`Dry-run completed.` と表示して終了する。表示された差分が意図した配布内容のみであることを確認すること。

### 利用中のホームディレクトリへの適用

実行前に「生成差分の確認」が成功し、生成内容が意図した状態であることを確認すること。`apply.ps1` は手動配置の Skill をバックアップして削除し、Rulesync の生成結果を利用中のホームディレクトリへ反映する。バックアップ対象は手動配置の Skill のみであり、Rulesync が生成する rules、MCP 設定、Skill は含まない。生成先に残す必要がある状態は、Git または別のバックアップで復元できるように準備してから実行すること。

```powershell
./scripts/apply.ps1
```

`apply.ps1` は `HOME`、未設定の場合は `USERPROFILE` から対象のホームディレクトリを特定し、次の順序で処理する。

1. strict doctor と dry-run を実行し、生成元と生成内容を検査する
2. 手動配置の Skill を安全に退避して削除する
   - `.claude/skills`、`.agents/skills`、`.gemini/config/skills`、`.gemini/antigravity-cli/skills` に残る削除対象を列挙する
   - `tmp/backups/<timestamp>-pre-rulesync-apply` へ元の相対パスを保持してコピーする
   - コピー元とバックアップの間で、ファイル数、相対パス、SHA-256 が一致することを確認する
   - 検証に成功した手動配置の Skill ディレクトリのみを削除する
3. 生成と check を実行する

削除対象は、`apply.ps1` に列挙した手動配置の Skill の名前のうち、対象のホームディレクトリに存在するディレクトリのみである。対象外の Skill と設定ファイルは削除されない。

すべての処理が成功すると、`Apply completed.` と表示する。手動配置の Skill をバックアップした場合は、バックアップ先も表示する。バックアップは適用成功後も `tmp/backups/` に保持される。

### 補助検証

Rulesync の生成挙動を利用中のホームディレクトリから分離して確認する場合は、`verify.ps1` を使用する。スクリプトは既存の `tmp/home` を削除して再作成し、`HOME` と `USERPROFILE` をそのパスへ一時的に切り替える。利用中のホームディレクトリは変更しない。

```powershell
./scripts/verify.ps1
```

`verify.ps1` は `tmp/home` の安全境界を確認し、strict doctor、dry-run、生成、check を実行する。既存の `.claude.json` を模した設定において未知のキーが保持されることも検査する。すべての検査が成功すると、`Verification completed. Test home: <path>` と表示する。失敗した場合は、表示された原因を解消してから同じコマンドを再実行すること。

### 失敗時の確認

- strict doctor または dry-run が失敗した場合: 手動配置の Skill のバックアップと削除、および Rulesync の生成は開始されない。表示された設定エラーを解消してから再実行すること
- 補助検証が失敗した場合: 利用中のホームディレクトリは変更されない。`tmp/home` の内容を調査に利用し、原因を解消してから `verify.ps1` を再実行すること
- バックアップの検証が失敗した場合: 手動配置の Skill は削除されない。エラー出力に示されたコピー元、バックアップ先、相対パス、SHA-256 を確認すること
- 手動配置の Skill の削除後に生成または check が失敗した場合: エラー出力に示されたバックアップを元の相対パスへ再配置すること。Rulesync が生成した rules、MCP 設定、Skill は、実行前に確保した復元手段を用いて元に戻すこと
