# agent-source

`agent-source` は、複数のエージェント環境への配布内容を Rulesync の入力として管理するリポジトリである。次のものを配布する。

- ルール
- Skill
- サブエージェント定義
- hook
- MCP 設定
- agy（Antigravity CLI）のコマンドの許可ルール

配布する Skill の用途と起動のしかたは、[Skill の一覧](docs/skills.md) を参照のこと。

各環境へ生成されたファイルは直接編集せず、リポジトリ内の入力を編集する。

## 要求環境

### 生成・開発

- Node.js 22 以上と npm
- Rulesync: `package.json` で固定した版

### 配布後の Skill 実行

使用する Skill に応じて、ホストに次の実行基盤が必要となる。

- Node.js: `write-docs`、`verify-docs`、`deep-research`、`pr-merge` に付属する `.mjs` を実行する場合
- npm の `npx`: `write-docs` の textlint を実行する場合
- uv: `natural-japanese` に付属する Python スクリプトを実行する場合。Python 本体と依存パッケージは uv が自身の管理領域に用意するため、ホストへ Python を導入する必要はない
- Git: Git 操作を行う Skill を実行する場合
- GitHub CLI（`gh`）: `pr-merge` に付属する `.mjs` を実行する場合

サンドボックスを使うエージェントでは、サンドボックス内からも各実行基盤を起動し、それぞれの管理領域へ書き込める必要がある。ただし Windows の Codex では、mise の shim がサンドボックス内で版を解決できないため、mise の shim を経由して起動する実行基盤はサンドボックスの外で実行する。この指示は Codex にだけ配布するルール（`.rulesync/rules/04-sandbox-codex.md`）に定める。

その他の Skill が使用するコマンドについては、各 Skill の実行条件と手順を参照のこと。

初回セットアップ時、または lockfile（`package-lock.json`）の更新後に、リポジトリで固定された Rulesync を導入する。

```powershell
npm ci
```

