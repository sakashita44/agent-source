# AGENTS.md

`agent-source` は、複数のエージェント環境への配布内容を Rulesync の入力として管理するリポジトリである。配布内容の一覧と全体の作業手順は README を参照のこと。本書には、リポジトリの構造からは読み取れず、違反すると配布物が破損してしまうような制約のみを記載する。

## 編集対象と生成されたファイル

配布内容は `.rulesync/` 配下で管理し、変更する際は `.rulesync/` を編集する。ホームディレクトリの `~/.claude/`、`~/.codex/`、`~/.gemini/` 配下のファイルは `.rulesync/` から生成されるため、直接編集しない。直接編集した内容は次回の生成で失われる。

`.rulesync/skills/.curated/` は `npx rulesync install` が外部リポジトリから取得した Skill の配置場所であり、Git の管理対象外である。このディレクトリを直接編集しないこと。上流へ追従する際は `npx rulesync install --update` を実行し、更新された `rulesync.lock` のみをコミットする。

## 生成と適用

生成先はホームディレクトリである。`scripts/apply.ps1` と `scripts/verify.ps1` はどちらも `rulesync generate --global` を実行するため、このリポジトリのルートには生成されたファイルが配置されない。

- `./scripts/apply.ps1 -DryRun`: 利用中のホームディレクトリを変更せず、生成される差分を表示する
- `./scripts/apply.ps1`: Rulesync への移行前に手作業で配置していた Skill を退避してから利用中のホームディレクトリへ生成する
- `./scripts/verify.ps1`: `tmp/home` を隔離したホームディレクトリとして生成し、利用中のホームディレクトリを変更せずに挙動を確認する

利用中のホームディレクトリへ適用する前に、dry-run で差分が意図した配布内容のみであることを確認のこと。

hook は設定ファイルのみが Rulesync の配布対象であり、hook から呼び出すスクリプトの実体は `scripts/apply.ps1` が `~/.local/agent-source/hooks/` へ配置する。`hooks/` 配下を変更した場合、生成の実行だけでは実環境へ反映されない。Windows で hook を bash 以外のシェルで実行する配布先には Windows 専用コマンドを定義し、PATH 上の `bash` が Git Bash を指す前提を置かない。

## Git 管理外のディレクトリ

`tmp/` は隔離したホームディレクトリと適用前バックアップの保存先、`old/` は Rulesync 移行前の手書き指示ファイルの保管先であり、どちらも Git の管理対象外である。`old/` の内容は現行の配布内容ではないため、仕様の根拠として参照しないこと。
