---
name: git-general
description: >-
  Use when inspecting Git state or history, performing Git operations, or
  proposing branches, commits, pull requests, merges, tags, or releases.
---
# Git General

## 作業状態の保全

操作前に必要な範囲のstatusとdiffを確認し、ユーザーの既存変更を保全する。依頼範囲外の変更を破棄、上書き、移動しない。resetやcheckoutによる破棄など、復元を困難にする操作を避ける。

コミット、push、merge、tag、releaseなど、履歴または外部状態を確定する操作は、ユーザーの明示的な依頼と必要な確認に基づいて行う。

## 命名と履歴

- ブランチ名は `<branch_type>/<yyyymm>/sakashita44/<issue_num>-<content>` とする。関連Issueがない場合は `<issue_num>-` を省略できる
- コミットとPRタイトルにはConventional Commitsのprefixを用いる
- `fix:`はユーザーに影響する不具合修正に限定し、開発環境の変更には`chore:`を用いる
- コミットメッセージとPRタイトルは差分を前提にできる。差分だけでは分からない変更理由を残し、変更内容の列挙に終始しない

## PRとマージ

PRには影響を受ける文書の更新を含める。文書更新が不要な場合は、その理由をPR descriptionへ記載する。

PRはmerge commitでマージし、squash mergeとrebase mergeは用いない。コミット、PR merge、releaseなどに専用Skillがある場合は、具体的な手順をそのSkillに従う。
