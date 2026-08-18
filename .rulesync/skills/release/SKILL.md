---
name: release
description: >-
  CHANGELOG の [Unreleased] をバージョン見出しへ昇格し、タグ付けしてリリースする。
  Use when the user asks to cut or tag a release（「リリースして」「バージョンを上げて」「タグを打って」等）.
  Keep a Changelog / SemVer に従い、リポジトリ固有のリリース手順があればそれを優先する。
allowed-tools: Bash Read Edit Glob Grep AskUserQuestion

claudecode:
  argument-hint: "[version]"
---
# release

リリース作業を行う。リポジトリ固有手順の把握 → 前提確認 → バージョン決定 → 反映 → コミット・タグ → 報告の順で進める。

このスキルはユーザがリリースを指示した場合にのみ起動する。自発的にリリースを開始しない。

## Step 1: リポジトリ固有手順の把握

- リポジトリの CLAUDE.md、README.md、maintenance.md、RELEASING.md、CONTRIBUTING.md、docs/ 配下、.github/ 配下からリリース手順に関する記述を探索する
- 記載された手順（リリース前に実行するスクリプト、成果物生成、デプロイ等）があれば、本スキルの手順に優先して統合する
- `gh release list` で GitHub Release の運用有無を確認する

## Step 2: 前提確認

- デフォルトブランチ上にいるか、作業ツリーがクリーンか、リモートと同期済みか（`git status`、`git fetch` 後にリモートと比較）
- CHANGELOG.md の `[Unreleased]` に昇格対象の内容があるか。空なら報告して終了

## Step 3: バージョン決定

- 引数があればそのバージョンを使う
- なければ直前バージョン（既存タグと CHANGELOG の最新見出し）を起点に、`[Unreleased]` の内容から SemVer で判定する: 破壊的変更 → major、feat / Added → minor、fix のみ → patch
- 既存タグと CHANGELOG・バージョンファイル間で記載バージョンに食い違いがあれば、この時点で報告する
- 判定結果と根拠を提示し、AskUserQuestion でユーザ確認を得る

## Step 4: バージョン反映

- CHANGELOG.md: `[Unreleased]` を `## [x.y.z] - YYYY-MM-DD` に昇格し、新しい空の `[Unreleased]` セクションを先頭に置く。末尾に比較リンクがあれば更新する
- バージョン番号を持つファイル（pyproject.toml、package.json、マニフェスト等）を Grep で探索し、更新する

## Step 5: コミット・タグ・push

1. commit スキル（Skill ツール）を呼び出してリリースコミットを作る（例: `chore: release x.y.z`）
2. タグを打つ。`v` 接頭辞の有無は既存タグの命名慣行に合わせる
3. push（`git push --follow-tags`）は実行前にユーザ確認を得る
4. GitHub Release を運用しているリポジトリでは、CHANGELOG の該当バージョンのセクションを notes として `gh release create` を実行する

## Step 6: 報告

昇格したバージョン、更新したファイル、タグ、作成した場合は Release URL を報告する。
