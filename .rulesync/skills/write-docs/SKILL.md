---
name: write-docs
description: >-
  Use when writing or updating technical documentation, README files, Markdown
  under docs/, ADRs, pull request descriptions, or doc comments. Applies the
  documentation structure and content-type rules, then runs the mechanical
  checks before reporting completion.
---
# Write Docs

技術文書を執筆し、更新する。読者、目的、時間、表現の原則は`writing-principles`、情報と意図の配置は`artifact-principles`が正本であり、このSkillは構成の手順、内容種別ごとの必須情報、完了前の機械検査を扱う。

## 適用範囲

Markdown文書、PR description、doc comment、ADRに適用する。コミットメッセージの書式は`commit`に従う。

## 手順

1. 対象ファイルと関連文書を読み、説明対象、主な読者、読者の目的、正本、既存の構成と用語、文書内および文書間の導線を把握する
2. 新規作成と章立ての組み替えを伴う改稿では、本文を書く前に構成案を作り、`references/structure.md`で検査する。段落単位の修正、語句の直し、追記では構成案を経ずに直接編集する
3. 文書の内容種別に応じて`references/content-types.md`を読み、該当する規則を適用する
4. 執筆する
5. 機械検査を実行し、指摘を解消する
6. 複数ファイルにわたる改稿や大規模な新規執筆では、完了後に`verify-docs`での検証を提案する

## 参照先

- `references/structure.md`: 見出し、リスト、情報の順序、構成案を設計するときに読む
- `references/content-types.md`: README、手順、コード例、Reference、設計・アーキテクチャ文書を書くときに読む
- `references/review-examples.md`: 規則の適用可否に迷ったとき、またはレビューで違反を説明するときに読む。通常の執筆では読まない

## 機械検査

完了を報告する前に必ず実行する。生成時に避けられる問題は`writing-principles`が抑えるため、ここで検査するのは、読み流すと気づけないものに限る。

```bash
node <skillのディレクトリ>/../verify-docs/scripts/check-structure.mjs --path <対象ファイル...>
node <skillのディレクトリ>/../verify-docs/scripts/check-links.mjs --path <対象ファイル...> [--check-reachability]
node <skillのディレクトリ>/../verify-docs/scripts/check-kanji.mjs --path <対象ファイル...>
```

漢字検査は日本語を含むファイルだけを対象にする。`--check-reachability`を付けると、リンク先へ到達できるかも確かめる。ネットワークを使えない環境ではスキップと報告する。

日本語の文書では、AIらしい書式と語彙の検査も実行する。設定はこのSkillへ同梱しており、対象リポジトリへ依存関係も設定ファイルも足さない。

```bash
npx --yes --package textlint@15.8.0 --package textlint-rule-preset-ai-writing@1.1.0 \
  textlint -c <skillのディレクトリ>/textlintrc.json <対象ファイル...>
```

対象リポジトリが同種の検査を既に持つ場合は、そちらを優先して実行する。

日本語の自然さと読みやすさは`natural-japanese`が扱う。文体と表現の規則が食い違う場合は`writing-principles`に従う。

検査の出力は判断材料であり、そのまま指摘件数にしない。構造検査の件数と形状は、意味上の妥当性を本文から判定したうえで扱う。

## 完了確認

執筆後、対象ファイルと変更した導線を通読する。

- 主な読者と読後の行動を特定できるか
- 一つの文書または節に、異なる読者目的が混在していないか
- 行動に必要な情報を欠かず、目的に寄与しない詳細を含んでいないか
- 現在の事実、将来計画、変更履歴が、それぞれ適切な文書にあるか
- TODOが未解決事項へ局所化され、周囲の本文が執筆途中の状態に依存していないか
- 正本が一つに定まり、他の文書の局所要約がその場の判断に必要な範囲へ収まっているか
- 見出し、リンク、図表、参照対象を文脈外でも識別できるか
- 内容種別ごとの必須情報があるか
- リンク先、コマンド、コード例、期待結果を可能な範囲で検証したか
- 機械検査の指摘を解消したか、解消しない理由を説明できるか
