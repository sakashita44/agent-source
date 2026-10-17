# AGENTS.md

`agent-source` は、複数のエージェント環境への配布内容を Rulesync の入力として管理するリポジトリである。配布内容の一覧と全体の作業手順は [README.md](README.md) を参照のこと。本書には、リポジトリの構造からは読み取れず、違反すると配布物が破損する制約のみを記載する。

## 編集対象と生成されたファイル

配布内容は `.rulesync/` 配下で管理するため、変更時は `.rulesync/` 配下のファイルを編集する。ホームディレクトリの `~/.claude/`、`~/.codex/`、`~/.gemini/` 配下のファイルは `.rulesync/` から生成されるため、直接編集しない。直接編集した内容は次回の生成で失われる。

`.rulesync/skills/.curated/` は `npx rulesync install` が外部リポジトリから取得した Skill の配置場所であり、Git の管理対象外である。このディレクトリを直接編集しないこと。上流へ追従する際は `npx rulesync install --update` を実行し、更新された `rulesync.lock` のみをコミットする。

## 生成と適用

生成先はホームディレクトリである。`scripts/apply.ps1` と `scripts/verify.ps1` はどちらも `rulesync generate --global` を実行するため、このリポジトリのルートにはファイルが生成されない。

- `./scripts/apply.ps1 -DryRun`: 利用中のホームディレクトリを変更せず、生成される差分を表示する
- `./scripts/apply.ps1`: 利用中のホームディレクトリへ配布内容を生成し、hook スクリプトを `~/.local/agent-source/hooks/` へ配置する
- `./scripts/verify.ps1`: `tmp/home` を隔離したホームディレクトリとして生成し、利用中のホームディレクトリを変更せずに挙動を確認する

利用中のホームディレクトリへ適用する前に、dry-run で差分が意図した配布内容のみであることを確認のこと。

Rulesync の生成処理は、生成元から削除されたファイルを生成先から削除しない。`rulesync generate` に `--delete` を付けないこと。`--delete` は、claude.ai から同期した Skill やデスクトップアプリの定期タスクなど、Rulesync 以外が置いたものも削除するためである。Skill、サブエージェント定義、hook スクリプトを削除または改名した場合は、[README.md の「生成元から外した生成物の削除」](README.md#生成元から外した生成物の削除)の手順に従い、旧名の生成物を手作業で削除する。

Rulesync の版を変更すると、配布内容を変更していない場合でも生成結果が変わる。版を変更する場合は、[README.md の「Rulesync の更新」](README.md#rulesync-の更新)の手順に従って生成差分を確認すること。

Rulesync が配布するのは hook の設定ファイルのみであり、hook から呼び出すスクリプトの実体は `scripts/apply.ps1` が `~/.local/agent-source/hooks/` へ配置する。`hooks/` 配下を変更した場合、生成の実行だけでは実環境へ反映されない。Windows で hook を bash 以外のシェルで実行する配布先には Windows 専用コマンドを定義し、PATH 上の `bash` が Git Bash を指す前提を置かない。

## Git 管理外のディレクトリ

`tmp/` は隔離したホームディレクトリの保存先、`old/` は Rulesync 移行前の手書き指示ファイルの保管先であり、どちらも Git の管理対象外である。`old/` の内容は現行の配布内容ではないため、仕様の根拠として参照しないこと。
