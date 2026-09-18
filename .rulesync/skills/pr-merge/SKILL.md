---
name: pr-merge
description: >-
  Use when the user asks to merge a pull request, including cleanup of local and
  remote branches afterwards. Checks CI, review state, unresolved review
  threads, and the changelog entry before merging.
---
# PR Merge

レビューが完了した PR をマージし、ブランチの処理まで行う。GitHub 固有の状態取得と、マージ前後の実行順序を扱う。

Git 操作の共通原則は `git-general`、検証の選択と完了判定は `verification-principles` を参照する。

## 実行条件

ユーザーが明示的にマージを依頼した場合にのみ使用する。

対象が Git リポジトリであり、`gh` が認証済みであることを確認してから開始する。

## マージ前の確認

対象 PR を、引数またはカレントブランチから特定する。状態が OPEN でなければ、その状態を報告して終了する。

対象リポジトリに独自のマージ手順がある場合はそれに従う。`AGENTS.md`、`CLAUDE.md`、`CONTRIBUTING.md`、トップレベルの `README` を事前に確認する。

次の項目をすべて確認する。1つでも満たさない項目がある場合はマージせず、未達の項目を列挙して終了する。

- CI が成功していること
- `reviewDecision` が `CHANGES_REQUESTED` でないこと。承認数のみで判断しない
- 未解決のレビュースレッドがないこと
- CHANGELOG の `[Unreleased]` に、この PR の変更に対応するエントリが存在すること
- 変更の影響を受ける文書の更新が PR に含まれていること。不要な場合は PR description にその理由が記載されていること

### 未解決レビュースレッドの抽出

```bash
node <skillのディレクトリ>/scripts/list-unresolved-threads.mjs --repo <owner>/<name> --pr <number>
```

`{"count": N, "unresolved": [...]}` を stdout へ出力する。取得に失敗した場合は終了コード 1 と stderr のメッセージを返す。取得失敗を「未解決スレッドなし」として扱わない。

### CHANGELOG のエントリが漏れている場合

マージ前に PR のブランチへ追記し、PR に含める。マージ後のデフォルトブランチへ直接コミットしない。

追記した場合は、追記後の内容をユーザーへ提示し、CI の再実行と再レビューが必要かを確認してからマージへ進む。

`[Unreleased]` の見出しへの昇格とバージョンの繰り上げは行わない。複数の PR が並行すると同一ファイルで競合が発生し、マージ順が入れ替わると SemVer の連続性が損なわれるため、`release` がデフォルトブランチ上で一元的に行う。

## マージと後処理

1. merge commit でマージする
2. ベースブランチへ切り替えて pull する
3. head branch をローカルから削除する。未マージの変更が残っている場合は強制削除せず、状況を報告する
4. リモートの head branch を削除する
5. stale tracking ref を整理する
6. 作業ツリーがクリーンであることを確認する

## 報告

マージした PR、マージコミット、削除したブランチ、CHANGELOG の状態を報告する。追記や再確認が発生した場合は、その経緯も含める。
