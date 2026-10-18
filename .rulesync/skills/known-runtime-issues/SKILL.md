---
name: known-runtime-issues
description: >-
  Use when a command or script fails in a way that looks caused by the runtime,
  sandbox, or toolchain rather than by the project or the skill itself, such as
  a permission error that occurs only inside an agent sandbox. Matches the
  failure against known cases and decides the response. Not for normal
  execution.
---

# Known Runtime Issues

実行基盤、サンドボックス、ツールチェーンに起因すると思われる失敗を既知の事例と照合し、対応を決める。事例は [既知の事例](references/known-issues.md) に記載する。

## 照合の手順

1. 失敗したコマンド、エラー、実行環境（エージェント、サンドボックスの種類、ランタイムの版）を確認する
2. 各事例の一致条件と照らし合わせ、すべての条件を満たす事例を探す
3. 一致した事例があれば、その事例の対応と「一致した場合の共通事項」に従う

一致する事例がない場合や、一致条件の一部しか確認できない場合は、既知の事例として扱わない。原因を推測したままホストの設定やランタイムの版を変更せず、確認した事実と仮説を報告する。

## 一致した場合の共通事項

- プロジェクトや Skill に、事例を回避するための処理、設定、ラッパー、環境変数を追加しない
- ランタイムの版を古い版へ恒久的に固定しない
- ファイルの ACL など、ホストの権限や設定を修正しない
- サンドボックスの外での再実行は、事例の対応に挙げられている場合に限る。呼び出し元の権限昇格の手順で承認を得て、失敗したコマンドだけを再実行する。権限確認の無効化や設定の変更で迂回しない
- サンドボックスの外で実行する手段がない場合は、一致した事例と失敗したコマンドを報告して停止する
- 同じ事例による失敗に対し、対応を変えずに再試行を繰り返さない

## 事例の記述

事例は次の項目で記述する。原因の詳細や調査の経緯は記載せず、出典に委ねる。

- 一致条件: エージェントが実行環境とエラーから確認できる条件
- 対応: 一致した場合に取る行動
- 出典: 原因を確認できる上流の issue などの一次情報

エージェントや CLI の版に依存するオプション名は、対応に記載しない。
