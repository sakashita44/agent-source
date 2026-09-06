---
name: release
description: >-
  Use when the user asks to cut or tag a release, promote the changelog's
  Unreleased section to a version, bump the version, or publish a GitHub
  Release.
---
# Release

CHANGELOGの`[Unreleased]`をバージョン見出しへ昇格し、タグを打つ。Git操作の共通原則は`git-general`が正本であり、コミットの作成は`commit`に従う。

## 実行条件

ユーザーが明示的にリリースを依頼した場合だけ使用する。

対象リポジトリが独自のリリース手順を持つ場合は、それを優先する。`AGENTS.md`、`CLAUDE.md`、トップレベルの`README`を先に読み、その他はリリース関連の設定ファイルの探索で見つける。ファイル名の列挙に依存しない。

対象リポジトリがリリース自動化を持つ場合は、その仕組みを実行経路として使い、このSkillの手順で置き換えない。

## 開始前の確認

- デフォルトブランチにいる
- 作業ツリーがクリーンである
- リモートと同期している
- GitHub Release運用の有無を確認した
- CHANGELOGの`[Unreleased]`が空でない。空の場合は昇格せず終了する

## バージョンの判定

引数でバージョンが指定されていない場合は、`[Unreleased]`の内容からSemVerを判定する。破壊的変更の有無を、エントリの本文から読む。

既存タグ、CHANGELOGの見出し、バージョン番号を持つファイルの間に食い違いがある場合は、昇格の前に報告する。

判定結果と根拠をユーザーへ示し、確認を得てから次へ進む。

## 昇格とタグ

1. `[Unreleased]`をバージョン見出しへ昇格し、日付を付ける。新しい空の`[Unreleased]`節を置く
2. 比較リンクを持つCHANGELOGでは、リンクを更新する
3. バージョン番号を持つファイルを探索して更新する。整合性の確認は、対象リポジトリの仕組みがあればそれを使う
4. `commit`を使ってリリースコミットを作る
5. 既存タグの命名慣行に合わせてタグを打つ
6. タグを含むpushは、実行前にユーザーへ確認する
7. GitHub Release運用がある場合は、CHANGELOGの該当節をnotesとしてReleaseを作る

デフォルトブランチ上で昇格コミットとタグを作る。リリース専用ブランチを作らない。昇格コミットは機械的な内容であり、レビュー対象にならない。

## 報告

昇格したバージョン、更新したファイル、タグ、Release URLを報告する。
