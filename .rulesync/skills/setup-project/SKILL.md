---
name: setup-project
description: >-
  Use when setting up development standards for a new repository or assessing
  which baseline settings should be introduced into an existing repository.
---
# Setup Project

プロジェクトの技術構成と既存規約に合わせ、開発設定を導入または提案する。[project-standards](https://github.com/sakashita44/project-standards)を参考にするが、対象リポジトリの指示、既存設定、利用ツールを優先する。

## プロジェクトの判定

対象リポジトリのルート、Git状態、主要言語、package manager、build・test・lintの仕組み、既存の設定ファイルとGitHub設定を確認する。空または初期構築中なら新規プロジェクト、運用中のコードや固有設定があるなら既存プロジェクトとして扱う。

`project-standards`のREADMEと、対象技術に関係するディレクトリだけを確認する。分類名へ機械的に当てはめず、対象リポジトリで実際に使う設定だけを選ぶ。

## 状態別の処理

### 新規プロジェクト

共通設定と対象技術の設定を開始点として導入する。`.gitattributes`、`.editorconfig`、ignore、formatter、linter、GitHub設定、project-levelのhookとCIから、対象に必要なものを選ぶ。テンプレートのplaceholderをプロジェクトの実値へ置換し、配置先やコマンドを対象ツールの仕様へ合わせる。

依存関係の導入やhookの有効化は、セットアップの完了に必要な範囲で実行する。外部リポジトリの作成、push、既存ファイルの破壊的な置換など、依頼から自明でない外部変更は別途確認する。

### 既存プロジェクト

既存設定を変更する前に、`project-standards`との差分を調べる。各提案について、対象ファイル、導入する意図、既存挙動への影響、競合する設定を示し、ユーザーの選択を待つ。設定一式の置換や、正本への継続同期は提案しない。

承認された変更だけを、既存の命名、配置、package manager、toolchainへ適応して実施する。既存のhook、CI、formatter、linterが同じ目的を担う場合は重複導入しない。

## 完了確認

- 未置換のplaceholderと一時ファイルが残っていないこと
- 設定ファイルの参照pathと実際の配置が一致すること
- `.gitattributes`とformatterの改行規則が矛盾しないこと
- 導入したコマンド、hook、CIが対象プロジェクトの依存関係と一致すること
- diffに依頼範囲外の変更や秘密情報が含まれないこと

新規プロジェクトでは実施内容と検証結果を報告する。既存プロジェクトでは、未承認の提案を実施済みの変更と区別して報告する。
