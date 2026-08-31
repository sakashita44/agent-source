---
name: artifact-principles
description: >-
  Use when deciding where information and intent belong across code, tests,
  comments, change history, specifications, issues, documentation, or ADRs,
  and when identifying artifact responsibilities or sources of truth.
---
# Artifact Principles

## 実装に関する成果物

- コードは実現方法を表す
- テストは期待する振る舞いを表す
- 変更履歴は、その時点で確定した判断理由を後から追跡できる場所として使う
- コードコメントは、採用しなかった選択肢、非自明な制約、回避すべき落とし穴など、コードから読み取れない理由を表す。実装方法を言い換えない

## 計画と知識に関する成果物

- 仕様書とコンセプト文書は、実現前の意図、目的、期待する振る舞いを表す
- Issueは、流動的な実装経路、作業分解、順序、実装中に調整する具体値を表す
- `docs/`などの固定文書は、実装として成立した現行の事実を表す
- ADRとdecision recordは、長期に参照する判断理由を表す

上位の成果物では意図を直接記述する。型名、関数名、暫定的な定数などの実装語で意図を圧縮せず、具体化はIssueやコードに近い層で行う。

設計・仕様文書では、読者が責務と正本を判断するために必要な場合、説明または規定する対象、設計上の責務、適用範囲、隣接する成果物との境界を冒頭に置く。

## 正本

同じ規則、仕様、定義には正本を一つ定める。他の成果物には、その場の判断に必要な局所要約と、必要になる条件を伴う正本への参照だけを置く。

仕様、要求、設計文書は、採用済みの規則、要求、適用範囲、設計内容の正本になり得る。文書が決定済みの内容を「定める」「規定する」ことと、人または役割が設計値や採用対象を選ぶことを区別する。
