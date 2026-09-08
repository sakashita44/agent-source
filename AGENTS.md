# AGENTS.md

`agent-source`は、複数のエージェント環境へ配布するルール、Skill、サブエージェント定義、hook、MCP設定をRulesyncの入力として管理するリポジトリである。作業手順の全体はREADMEにある。ここには、リポジトリの構造からは読み取れず、違反すると配布物を壊す制約だけを置く。

## 正本と生成物

`.rulesync/`配下が正本である。ホームディレクトリへ生成された`~/.claude/`、`~/.codex/`、`~/.gemini/`配下のファイルは生成物であり、編集元として扱わない。生成物への変更は次回の生成で失われる。配布内容を変えるときは`.rulesync/`を編集する。

`.rulesync/skills/.curated/`は`npx rulesync install`が外部リポジトリから取得したSkillの置き場であり、Git管理対象外である。このディレクトリを直接編集しないこと。上流へ追随するときは`npx rulesync install --update`を実行し、更新された`rulesync.lock`だけをコミットする。

## 生成と適用

生成先はホームディレクトリである。`scripts/apply.ps1`と`scripts/verify.ps1`はどちらも`rulesync generate --global`を実行するため、このリポジトリのルートには生成物が置かれない。

- `./scripts/apply.ps1 -DryRun`: 実ホームを変更せず、生成される差分を表示する
- `./scripts/apply.ps1`: Rulesyncの正本から除かれた名前のSkillを退避してから実ホームへ生成する
- `./scripts/verify.ps1`: `tmp/home`を隔離ホームとして生成し、実ホームを変更せずに挙動を確かめる

実ホームへ適用する前に、dry-runで差分が意図した配布内容だけであることを確認のこと。

hookは設定ファイルだけがRulesyncの配布対象であり、hookから呼ぶスクリプトの実体は`scripts/apply.ps1`が`~/.agent-source/hooks/`へ配置する。`hooks/`配下を変更した場合、生成だけでは実環境へ反映されない。

## Git管理外のディレクトリ

`tmp/`は隔離ホームと適用前バックアップの保存先、`old/`はRulesync移行前の手書き指示ファイルの保管先であり、どちらもGit管理対象外である。`old/`の内容は現行の配布内容ではないため、仕様の根拠として参照しないこと。
