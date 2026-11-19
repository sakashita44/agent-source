# agent-source

`agent-source` は、Claude Code、Codex CLI、Antigravity IDE、Antigravity CLI（以下、`agy`）の 4 環境への配布内容を Rulesync の生成元として管理するリポジトリである。

配布内容:

- ルール
- Skill
- サブエージェント定義
- hook
- MCP 設定
- `agy` の許可ルール（読み取り用のコマンドと Notion MCP ツール）

配布する Skill の用途と起動方法は、[Skill の一覧](docs/skills.md)を参照のこと。

各環境へ生成されたファイルは直接編集せず、`.rulesync/` 配下の生成元を編集すること。

## 準備

### 要求環境

配布物の生成には、次のツールを要する。

- PowerShell
- Node.js 22 以上と npm
- Rulesync（`package.json` で固定されたバージョンを初回セットアップの `npm ci` で導入する）

配布後の hook と Skill の実行には、利用する機能に応じてホストに次の実行基盤を用意する。

| 実行基盤 | 必要な対象 | 補足 |
| --- | --- | --- |
| Node.js | hook（`compact-hook.mjs`）、および付属スクリプトや検査スクリプトを用いる Skill（`write-docs`、`verify-docs`、`refine-docs`、`deep-research`、`pr-merge`、`google-web-analytics`、`bitwarden-vault`） | — |
| npm の `npx` | `write-docs`、`refine-docs` の textlint | — |
| uv | `natural-japanese`、`refine-docs` の Python スクリプト | Python 本体と依存パッケージは uv が自身の管理領域へ用意するため、ホストへの Python 導入は不要 |
| Git | Git 操作を伴う Skill、および保守の棚卸し | — |
| GitHub CLI（`gh`） | `pr-merge`、`release`（GitHub Release 作成時）、`bitwarden-vault`（GitHub Actions の secret 登録時） | 認証済みであること |
| Google Cloud CLI（`gcloud`）と Application Default Credentials | `google-web-analytics` | 準備はエージェントへ依頼する（手順は `.rulesync/skills/google-web-analytics/references/setup.md` に定義されている） |
| ネイティブ版の Bitwarden CLI（`bw.exe`）とログイン済みアカウント | `bitwarden-vault` | Windows のみ対応。npm で導入した Bitwarden CLI には対応しない |
| Notion MCP への接続と Notion アカウント | `notion-workspace` | Claude Code では claude.ai の Notion コネクタ、その他の配布先では `.rulesync/mcp.jsonc` に定義された Notion MCP が用いられる |

サンドボックスを利用するエージェントでは、サンドボックス内からも各実行基盤を起動でき、それぞれのキャッシュや管理領域へ書き込める必要がある。表に挙げた実行基盤以外のコマンドについては、各 Skill の `.rulesync/skills/<Skill 名>/SKILL.md` を参照のこと。

### 初回セットアップ

開始条件: リポジトリルートを作業ディレクトリとし、PowerShell、Node.js 22 以上、npm を利用できること。

1. `package-lock.json` で固定されたバージョンの Rulesync を導入する。`package-lock.json` の更新後も同様に実行する

   ```powershell
   npm ci
   ```

2. `rulesync.jsonc` の `sources` に定義された外部リポジトリの Skill を取得する

   ```powershell
   npx rulesync install
   ```

外部リポジトリの Skill は `.rulesync/skills/.curated/`（Git の管理対象外）へ取得され、解決された commit SHA と整合性ハッシュは `rulesync.lock` に記録される。再現性が必要な場面では `npx rulesync install --frozen` を用い、`rulesync.lock` に固定された ref で取得する。

完了条件: `node_modules/` に Rulesync が導入され、`.rulesync/skills/.curated/` に `rulesync.jsonc` の `sources` で指定された Skill が配置されていること。

補足: 外部リポジトリの Skill を取得していない環境では、`sources` に定義された Skill は配布されず、他の Skill のみが配布される。

