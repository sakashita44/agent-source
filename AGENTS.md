# AGENTS.md

`agent-source` は、複数のエージェント環境へ配布するルール、Skill、サブエージェント定義、hook、MCP 設定を Rulesync の入力として管理するリポジトリである。全体の作業手順は README を参照のこと。本書には、リポジトリの構造からは読み取れず、違反すると配布物が破損してしまうような制約のみを記載する。

## 正本と生成物

`.rulesync/` 配下が正本である。ホームディレクトリへ生成された `~/.claude/`、`~/.codex/`、`~/.gemini/` 配下のファイルは生成物であり、編集元として扱わない。生成物への変更は次回の生成で失われる。配布内容を変更する際は `.rulesync/` を編集する。

`.rulesync/skills/.curated/` は `npx rulesync install` が外部リポジトリから取得した Skill の配置場所であり、Git の管理対象外である。このディレクトリを直接編集しないこと。上流へ追従する際は `npx rulesync install --update` を実行し、更新された `rulesync.lock` のみをコミットする。

## 生成と適用

生成先はホームディレクトリである。`scripts/apply.ps1` と `scripts/verify.ps1` はどちらも `rulesync generate --global` を実行するため、このリポジトリのルートには生成物が配置されない。

- `./scripts/apply.ps1 -DryRun`: 実際のホームディレクトリを変更せず、生成される差分を表示する
- `./scripts/apply.ps1`: Rulesync の正本から除外された名前の Skill を退避してから実際のホームディレクトリへ生成する
- `./scripts/verify.ps1`: `tmp/home` を隔離したホームディレクトリとして生成し、実際のホームディレクトリを変更せずに挙動を確認する

実際のホームディレクトリへ適用する前に、dry-run で差分が意図した配布内容のみであることを確認のこと。

hook は設定ファイルのみが Rulesync の配布対象であり、hook から呼び出すスクリプトの実体は `scripts/apply.ps1` が `~/.agent-source/hooks/` へ配置する。`hooks/` 配下を変更した場合、生成の実行だけでは実環境へ反映されない。

## Git 管理外のディレクトリ

`tmp/` は隔離したホームディレクトリと適用前バックアップの保存先、`old/` は Rulesync 移行前の手書き指示ファイルの保管先であり、どちらも Git の管理対象外である。`old/` の内容は現行の配布内容ではないため、仕様の根拠として参照しないこと。
