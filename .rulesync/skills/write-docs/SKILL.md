---
name: write-docs
description: >-
  Use when writing or updating technical documentation, README files, Markdown
  under docs/, ADRs, pull request descriptions, or doc comments. Applies the
  documentation structure and content-type rules, then runs the mechanical
  checks before reporting completion.
---
# Write Docs

技術文書の執筆および更新を行う。構成の検討手順、内容種別ごとの必須情報、完了前の機械検査を扱う。

読者、目的、時間、表現の原則は `writing-principles`、情報と意図の配置は `artifact-principles` を参照のこと。

## 適用範囲

Markdown 文書、PR description、doc comment、ADR に適用する。コミットメッセージの書式は `commit` に従う。

## 手順

1. 対象ファイルと関連文書を読み、説明対象、主な読者、読者の目的、正本、既存の構成と用語、文書内および文書間の導線を把握する
2. 新規作成や章立ての再編を伴う改稿では、本文を書く前に構成案を作成し、`references/structure.md` で検査する。段落単位の修正、語句の推敲、追記では構成案を経ずに直接編集する
3. 文書の内容種別に応じて `references/content-types.md` を確認し、該当する規則を適用する
4. 本文を執筆する
5. 機械検査を実行し、指摘事項を解消する
6. 複数ファイルにわたる改稿や大規模な新規執筆では、完了後に `verify-docs` での検証を提案する

## 参照先

- `references/structure.md`: 見出し、リスト、情報の順序、構成案を設計するときに参照する
- `references/content-types.md`: README、手順、コード例、Reference、設計・アーキテクチャ文書を作成するときに参照する
- `references/review-examples.md`: 規則の適用可否に迷ったときや、レビューで違反理由を説明するときに参照する。通常の執筆では参照しない

## 機械検査

完了を報告する前に必ず実行すること。

```bash
node <skillのディレクトリ>/../verify-docs/scripts/check-structure.mjs --path <対象ファイル...>
node <skillのディレクトリ>/../verify-docs/scripts/check-links.mjs --path <対象ファイル...> [--check-reachability]
node <skillのディレクトリ>/../verify-docs/scripts/check-kanji.mjs --path <対象ファイル...>
```

漢字検査は日本語を含むファイルのみを対象とする。`--check-reachability` を指定すると、リンク先への到達性も併せて確認する。ネットワークを使用できない環境では、スキップした旨を報告する。

日本語の文書では、AI 特有の不自然な書式や語彙に関する検査も実行する。検査設定はこの Skill 内に同梱されており、対象リポジトリに新たな依存関係や設定ファイルを追加することはない。

```bash
npx --yes --package textlint@15.8.0 --package textlint-rule-preset-ai-writing@1.1.0 \
  textlint -c <skillのディレクトリ>/textlintrc.json <対象ファイル...>
```

対象リポジトリが同種の検査を既に備えている場合は、そちらを優先して実行する。

日本語の自然さと読みやすさは `natural-japanese` が扱う。文体と表現の規則に競合がある場合は `writing-principles` に従う。

検査ツールの出力結果は判断材料であり、機械的にすべて指摘件数として扱わない。構造検査の件数や階層の形状は、本文から意味上の妥当性を判定したうえで対処を判断する。

## 完了確認

執筆後、対象ファイルおよび変更した導線を通読して確認すること。

- 主な読者と読後の行動を特定できるか
- 一つの文書または節に、異なる読者目的が混在していないか
- 行動に必要な情報を欠かず、目的に寄与しない詳細を含んでいないか
- 現在の事実、将来計画、変更履歴が、それぞれ適切な文書に配置されているか
- TODO が未解決事項へ局所化され、周囲の本文が執筆途中の状態に依存していないか
- 正本が一つに定まり、他の文書の局所要約がその場の判断に必要な範囲へ収まっているか
- 見出し、リンク、図表、参照対象を文脈外でも識別できるか
- 内容種別ごとの必須情報が含まれているか
- リンク先、コマンド、コード例、期待結果を可能な範囲で検証したか
- 機械検査の指摘を解消したか、解消しない理由を説明できるか
