---
name: git-general
description: >-
  Use when inspecting Git state or history, performing Git operations, or
  proposing branches, commits, pull requests, merges, tags, or releases.
---
# Git General

## 作業状態の保全

操作前に必要な範囲の status と diff を確認し、ユーザーの既存変更を保全する。依頼範囲外の変更を破棄、上書き、移動しない。reset や checkout による破棄など、復元が困難になる操作は避ける。

コミット、push、merge、tag、release など、履歴や外部状態を確定する操作は、ユーザーからの明示的な依頼と必要な確認に基づいて行う。

## 命名と履歴

- ブランチ名は `<branch_type>/<yyyymm>/sakashita44/<issue_num>-<content>` とする。関連 Issue がない場合は `<issue_num>-` を省略できる
- コミットと PR タイトルには Conventional Commits の prefix を用いる
- `fix:` はユーザーに影響する不具合の修正に限定し、開発環境の変更には `chore:` を用いる
- コミットメッセージと PR タイトルは差分を前提として記述できる。差分だけでは分からない変更理由を記録し、単なる変更内容の列挙にとどめない

## PR とマージ

PR には影響を受ける文書の更新を含める。文書の更新が不要な場合は、その理由を PR description に記載する。

PR は merge commit でマージし、squash merge と rebase merge は用いない。コミット、PR merge、release などに専用の Skill がある場合は、具体的な手順はその Skill に従う。