外部リポジトリの Skill を上流に追従させる手順は、[保守手順](docs/maintenance.md#外部リポジトリの-skill-の更新)を参照のこと。

## 配布の適用

開始条件と注意:

- コマンドは、リポジトリルートを作業ディレクトリとして実行すること
- 利用中のホームディレクトリへ適用する前に、残す必要がある設定やファイルは、dry-run で確認した書き込み対象を含めて Git または別のバックアップで復元できるように準備すること
- 一部のエージェントは実行時の環境変数を上書きするため、利用中のホームディレクトリへの適用はエージェント内から実行せず、通常の PowerShell から実行すること

### 適用手順

1. dry-run を実行し、生成される差分を確認する。利用中のホームディレクトリは変更されない

   ```powershell
   ./scripts/apply.ps1 -DryRun
   ```

   完了確認: Rulesync の厳格診断（`doctor --strict`）と dry-run が成功すると、`apply.ps1` は `Dry-run completed.` と出力して終了する。表示された差分が意図した配布内容のみであることを確認すること。

   補足: Codex の `~/.codex/config.toml` は、配布内容を変更していない場合でも書き込み対象として表示される。Rulesync が `mcp_servers` を `.rulesync/mcp.jsonc` の内容で置き換える際に、Codex が登録する `node_repl` を削除するため、差分が生じる。`node_repl` は Codex の起動時に自動で再登録されるため、この差分による影響はない。

2. 利用中のホームディレクトリへ配布内容を適用する

   ```powershell
   ./scripts/apply.ps1
   ```

   `apply.ps1` は次の順序で処理を実行する。

   1. 厳格診断（`doctor --strict`）と dry-run を実行し、生成元と生成内容を検査する
   2. 生成（`generate --global`）と整合性検査（`generate --global --check`）を実行する
   3. 環境変数 `HOME`（未設定の場合は `USERPROFILE`）から特定したホームディレクトリの `~/.local/agent-source/hooks/` へ hook スクリプトを配置する

   完了確認: すべての処理が成功すると、`apply.ps1` は `Apply completed.` と出力して終了する。

注意: `apply.ps1` は生成先のファイルを削除しない。生成元の Skill、サブエージェント定義、hook スクリプトを削除または改名した場合は、[保守手順の「生成元から外した生成物の削除」](docs/maintenance.md#生成元から外した生成物の削除)に従い、旧名の生成物を手作業で削除すること。

### 隔離環境での検証

利用中のホームディレクトリへ影響を与えずに生成の挙動を確認する場合は、`verify.ps1` を実行する。`verify.ps1` は既存の `tmp/home` を削除して再作成し、環境変数 `HOME` と `USERPROFILE` をそのパスへ一時的に切り替えるため、利用中のホームディレクトリは変更されない。

```powershell
./scripts/verify.ps1
```

`verify.ps1` は、`tmp/home` がリポジトリ内の安全な一時領域であることを確認したうえで、次の順序で処理を実行する。

1. 厳格診断と dry-run を実行する
2. 生成と整合性検査を実行する
3. `hooks/*.mjs` の配置を検証する
4. 既存の `.claude.json` の設定が保持されることを検証する

完了確認: すべての検証が成功すると、`verify.ps1` は `Verification completed. Test home: <path>` と出力して終了する。

### 失敗時の対応

- 厳格診断または dry-run が失敗した場合: 生成は開始されない。表示された設定エラーを解消してから再実行すること
- 隔離環境での検証が失敗した場合: 利用中のホームディレクトリは変更されない。`tmp/home` の内容を調査に利用し、原因を解消してから `verify.ps1` を再実行すること
- 生成または整合性検査が失敗した場合: Rulesync が生成したルール、Skill、サブエージェント定義、hook 設定、MCP 設定、許可ルール、および `~/.local/agent-source/hooks/` に配置された hook スクリプトを、実行前に確保した復元手段を用いて元に戻すこと

## ディレクトリ構成

```text
agent-source/
├── .rulesync/
│   ├── rules/
│   ├── skills/
│   ├── subagents/
│   ├── hooks.jsonc
│   ├── mcp.jsonc
│   └── permissions.jsonc
├── docs/
├── hooks/
├── scripts/
│   ├── apply.ps1
│   ├── clear-curated-skill-python-cache.ps1
│   └── verify.ps1
├── tmp/
├── AGENTS.md
├── CLAUDE.md
├── package.json
├── package-lock.json
├── rulesync.jsonc
└── rulesync.lock
```

| パス | 役割 |
| --- | --- |
| `.rulesync/rules/` | 全環境に共通するルールと、特定のエージェントのみに配布するルールを格納する |
| `.rulesync/skills/` | 配布する Skill を Skill 単位で格納する（一覧は [Skill の一覧](docs/skills.md)を参照のこと）。外部リポジトリから取得した Skill は配下の `.curated/`（Git の管理対象外）に配置される |
| `.rulesync/subagents/` | ツール制限を伴うサブエージェント定義を格納する |
| `.rulesync/hooks.jsonc` | エージェントへ配布する hook を定義する |
| `.rulesync/mcp.jsonc` | 配布する MCP 設定を定義する |
| `.rulesync/permissions.jsonc` | `agy` に許可する読み取り用のコマンドと Notion MCP ツールを定義する。生成時は `~/.gemini/antigravity-cli/settings.json` の既存設定が保持され、`command(...)` と `mcp(...)` の規則のみがこのファイルの内容で置き換えられる |
| `docs/` | 利用者向けの Skill 一覧と、保守作業の手順書を格納する |
| `hooks/` | hook から呼び出すスクリプトを格納する。Rulesync は hook の設定ファイルのみを配布するため、`scripts/apply.ps1` が `~/.local/agent-source/hooks/` へ配置する |
| `scripts/apply.ps1` | dry-run、利用中のホームディレクトリへの生成、整合性検査、hook スクリプトの配置を実行する |
| `scripts/clear-curated-skill-python-cache.ps1` | `apply.ps1` と `verify.ps1` が生成を実行する前に、`.rulesync/skills/.curated/` 内の Python キャッシュを削除する補助スクリプト |
| `scripts/verify.ps1` | 隔離した一時ホームディレクトリ（`tmp/home`）へ配布内容を生成し、設定の非破壊性と生成結果を検証する |
| `tmp/` | Git の管理対象外。隔離検証用のホームディレクトリの保存先として用いられる |
| `AGENTS.md` | このリポジトリで作業するエージェント向けの指示ファイル |
| `CLAUDE.md` | `AGENTS.md` を参照するための Claude Code 用設定ファイル |
| `package.json` / `package-lock.json` | 開発依存の Rulesync のバージョンを固定する |
| `rulesync.jsonc` | 生成対象、対象ごとに配布する機能、外部リポジトリの Skill の取得元を定義する |
| `rulesync.lock` | 外部リポジトリから取得した Skill の commit SHA と整合性ハッシュを記録する |

`rulesync.jsonc` では `claudecode`、`codexcli`、`antigravity-ide`、`antigravity-cli` の 4 環境を生成対象としている。

機能ごとの配布先:

- ルール、Skill、サブエージェント定義: 4 環境すべて
- hook: Claude Code と Codex CLI
- MCP 設定: Claude Code を除く 3 環境
- 許可ルール（`permissions`）: `antigravity-cli` のみ

各機能の有効化条件と設計理由は、`rulesync.jsonc`、`.rulesync/hooks.jsonc`、`.rulesync/mcp.jsonc` を参照のこと。

## 保守

- Rulesync のバージョン更新、外部リポジトリの Skill の更新、および生成元から外した生成物の削除と棚卸し: [保守手順](docs/maintenance.md)を参照のこと
- 配布する Skill が外部の Skill や配布先の現状に照らして古くなっていないかの点検: 必要と判断したときに、エージェントへ [Skill の点検](docs/skill-audit.md)に沿った点検を依頼する
