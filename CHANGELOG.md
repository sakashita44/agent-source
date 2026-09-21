# Changelog

このリポジトリの変更を記録する。

書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に従い、バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [Unreleased]

### Added

- ローカル実行設定の確認（`00-global.md`）。プロジェクトでコマンドを実行する際は、事前に `mise.local.toml` など Git 管理外のローカル設定ファイルの有無を確認し、存在する場合はその設定を適用して実行する
- 委譲後の待機方法（`subagent`）。完了通知や完了待機の仕組みを優先して利用する。状態を確認する間隔は最低 1 分とし、複雑な依頼の場合は 5〜10 分を目安とする

### Changed

- 情報の所在を表す表現（`writing-principles`）。「正本」を編集する場所、生成元、規則を定める文書、優先する情報源の総称として使わず、関係に応じた動詞で書く。名詞が必要な箇所では「規定元」「生成元」を用いる
- 同じ規則や定義を複数箇所に置かない原則の見出しと表現（`artifact-principles`）。「正本」を「二重管理の回避」「規定元」へ改める
- 各 Skill、README、`AGENTS.md` の用語。「正本」を関係別の表現へ改め、「生成物」「編集元」「局所的な要約」「旧 Skill」「限定削除」「規範的責務」「判定規則」「実際のホームディレクトリ」を平易な語へ改める
- agy の PowerShell 起動例（`subagent`）。実行ファイルを変数へ解決し、呼び出し演算子 `&` で起動する形にする

### Fixed

- Windows 版 Codex で導入済みの `agy` を未導入と判定する問題（`03-subagent-codex.md`）。コマンド名の解決に失敗した場合は、`PATH` の各ディレクトリから `agy.exe` の候補パスを組み立てて存在を確認し、見つかった最初の候補を絶対パスで起動する。候補を確認できない場合に限り、ユーザーへ絶対パスを確認する
- Windows 版 Codex で compact 対策の hook が実行されない問題（`hooks.jsonc`）。Codex 向けの各 hook に、node がユーザーのホームディレクトリからスクリプトを解決する `commandWindows` を併記する。このコマンドは PowerShell と cmd.exe のどちらでも動作する

## [1.1.0] - 2026-09-18

### Added

- サブエージェント委譲のタイムアウト指定基準（`subagent`）。委譲先の起動手段がタイムアウトまたは待機時間の指定を受け付ける場合、想定所要時間の 3 倍以上、想定が困難な場合は既定の 10 分を基準とする。組み込みの Agent 起動、CLI 実行、CLI をラップするコマンドの待機時間設定など、起動手段を問わず適用する
- リポジトリのエージェント指示ファイルの規約（`setup-project`）。`AGENTS.md` を正本とし、`CLAUDE.md` は `@AGENTS.md` の 1 行で参照する。記載内容の取捨選択、ツールごとの読み込み方式に応じた分量の制約、個人用の内容の配置場所、バージョン管理の方針を定める
- エージェント指示ファイルの作成と更新を `setup-project` へ振り分けるルーティング（`00-global.md`）
- このリポジトリの `AGENTS.md` と `CLAUDE.md`。正本と生成物の区別、生成および適用の手段、Git 管理外ディレクトリの扱いを記載する
- agy の起動時における権限方針（`subagent`）。`--dangerously-skip-permissions` を既定で付与し、副作用の範囲はプロンプトで限定する。呼び出し側の環境がオプションを拒否する場合は、設定の書き換えで迂回せずユーザーへ許可を求める
- WSL の利用ルール（`00-global.md`）。WSL へツールを直接導入せず、WSL でしか実行できない処理は使い捨てコンテナを経由する。コンテナ定義はプロジェクトのリポジトリへ配置し、プロジェクトに属さない一時的な用途では定義を残さずに実行して破棄する
- 用語と評価語の規則（`writing-principles`）。一般に通じない造語、略称、独自ラベルを用語にせず、区別は一般語に修飾を加えて表す。判定の基準を読者が特定できない評価語だけで規則を書かない。既存の用語との整合だけを理由に語を選ばず、不自然な既存の用語は使用箇所をあわせて改める
- agy へ編集や文章の書き換えを依頼するときの指示（`subagent`）。サブエージェントを起動させず、対象を直接読み書きさせる。保護したい表記と用語の区別をプロンプトで列挙する

### Changed

- 配布するルール、Skill、サブエージェント定義と、リポジトリの文書の日本語の見直し。意味と指示の強さを保ったまま平易なビジネス文書の表現へ改め、和文と英数字・インラインコードの間の半角スペースとリスト項目末尾の句点なしに表記を揃える
- 意味の取りにくい用語の置き換え。「局所要約」を「局所的な要約」、「断片」を「説明用のコード例」、`verify-manual` の「詰まり」を「中断」、決定の主体を「担当者または役割」とする
- 強調と記述量の規則の具体化（`writing-principles`）。避ける強調に「非常に」「極めて」などの例を示し、置かない記述に書き手がそう定めた経緯や理由を加える

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

[Unreleased]: https://github.com/sakashita44/agent-source/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/sakashita44/agent-source/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/sakashita44/agent-source/releases/tag/v1.0.0
