---
name: verify-docs
description: "ドキュメントが Documentation Style ルール（正本: write-docs スキル。文書の目的と想定読者・Zero-Context Reader Principle・時間的コンテキストからの独立・読者の導線・禁止パターン・文体・構造・実行情報・参照情報）に準拠しているか検証する"
allowed-tools: Agent Read Glob Grep PowerShell

targets:
  - claudecode
  - codexcli
claudecode:
  disable-model-invocation: true
codexcli:
  policy:
    allow_implicit_invocation: false
  argument-hint: "[file or glob pattern]"
---
# verify-docs

ドキュメントを Documentation Style ルールに照らして検証する。正本は `~/.claude/skills/write-docs/SKILL.md` と同スキルの `references/` にある。本スキルは検証の分担と統合方法だけを定め、判定規則は正本を優先する。正本と本スキルに差異がある場合は、正本に従って検証し、差異を報告する。

## 検証対象

- 引数あり: 指定されたファイルを対象とする。glob パターンを使用できる
- 引数なし: `git diff --name-only main...HEAD` に含まれる `*.md`、`*.yaml`、`*.yml`、`*.json` を対象とする。該当ファイルがなければ `docs/` 配下の全 Markdown を対象とする

diff ではなくファイル全体を読む。対象の役割、導線、参照先を判断するために必要な関連文書も読む。

## 実行方法

8 つの意味検証を個別のサブエージェントで実行する。利用可能な同時実行枠まで並列に起動し、残りは先行エージェントの終了後に順次実行する。各エージェントへ対象ファイルの一覧、担当する正本、出力形式を渡す。担当外の規則は判定せず、担当間で重複した指摘は統合時に一件へまとめる。

機械検証は意味検証と並行して実行する。ただし構造検査の出力は Agent 7 の入力であるため、Agent 7 は構造検査の完了後に起動する。

## 意味検証の分担

### Agent 1: 文書の目的と想定読者

- 正本: `~/.claude/skills/write-docs/SKILL.md`
- 対象: 説明対象、主な読者、読者の目的、必要十分性、入口文書の責務
- 境界: 内容種別に固有の必須情報は Agent 8 に委ねる

### Agent 2: Zero-Context Reader Principle

- 正本: `~/.claude/skills/write-docs/SKILL.md`
- 対象: 暗黙知への依存、用語の自明性、文脈外識別可能性、現在の事実としての自己完結性
- 境界: 時点や変更履歴の配置は Agent 3、見出しとラベルの構造は Agent 7 に委ねる

### Agent 3: 時間的コンテキストからの独立

- 正本: `~/.claude/skills/write-docs/SKILL.md`
- 追加参照: 適用境界の判断に迷う場合は `~/.claude/skills/write-docs/references/review-examples.md`
- 対象: 基準時点へ依存する表現、比較基準、現行仕様と時系列情報の配置
- 境界: CHANGELOG、リリースノート、ADR、移行手順、障害報告、将来計画では、変化の基準点が明示されているかを検証する

### Agent 4: 読者の導線

- 正本: `~/.claude/skills/write-docs/SKILL.md`
- 対象: 文書内と文書間の到達経路、参照条件、位置に依存しない参照、孤立した情報、正本と局所要約
- 境界: リンクラベルの機械的検出はリンク検査へ委ね、意味上の識別可能性を判定する

### Agent 5: 禁止パターン

- 正本: `~/.claude/skills/write-docs/references/review-examples.md`
- 対象: `SKILL.md` の禁止パターンに対応する Good、Bad、適用境界
- 境界: パターン一致だけで違反とせず、例外と文書種別を正本から判定する

### Agent 6: 文体と表現

- 共通の正本: `~/.claude/skills/write-docs/SKILL.md`
- 日本語の正本: 日本語を含む場合は `~/.claude/skills/write-docs/references/japanese-style.md`
- 対象: 簡潔性、用語、メタ言及、強調、演出、効能約束、言語別の文体、動詞、意味上の主体、文法上の主語、指示、表記
- 境界: 構造による改善が必要な指摘では問題を示し、具体的な階層変更は Agent 7 に委ねる

### Agent 7: 構造

- 正本: `~/.claude/skills/write-docs/references/structure.md`
- 入力: 対象ファイルと `check-structure.ps1` の出力
- 対象: 見出しとリストの粒度、対等性、包含と依存、近接配置、横断的内容、全体像、反復構成、分類と例示、文脈外識別可能性
- 境界: スクリプトの件数と形状は警告材料として用い、意味上の妥当性を本文から判定する
- 指摘: 対象箇所と、上位へ移す、下位へ移す、束ねる、構成を統一するのいずれかを示す

### Agent 8: 実行情報と参照情報

- 正本: `~/.claude/skills/write-docs/references/content-types.md`
- 追加参照: 適用境界の判断に迷う場合は `~/.claude/skills/write-docs/references/review-examples.md`
- 対象: README、手順、コード例、Reference、設計・アーキテクチャ文書に必要な情報と、各内容種別の責務
- 境界: 文書の内容種別を先に特定し、該当する規則だけを適用する。実行不能な例や不可逆な操作を、一般的な文体問題として扱わない

## 機械検証

### 構造検査

```powershell
& "$env:USERPROFILE/.claude/skills/verify-docs/scripts/check-structure.ps1" -Path <対象ファイルパス...>
```

見出しツリー、同一階層の項目数、見出しレベルの飛び、リスト項目数、対等な節の下位構成を出力する。出力を Agent 7 へ渡し、最終結果の「構造」に転記する。

### 漢字検査

日本語ファイルだけを対象にする。

```powershell
& "$env:USERPROFILE/.claude/skills/verify-docs/scripts/check-kanji.ps1" -Path <対象ファイルパス...>
```

中国語簡体字の疑い、常用漢字表外字、同一ファイル内の表記ゆれを出力する。意味判断を加えず、最終結果の「漢字」に転記する。

### リンク検査

```powershell
& "$env:USERPROFILE/.claude/skills/verify-docs/scripts/check-links.ps1" -Path <対象ファイルパス...>
```

「ここ」「こちら」「here」「click here」「this link」だけを表示文言とする Markdown リンクを出力する。最終結果の「リンク」に転記し、参照条件やリンク先の妥当性は Agent 4 または Agent 8 の意味検証で判定する。

## 結果の統合

各意味検証は、ファイルごとに `[PASS]` または `[FAIL]`、該当箇所、規則、修正方向を返す。機械検証の「注意」「要確認」「要見直し」は、それだけで総合 FAIL としない。対応する意味検証が違反と判定した場合だけ指摘件数へ含める。スクリプトが明確な構文違反または欠落ファイルを報告した場合は FAIL とする。

```markdown
## verify-docs 結果

### 文書の目的と想定読者
### Zero-Context Reader Principle
### 時間的コンテキストからの独立
### 読者の導線
### 禁止パターン
### 文体と表現
### 構造の意味検証
### 実行情報と参照情報
### 構造（見出し数・レベルの飛び・下位構成）
### 漢字（簡体字混入・常用漢字表外字・表記ゆれ）
### リンク（曖昧な表示文言）
### 総合: PASS / FAIL（N 件の指摘）
```

全項目が PASS の場合は「全ファイル PASS」と簡潔に報告する。
