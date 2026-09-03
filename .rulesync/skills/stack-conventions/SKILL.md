---
name: stack-conventions
description: >-
  Use when developing for a specific platform or runtime such as an Android app
  or a game engine, and when choosing its UI toolkit, language, engine, version,
  or ecosystem-standard approach.
---

# Stack Conventions

開発領域ごとに、採用方式を決める前に確認する情報源を定める。領域単位の参考は[references](references)に収める。

このSkillは、確認すべき情報源と確認の手順を正本として定める。個々のライブラリ選定の判断基準は`engineering-principles`が正本であり、ここでは扱わない。

## 参考の位置づけ

referencesの記載は、調査の出発点として置く。エコシステムの推奨方式は短期間で変わるため、記載内容を現行の事実として提案に用いない。

## 判断手順

1. 対象の開発領域に対応するreferenceを読み、判断対象と確認先を把握する
2. 確認先で現行の公式ガイダンスを調査し、対象の版と適用条件を特定する
3. 対象リポジトリの既存構成と規約を確認し、調査結果と整合する方式を選ぶ
4. 提案では、選んだ方式と、根拠にした調査結果を示す

調査結果がreferenceの記載と食い違う場合は、調査結果を採用し、referenceの更新をユーザーへ提案する。対応するreferenceがない領域では、このSkillを適用せず、通常の調査手順で判断する。

## referenceの記述

referenceは開発領域を単位として分け、その領域で選択を要する判断対象ごとに次を記す。

- 判断対象: 選択の対象となる範囲
- 確認先: 現行のガイダンスを確認する一次情報源
- 参考: 記載時点の日付を伴う、調査の出発点となる方式名

複数の選択肢から一つを選ぶ判断では、選択肢を判断対象の下位に置く。採用実績、他リポジトリでの利用状況、経緯は記さない。
