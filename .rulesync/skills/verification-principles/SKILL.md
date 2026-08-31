---
name: verification-principles
description: >-
  Use when selecting verification for a change, evaluating evidence from
  checks, or deciding whether implementation work is complete.
---
# Verification Principles

## 検証の選択

変更によって起こり得る失敗を先に特定し、その失敗を観測できる検証を選ぶ。変更の影響範囲、失敗時の損失、復旧の難しさに応じて検証の強度を調整する。

既存のテスト、lint、formatter、pre-commitなどの自動化を優先する。自動化が対象を十分に検証する場合は、同じ検査を手作業で重複させない。対象外の失敗形態には必要な検証を追加する。

## 証拠の扱い

静的な診断と実行環境での検証を区別する。実行していない検証や観測していない結果を成功としない。

実環境への影響を避ける必要がある場合は、dry-runまたは隔離した作業環境を用いる。検証後は、実行した内容と結果、未検証事項、残るリスクを報告する。
