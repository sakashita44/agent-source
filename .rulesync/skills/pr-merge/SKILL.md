---
name: pr-merge
description: >-
  レビュー完了した PR をマージし、ブランチのクリーンアップまで行う。
  Use when the user asks to merge a PR（「マージして」「PR をマージ」等）.
  CI・レビュー状態・CHANGELOG 等のリポジトリ固有手順を確認し、merge commit でマージ後、
  ローカル/リモートブランチ削除と stale tracking ref の掃除を行う。
allowed-tools: Bash Read Glob Grep AskUserQuestion

claudecode:
  argument-hint: "[PR number]"
---
# pr-merge

PR のマージとクリーンアップを行う。確認 → マージ → 掃除の順で進め、確認段階で問題があればマージせず報告して終了する。

このスキルはユーザがマージを指示した場合にのみ起動する。自発的にマージを開始しない。

## Step 1: PR の特定

- `git rev-parse --is-inside-work-tree` で git リポジトリであることを確認する。リポジトリでなければエラーとして終了
- 引数があればその PR 番号を、なければカレントブランチに紐づく PR を使う
- `gh pr view <番号> --json number,title,url,state,baseRefName,headRefName` で取得し、state が OPEN でなければ報告して終了

## Step 2: マージ可否の確認

`gh pr view <番号> --json reviewDecision,statusCheckRollup,mergeable,mergeStateStatus` で状態を取得し、以下を確認する:

- CI チェックが全て成功している
- reviewDecision が CHANGES_REQUESTED でない。required approvals が 0 の設定でも CHANGES_REQUESTED はマージをブロックしうるため、承認数だけで判断しない
- 未解決のレビュースレッド（Copilot コメント含む）がない。GraphQL で `reviewThreads` の `isResolved` フィールドを取得し、クライアント側（jq）で `isResolved == false` を抽出する。`isResolved` は引数として渡せない（フィールドとしてのみ存在する）

```bash
gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          path
          comments(first: 1) { nodes { body author { login } } }
        }
      }
    }
  }
}' -F owner=<owner> -F repo=<repo> -F pr=<番号> \
  --jq '.data.repository.pullRequest.reviewThreads.nodes | map(select(.isResolved | not))'
```

## Step 3: リポジトリ固有手順の確認

- リポジトリの CLAUDE.md、README.md、CONTRIBUTING.md、maintenance.md、docs/ 配下からマージ手順・リリース運用に関する記述を探索し、記載があればそれに従う
- CHANGELOG.md が存在する場合: PR がユーザ影響のある変更（feat / fix / 破壊的変更）を含むなら、`[Unreleased]` に対応するエントリが PR に含まれているか確認する
- ドキュメント完全性: 影響を受けるドキュメント（README、doc comment 等）の更新が PR に含まれているか。含まれない場合、PR description に不要である理由が明記されているか

## Step 4: 判定

- Step 2〜3 で問題が見つかった場合: マージせず、問題を列挙して終了する。修正の要否はユーザが判断する
- 全て問題なければ Step 5 に進む

## Step 5: マージ

`gh pr merge <番号> --merge` を実行する。merge commit を作る（squash・rebase は使わない）。

## Step 6: クリーンアップ

1. ベースブランチに切り替えて `git pull`
2. マージ済み head ブランチをローカルから削除する（`git branch -d`。`-D` は使わない）
3. リモートブランチが残っていれば `git push origin --delete <branch>`（リポジトリ設定で自動削除される場合はスキップ）
4. `git fetch --prune` で stale tracking ref を掃除する
5. `git status` で作業ツリーがクリーンであることを確認する

## Step 7: 報告

マージした PR（URL）、マージコミット、削除したブランチ、CHANGELOG の状態（更新済み / 対象外）を報告する。
