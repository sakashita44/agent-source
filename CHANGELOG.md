# Changelog

このリポジトリの変更を記録する。

書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に従い、バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Added

- サブエージェント委譲のタイムアウト指定基準（`subagent`）。委譲先の起動手段がタイムアウトまたは待機時間の指定を受け付ける場合、想定所要時間の 3 倍以上、想定が困難な場合は既定の 10 分を基準とする。組み込みの Agent 起動、CLI 実行、CLI をラップするコマンドの待機時間設定など、起動手段を問わず適用する
- リポジトリのエージェント指示ファイルの規約（`setup-project`）。`AGENTS.md` を正本とし、`CLAUDE.md` は `@AGENTS.md` の 1 行で参照する。記載内容の取捨選択、ツールごとの読み込み方式に応じた分量の制約、個人用の内容の配置場所、バージョン管理の方針を定める
- エージェント指示ファイルの作成と更新を `setup-project` へ振り分けるルーティング（`00-global.md`）
- このリポジトリの `AGENTS.md` と `CLAUDE.md`。正本と生成物の区別、生成および適用の手段、Git 管理外ディレクトリの扱いを記載する
- agy の起動時における権限方針（`subagent`）。`--dangerously-skip-permissions` を既定で付与し、副作用の範囲はプロンプトで限定する。呼び出し側の環境がオプションを拒否する場合は、設定の書き換えで迂回せずユーザーへ許可を求める
- WSL の利用ルール（`00-global.md`）。WSL へツールを直接導入せず、WSL でしか実行できない処理は使い捨てコンテナを経由する。コンテナ定義はプロジェクトのリポジトリへ配置し、プロジェクトに属さない一時的な用途では定義を残さずに実行して破棄する

## [1.0.0] - 2026-09-07

### Added

- Rulesync による配布。Claude Code、Codex CLI、Antigravity IDE、Antigravity CLI の 4 配布先へ、rules、skills、subagents、hooks、MCP 設定をホームディレクトリ単位で配布する
- 判断の原則を定める Skill。実装手段の判断ラダーと検討量の配分（`engineering-principles`）、情報と意図の配置（`artifact-principles`）、文章の責務と日本語の文体（`writing-principles`）、検証の選択と完了判定（`verification-principles`）、Git 操作（`git-general`）、委譲（`subagent`）、実行基盤ごとの方式選択（`stack-conventions`）
- 一連の作業を担う Skill。コミット（`commit`）、計画と Issue 分解（`plan`）、要件インタビュー（`grill-me`）、PR のマージ（`pr-merge`）、リリース（`release`）、反復調査（`deep-research`）、文書の執筆（`write-docs`）と検証（`verify-docs`、`verify-manual`）、既存コードの必要性の問い直し（`justify-code`）、コメントの付与（`add-comment`）、外部レビュー（`independent-review`）、開発設定の導入（`setup-project`）
- 検討の経緯を引き継がない立場で判断を行うサブエージェント。計画から検討の経緯を除外する `purify-artifact`、実装に関与していない立場でコメントの内容を決定する `write-comments`
- 会話の圧縮に対する復旧 hook。圧縮の直前に状態を書き出し、圧縮後の最初の注入点で読み直しを指示する。Claude Code と Codex CLI へ配布する
- 決定的な検査を行う Node スクリプト。文書の構造、リンク、常用漢字表外字、調査レポートのソース数と文中引用、未解決レビュースレッドの抽出
- 第三者 Skill の宣言的な取得。`rulesync.jsonc` の `sources` で取得元を宣言し、`rulesync.lock` で commit SHA と整合性ハッシュを固定する。本体はこのリポジトリで管理しない
- 隔離したホームディレクトリへ生成して非破壊性を確認する検証手順（`scripts/verify.ps1`）と、実際のホームディレクトリへ適用する手順（`scripts/apply.ps1`）

[Unreleased]: https://github.com/sakashita44/agent-source/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sakashita44/agent-source/releases/tag/v1.0.0
