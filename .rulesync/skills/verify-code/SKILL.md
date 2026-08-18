---
name: verify-code
description: コードが DRY, Library First, Anti-Spaghetti (SRP), Typed の原則に準拠しているか検証する
allowed-tools: Agent Read Glob Grep Bash

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
# verify-code

コードファイルを DRY・Library First・Anti-Spaghetti (SRP)・Typed の原則に照らして検証する。検証基準は本スキル内に自己完結している。

## 検証対象の決定

- 引数が指定された場合: そのファイル（glob パターン可）を対象とする
- 引数なし: `git diff --name-only main...HEAD` で変更されたコードファイル（*.py, *.ts, *.js 等）を対象とする。変更ファイルがなければエラーとして終了（コード全体の検証はスコープが広すぎるため）

**重要**: diff ではなくファイル全体を読んで検証すること。原則の準拠は局所的な変更ではなくファイル全体の構造で判断する必要がある。

## 検証の実行

以下の 4 つの検証を **個別のサブエージェント（Agent ツール）で並列実行** する。各エージェントには検証対象ファイルの一覧を渡すこと。

### Agent 1: DRY (Don't Repeat Yourself)

対象ファイルおよび関連モジュールを読み、以下を検証:

- 同一または類似のロジックが複数箇所に重複していないか
- 共通化すべきパターンが放置されていないか
- ただし「3行程度の類似コード」は早すぎる抽象化より許容される点に注意

**違反例**:
- 同じバリデーションロジックが 3 ファイル以上にコピーされている
- 定数やマジックナンバーが複数箇所にハードコードされている

### Agent 2: Library First Principle

対象ファイルを読み、以下を検証:

- 標準的な機能（バリデーション、ID生成、日付操作、HTTPクライアント等）を自前実装していないか
- well-maintained なライブラリで代替可能な実装がないか
- pyproject.toml や package.json の既存依存も確認し、プロジェクトが既に持つライブラリの機能を再実装していないか

**注意**: ドメイン固有のロジックは自前実装が正当。汎用的な機能のみを対象とする。

### Agent 3: Anti-Spaghetti / SRP (Single Responsibility Principle)

対象ファイルを読み、以下を検証:

- 関数やクラスが単一の責務を持っているか
- 1つの関数が過度に長くないか（目安: 50行超は要注意）
- モジュール間の結合度が適切か（循環参照、God class の兆候）
- 責務の混在（例: データ取得とビジネスロジックとUI操作が同一関数内）がないか

### Agent 4: Typed (型の厳密さ)

対象ファイルを読み、以下を検証:

- Python: 型アノテーションが関数シグネチャに付与されているか、`Any` の濫用がないか、TypedDict や dataclass が適切に使われているか
- TypeScript: `any` の使用、型アサーション (`as`) の濫用がないか、interface/type が適切に定義されているか
- 戻り値の型が省略されていないか

## 出力形式

各エージェントの結果を統合し、以下の形式で報告:

```
## verify-code 結果

### DRY
- [PASS/FAIL] ファイル名: 指摘内容（FAIL の場合）

### Library First
- [PASS/FAIL] ファイル名: 指摘内容（FAIL の場合）

### Anti-Spaghetti / SRP
- [PASS/FAIL] ファイル名: 指摘内容（FAIL の場合）

### Typed
- [PASS/FAIL] ファイル名: 指摘内容（FAIL の場合）

### 総合: PASS / FAIL（N 件の指摘）
```

全て PASS の場合は簡潔に「全ファイル PASS」と報告する。
