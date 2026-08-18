---
name: research
description: >-
  多数のファイル読み込みや Web 調査を伴う探索・調査を、サブエージェントへの委譲によるコンテキスト分離で進める
  （モデルはタスクの性質に応じて選定）。
  Use proactively for investigations requiring broad codebase exploration, bulk file reading,
  or multi-source web research. 読み込みはサブエージェントが行い、統合と結論はメインコンテキストで行う。
allowed-tools: Agent Read Glob Grep Bash WebSearch WebFetch

claudecode:
  argument-hint: "[research question]"
---
# research

調査をオーケストレータとして進める。大量の読み込み結果をメインコンテキストに入れず、サブエージェントに要約・抽出させて結論だけを受け取る。

## 適用境界

- 委譲する: 広範なコードベース探索、多数ファイルの内容確認、Web 調査、外部ドキュメントの読み込み
- 委譲しない: 2〜3 ファイルを読めば済む確認、既にコンテキストにある情報の参照

## 手順

1. 調査質問を独立したサブ質問に分割する
2. 各サブ質問を Agent ツールで実行する
    - コードベース探索: subagent_type: `Explore`（読み取り専用）
    - Web 調査・複合調査: subagent_type: `general-purpose`、model: `sonnet`
    - 機械的な走査（ファイル列挙、パターン検出）: model: `haiku`
    - プロンプトに、答えるべき質問・報告フォーマット・出典と確度（well-sourced か単発の傍証か）の明示を要求する。サブエージェントは会話の文脈を持たない前提で自己完結させる
    - プロンプトに「Skill ツール・Agent ツールは使用しないこと（さらなる委譲・再帰的なスキル呼び出しを禁止）。直接ツール（Read/Grep/Glob/WebFetch/WebSearch 等）のみでこのサブ質問を完結させること」を明記する
    - 独立したサブ質問は並列で出す
3. 結果を統合する。矛盾や欠落があれば追加のサブエージェントで埋める
4. 出典・確度を付けて結論を報告する

## 制約

- 結論の導出と推奨の判断はメインコンテキストで行う。サブエージェントには事実の収集と要約をさせる
- サブエージェントへの委譲は1階層まで。追加の掘り下げが必要になった場合、サブエージェント自身に再委譲させず、メインが結果を見た上で新たなサブエージェントを追加でスポーンする
