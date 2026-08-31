---
name: engineering-principles
description: >-
  Use when designing or implementing software, reviewing code, or evaluating
  technical proposals, especially when deciding solution scope, technology
  choices, architectural fit, or code quality.
---

# Engineering Principles

## 判断原則

- YAGNIに従い、確認された要求を満たす最小で十分な解決を選ぶ。将来の可能性だけを理由に機能や拡張点を増やさない
- 小さな判断では既存の命名、構造、型付け、依存関係の規約を優先する
- 重要な基盤には確立した標準を用い、ドメイン固有の問題には目的に合わせた設計を行う
- 検証、識別子生成、UIパターンなどの標準的な機能は、既存の依存関係を含む十分に保守されたライブラリを先に評価する
- 目的とエコシステムに適した言語を選ぶ。例えばJavaScriptが候補に上がる場合は、固有の理由がない限り、より堅牢なTypeScriptを用いる。

## 既存構造の扱い

変更前に対象ファイルと関連モジュールを読み、責務、依存関係、既存の規約を把握する。既存構造が要求を安全に受け入れられない場合は、機能追加に先立つリファクタリングを提案する。

明確な規約がない領域では、要求に必要な最小範囲で一貫した方式を定める。

## コード品質

読み手が役割を推測できる名前を使い、関数とモジュールの責務を絞る。可能な範囲で厳密な型を用い、意味のある重複を除く。将来の再利用を予測した抽象化は避け、実際に繰り返される概念だけを共通化する。
