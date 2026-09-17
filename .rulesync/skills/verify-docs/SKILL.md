---
name: verify-docs
description: >-
  Verify that documents follow the documentation rules. The user starts this
  skill explicitly; do not start it on your own initiative when writing or
  editing documents.
claudecode:
  disable-model-invocation: true
codexcli:
  policy:
    allow_implicit_invocation: false
---
# Verify Docs

文書を、`writing-principles`、`artifact-principles`、`write-docs` の reference に照らして検証する。判定規則の正本はそれらにあり、この Skill は検証の分担と結果の統合を扱う。正本とこの Skill に差異がある場合は正本に従い、差異を報告する。

## 実行条件

ユーザーが明示的に検証を依頼した場合にのみ使用する。文書を書いた流れで自発的に起動しない。

## 検証対象

引数がある場合は、指定されたファイルを対象とする。glob を使用できる。

引数がない場合は、`git diff --name-only <デフォルトブランチ>...HEAD` に含まれる `*.md`、`*.yaml`、`*.yml`、`*.json` を対象とする。該当がなければ `docs/` 配下の Markdown を対象とする。

対象ファイルは全体を読む。差分だけを見て判定しない。対象の役割、導線、参照先を判断するために必要な関連文書もあわせて読む。

## 意味検証の分担

4 つのサブエージェントへ分担する。利用可能な同時実行枠まで並列に起動する。各エージェントへ、対象ファイルの一覧、担当する観点、正本、出力形式を渡す。

担当外の観点についても、気づいた場合は報告してよい。重複する指摘や、読者の判断を変えない指摘は、統合時に除外する。

### 読者と目的

- 正本: `writing-principles`、`artifact-principles`
- 観点: 説明対象、主な読者、読者の目的、必要十分性、入口文書の責務、暗黙知への依存、用語の自明性、文脈外識別可能性、文書内と文書間の到達経路、参照条件、正本と局所要約

### 表現と文体

- 正本: `writing-principles`、`write-docs` の `references/review-examples.md`
- 観点: 簡潔性、用語の一貫性、メタ言及、強調、演出、効能約束、意味上の主体と文法上の主語、指示の終止形、表記、基準時点へ依存する表現、現行仕様と時系列情報の配置、禁止パターン
- 境界: パターン一致だけで違反とせず、例外と文書種別を正本から判定する

### 構造

- 正本: `write-docs` の `references/structure.md`
- 入力: 対象ファイルと構造検査の出力
- 観点: 見出しとリストの粒度、対等性、包含と依存、近接配置、横断的内容、全体像、反復構成、分類と例示
- 指摘: 対象箇所と、上位へ移す、下位へ移す、束ねる、構成を統一するのいずれかを示す

### 内容種別

- 正本: `write-docs` の `references/content-types.md`
- 観点: README、手順、コード例、Reference、設計・アーキテクチャ文書に必要な情報と、各内容種別の責務
- 境界: 文書の内容種別を事前に特定し、該当する規則だけを適用する。実行できない例や不可逆な操作を、一般的な文体の問題として扱わない

## 機械検証

意味検証と並行して実行する。構造検査の出力は構造エージェントの入力となるため、構造エージェントは構造検査の完了後に起動する。

```bash
node <skillのディレクトリ>/scripts/check-structure.mjs --path <対象ファイル...>
node <skillのディレクトリ>/scripts/check-links.mjs --path <対象ファイル...> [--check-reachability]
node <skillのディレクトリ>/scripts/check-kanji.mjs --path <対象ファイル...>
```

漢字検査は日本語を含むファイルだけを対象にする。`--check-reachability` を指定すると、リンク先へ到達できるかも確かめる。ネットワークを使えない環境ではスキップと報告する。

対象リポジトリが同種の検査を既に持っている場合は、そちらを実行経路として使う。

## 結果の統合

各観点は、ファイルごとに `[PASS]` または `[FAIL]`、該当箇所、規則、修正方向を返す。

機械検証の注意と要確認は、それだけで総合 FAIL としない。対応する意味検証が違反と判定した場合に指摘件数へ含める。構文違反または対象ファイルの欠落を報告した場合は FAIL とする。

```markdown
## verify-docs 結果

### 読者と目的
### 表現と文体
### 構造
### 内容種別
### 機械検証（構造・リンク・漢字）
### 総合: PASS / FAIL（N 件の指摘）
```

全項目が PASS の場合は、全ファイル PASS と簡潔に報告する。
