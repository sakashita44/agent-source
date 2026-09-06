---
name: pr-merge
description: >-
  Use when the user asks to merge a pull request, including cleanup of local and
  remote branches afterwards. Checks CI, review state, unresolved review
  threads, and the changelog entry before merging.
---
# PR Merge

レビューが終わったPRをマージし、ブランチの後始末まで進める。Git操作の共通原則は`git-general`、検証の選択と完了判定は`verification-principles`が正本であり、このSkillはGitHub固有の状態取得と順序を扱う。

## 実行条件

ユーザーが明示的にマージを依頼した場合だけ使用する。

対象がGitリポジトリであり、`gh`が認証済みであることを確認してから始める。

## マージ前の確認

対象PRを、引数またはカレントブランチから特定する。状態がOPENでなければ、状態を報告して終了する。

対象リポジトリが独自のマージ手順を持つ場合は、それに従う。`AGENTS.md`、`CLAUDE.md`、`CONTRIBUTING.md`、トップレベルの`README`を先に読む。

次をすべて確認する。1つでも満たさない場合はマージせず、満たさない項目を列挙して終了する。

- CIが成功している
- `reviewDecision`が`CHANGES_REQUESTED`でない。承認数だけで判断しない
- 未解決のレビュースレッドがない
- CHANGELOGの`[Unreleased]`に、このPRの変更に対応するエントリがある
- 変更が影響する文書の更新がPRに含まれる。不要な場合はPR descriptionにその理由がある

### 未解決レビュースレッドの抽出

```bash
node <skillのディレクトリ>/scripts/list-unresolved-threads.mjs --repo <owner>/<name> --pr <number>
```

`{"count": N, "unresolved": [...]}`をstdoutへ出力する。取得に失敗した場合は終了コード1とstderrのメッセージを返す。失敗を未解決なしとして扱わない。

### CHANGELOGのエントリが漏れている場合

マージ前にPRのブランチへ追記し、PRへ含める。マージ後のデフォルトブランチへ直接コミットしない。

追記した場合は、追記後の内容をユーザーへ示し、CIの再実行と再レビューが要るかを確認してからマージへ進む。

`[Unreleased]`の見出しへの昇格とバージョン上げは行わない。複数PRが並行すると同じファイルで衝突し、マージ順が入れ替わるとSemVerの連続性が崩れるため、`release`がデフォルトブランチ上で一元的に行う。

## マージと後始末

1. merge commitでマージする
2. ベースブランチへ切り替えてpullする
3. head branchをローカルから削除する。未マージの変更が残る場合は強制削除せず、状況を報告する
4. リモートのhead branchを削除する
5. stale tracking refを掃除する
6. 作業ツリーがクリーンであることを確認する

## 報告

マージしたPR、マージコミット、削除したブランチ、CHANGELOGの状態を報告する。追記や再確認を挟んだ場合は、その経緯も含める。