PowerShell からスクリプトを実行する際は、リポジトリルートを作業ディレクトリとする。スクリプトは自身の配置場所からリポジトリルートを解決するため、特定の環境設定や絶対パスの指定を必要としない。

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
│   └── verify.ps1
├── tmp/
├── AGENTS.md
├── CLAUDE.md
├── rulesync.jsonc
└── rulesync.lock
```

- `rulesync.jsonc`: 生成対象、対象ごとに配布する機能、外部から取得する Skill の取得元を定義する
- `.rulesync/rules/`: 全環境に共通する規則と、サブエージェントの利用規則など特定のエージェントにだけ配布する規則を格納する
- `.rulesync/skills/`: 実装、成果物、文章、検証、Git、サブエージェント利用の原則を Skill 単位で格納する
- `.rulesync/mcp.jsonc`: 配布する MCP 設定を定義する
- `.rulesync/subagents/`: ツール制限を伴うサブエージェント定義を格納する
- `.rulesync/hooks.jsonc`: 配布する AI エージェントの hook を定義する
- `.rulesync/permissions.jsonc`: agy（Antigravity CLI）に許可する読み取り用のコマンドを定義する。生成時は `~/.gemini/antigravity-cli/settings.json` の既存の設定を残し、`command(...)` の規則だけをこのファイルの内容で置き換える
- `docs/`: 利用者向けの Skill 一覧と、保守作業の手順書を置く
- `hooks/`: hook から呼び出すスクリプトを格納する。Rulesync は hook の設定ファイルのみを配布するため、`scripts/apply.ps1` が `~/.local/agent-source/hooks/` へ配置する
- `scripts/verify.ps1`: 隔離した一時的なホームディレクトリへ生成し、設定の非破壊性と生成結果を検証する
- `scripts/apply.ps1`: dry-run、利用中のホームディレクトリへの生成、生成結果の検査、hook スクリプトの配置を行う
- `AGENTS.md`: このリポジトリで作業するエージェント向けに、編集対象と生成されたファイルの区別、生成と適用の手段、Git 管理外ディレクトリの扱いを記載する
- `CLAUDE.md`: `AGENTS.md` を import する 1 行のみで構成する。`AGENTS.md` を直接読み込まない Claude Code にも同じ内容を反映させるために用いる

Rulesync は `claudecode`、`codexcli`、`antigravity-ide`、`antigravity-cli` の 4 つを生成対象とする。rules、skills、subagents、hooks、MCP は 4 つの生成対象すべてに配布する。permissions は、`codexcli` で有効にすると `config.toml` の `default_permissions` と承認の設定まで書き換えるため、`antigravity-cli` だけに配布する。

`tmp/` は Git の管理対象外であり、検証用のホームディレクトリの保存先として使用する。

## 第三者 Skill の取得

外部リポジトリの Skill は `rulesync.jsonc` の `sources` で定義し、`npx rulesync install` で取得する。本体はこのリポジトリで管理せず、取得先の ref は `rulesync.lock` で固定する。

```powershell
npx rulesync install
```

- 取得先: `.rulesync/skills/.curated/`（Git の管理対象外）
- `rulesync.lock`: 解決した commit SHA と整合性ハッシュを記録する。この 1 ファイルのみを Git で管理する
- 上流へ追従する際は `npx rulesync install --update` を実行し、更新後の `rulesync.lock` をコミットする
- CI や再現性が必要な場面では `npx rulesync install --frozen` を使い、lockfile に固定された ref を指定して取得する

取得後は `scripts/apply.ps1` が他の Skill と同様の流れで配布する。`apply.ps1` と `verify.ps1` は生成前に `.rulesync/skills/.curated/` 内の `__pycache__`、`*.pyc`、`*.pyo` を削除する。この削除は dry-run でも実行する。外部リポジトリの Skill を取得していない環境では、`sources` に定義した該当の Skill のみが配布されない。

## 実行手順

### 生成差分の確認

`apply.ps1 -DryRun` は、Rulesync が生成する差分を表示する。利用中のホームディレクトリは変更しない。

```powershell
./scripts/apply.ps1 -DryRun
```

strict doctor と dry-run が成功すると、スクリプトは `Dry-run completed.` と出力して終了する。表示された差分が意図した配布内容のみであることを確認すること。

Codex の `~/.codex/config.toml` は、配布内容を変更していない場合でも書き込み対象として表示される。Rulesync が `mcp_servers` を `.rulesync/mcp.jsonc` の内容で置き換え、Codex アプリが登録する `node_repl` を削除するためである。`node_repl` は Codex の起動時に自動で再登録されるため、この差分は問題にならない。

### 利用中のホームディレクトリへの適用

実行前に[生成差分の確認](#生成差分の確認)が成功し、生成内容が意図した状態であることを確認すること。生成先に残す必要がある状態は、Git または別のバックアップで復元できるように準備してから実行すること。一部のエージェントは実行環境の環境変数を上書きするため、実環境への適用はエージェント内から行わず、通常の PowerShell から実行する。

```powershell
./scripts/apply.ps1
```

`apply.ps1` は `HOME`、未設定の場合は `USERPROFILE` から対象のホームディレクトリを特定し、次の順序で処理する。

1. strict doctor と dry-run を実行し、生成元と生成内容を検査する
2. 生成と check を実行する
3. hook スクリプトを `~/.local/agent-source/hooks/` へ配置する

すべての処理が成功すると、スクリプトは `Apply completed.` と出力して終了する。

`apply.ps1` は生成先のファイルを削除しない。生成元の Skill、サブエージェント定義、hook スクリプトを削除または改名した場合は、[生成元から外した生成物の削除](#生成元から外した生成物の削除)の手順に従い、旧名の生成物を手作業で削除する。

### 補助検証

Rulesync の生成挙動を利用中のホームディレクトリから分離して確認する場合は、`verify.ps1` を実行する。スクリプトは既存の `tmp/home` を削除して再作成し、`HOME` と `USERPROFILE` をそのパスへ一時的に切り替える。利用中のホームディレクトリは変更されない。

```powershell
./scripts/verify.ps1
```

`verify.ps1` は `tmp/home` の安全境界を確認し、strict doctor、dry-run、生成、check を実行する。既存の `.claude.json` を模した設定において未知のキーが保持されることも検査する。すべての検査が成功すると、スクリプトは `Verification completed. Test home: <path>` と出力して終了する。失敗した場合は、表示された原因を解消してから同じコマンドを再実行すること。

### 失敗時の確認

- strict doctor または dry-run が失敗した場合: Rulesync の生成は開始されない。表示された設定エラーを解消してから再実行すること
- 補助検証が失敗した場合: 利用中のホームディレクトリは変更されない。`tmp/home` の内容を調査に利用し、原因を解消してから `verify.ps1` を再実行すること
- 生成または check が失敗した場合: Rulesync が生成した rules、MCP 設定、Skill は、実行前に確保した復元手段を用いて元に戻すこと

## 保守

### Rulesync の更新

Rulesync の版は `package.json` で固定し、`package-lock.json` とあわせて Git で管理する。版によって配布先の設定ファイルの生成結果が変わるため、最新版への自動追従は行わない。定期的な更新確認も行わず、次のいずれかに該当した場合に更新を検討する。

- 配布先の設定仕様が変わり、生成結果が仕様と合わなくなった
- 必要な機能や不具合の修正が Rulesync に追加された
- Rulesync 自体にセキュリティ上の問題がある
- 利用中の Node.js との互換性に問題がある

npm の非推奨警告（deprecated warning）など、Rulesync の推移的依存関係に起因する警告は、導入の失敗やセキュリティ勧告を伴わない限り更新の理由としない。Rulesync はメジャーバージョンを短い間隔で上げるため、patch、minor、major の区別で更新の可否を判断せず、生成差分で判断する。

更新は次の手順で行う。

1. 固定中の版から更新先の版までのリリースノートを読み、`rulesync.jsonc` の生成対象と、スクリプトが使うコマンドに関わる破壊的変更を確認する
2. 更新前に `verify.ps1` を実行し、生成された `tmp/home` を `tmp/` の外へ退避する
3. 版を固定して導入する

   ```powershell
   npm install -E -D rulesync@<更新先の版>
   ```

4. `verify.ps1` を実行し、生成された `tmp/home` を退避しておいた生成結果と比較する。差分がリリースノートで説明できる変更に限られることを確認する
5. [生成差分の確認](#生成差分の確認)の手順に従って dry-run を実行し、利用中のホームディレクトリで書き込み対象となるファイルを確認する
6. 説明できない差分がある場合は `.rulesync/` を調整するか、更新を見送る。問題がなければ `package.json` と `package-lock.json` をコミットする

### 生成元から外した生成物の削除

Rulesync の生成処理は、生成元から削除されたファイルを生成先から削除しない。生成元の Skill、サブエージェント定義、hook スクリプトを削除または改名すると、旧名の生成物が生成先に残り、各エージェントが読み込み続ける。

Rulesync の `generate --delete` は、旧名の生成物の削除に使わない。生成先には Rulesync 以外のツールや利用者もファイルを置いており、`--delete` を指定するとそれらも削除されるためである。生成先と、Rulesync 以外が置くものは次のとおりである。

| 生成先 | Rulesync 以外が置くもの |
| --- | --- |
| `~/.claude/skills/` | `synced/`（Claude Code が claude.ai から同期した Skill）、`.trash/`（同期を止めた Skill の退避先） |
| `~/.agents/skills/` | Agent Skills の共通の置き場所であり、Codex 以外のツールも Skill を置きうる |
| `~/.gemini/config/skills/` | Antigravity の `/learn` が作成した Skill |
| `~/.gemini/antigravity-cli/skills/` | なし |
| `~/.claude/agents/`、`~/.codex/agents/`、`~/.gemini/config/agents/` | 利用者が置いたサブエージェント定義 |

また、`--delete` は `~/.claude/scheduled-tasks/` も Skill の配置場所とみなして削除対象にする。このディレクトリには、デスクトップアプリの定期タスクが保存されている。

#### 削除または改名したとき

生成元の Skill、サブエージェント定義、hook スクリプトを削除または改名した場合は、`./scripts/apply.ps1` を実行した後に、旧名の生成物を手作業で削除する。

- Skill: [生成元から外した生成物の削除](#生成元から外した生成物の削除)の表にある 4 つの Skill の生成先から、旧名のディレクトリを削除する
- サブエージェント定義: `~/.claude/agents/<旧名>.md`、`~/.codex/agents/<旧名>.toml`、`~/.gemini/config/agents/<旧名>.md` を削除する
- hook スクリプト: `~/.local/agent-source/hooks/` から旧名のファイルを削除する

#### 棚卸し

削除漏れに気づいたときは、生成先を生成元と照合して、残った不要な生成物を手作業で削除する。

1. 生成元にある Skill やサブエージェント定義の名前を一覧にする。対象は `.rulesync/skills/`、`.rulesync/skills/.curated/`、`.rulesync/subagents/` である
2. 生成先の名前を一覧にし、生成元にない名前を抽出する。`npx rulesync generate --global --delete --dry-run` の `Would delete` の行を一覧として利用できる。このコマンドは生成先を変更しないが、Rulesync 以外が置いたものも列挙される
3. 抽出した名前から、[生成元から外した生成物の削除](#生成元から外した生成物の削除)の表にある Rulesync 以外が置くものと、`.` で始まる名前を除外する
4. 残った名前が過去に生成元にあったかを、`git log --oneline -- .rulesync/skills/<名前> .rulesync/subagents/<名前>.md` で確認する。外部から取得した Skill は、`rulesync.jsonc` の `sources` の履歴で確認する
5. 過去に生成元にあった名前の生成物を削除する。生成元にあったことがない名前は、利用者または他のツールが置いたものである。内容を確認したうえで、残すか削除するかを判断する

### Skill の点検

配布する Skill が、外部の Skill や配布先の現状に照らして古くなっていないかを、必要と判断したときに点検する。利用者がエージェントへ [Skill の点検](docs/skill-audit.md) の手順に沿って点検を依頼し、チャットで受け取った提案のうち採用するものを Issue にする。
