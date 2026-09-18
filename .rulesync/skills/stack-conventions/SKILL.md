---
name: stack-conventions
description: >-
  Use when developing for a specific platform or runtime such as an Android app
  or a game engine, and when choosing its UI toolkit, language, engine, version,
  or ecosystem-standard approach.
---

# Stack Conventions

開発領域ごとに、採用方式を決定する前に確認すべき情報源を定める。領域別の参考情報は [references](references) に格納する。

この Skill は、確認すべき情報源と確認手順を定める。個々のライブラリ選定における判断基準は `engineering-principles` を参照する。

## 参考の位置づけ

references の記載内容は、調査の出発点として位置づける。エコシステムにおける推奨方式は短期間で変化するため、記載内容を現行の事実として提案に用いない。

## 判断手順

1. 対象の開発領域に対応する reference を確認し、判断対象と確認先を把握する
2. 確認先において現行の公式ガイダンスを調査し、対象の版と適用条件を特定する
3. 対象リポジトリの既存構成および規約を確認し、調査結果と整合する方式を選定する
4. 提案時には、選定した方式と、その根拠となる調査結果を提示する

調査結果が reference の記載と異なる場合は、調査結果を採用し、reference の更新をユーザーへ提案する。対応する reference が存在しない領域では、この Skill を適用せず、通常の調査手順に沿って判断する。

## reference の記述

reference は開発領域ごとに分割し、その領域で選択が必要となる判断対象ごとに次の項目を記載する。

- 判断対象: 選択の対象となる範囲
- 確認先: 現行のガイダンスを確認する一次情報源
- 参考: 記載時点の日付を伴う、調査の出発点となる方式名

複数の選択肢から一つを選択する判断では、選択肢を判断対象の下位に配置する。採用実績、他のリポジトリでの利用状況、経緯などは記載しない。
