---
name: commit
description: >-
  Git commit helper with conventional commits. Use when the user wants to commit
  changes, says "commit", or asks to save their work to git.
---
# Git Commit

## 実行条件

ユーザーが明示的にコミットを依頼した場合だけ使用する。自発的にコミットせず、このSkillを使わずにコミットしない。

Git操作の共通原則には`git-general`、検証の選択と完了判定には`verification-principles`を併用する。このSkillは、変更単位の確定、ステージング、コミットメッセージ、コミット実行、結果確認を一続きの手順として扱う。

## コミット手順

### 変更状態を確認する

次を可能な範囲で並行して実行する。

```bash
git status --short
git diff --staged
git diff
```

未追跡ファイルは`git diff`へ現れない。コミット単位の判断に関係する未追跡ファイルについて、内容、種類、既存ファイルとの関係を個別に確認する。ファイル名だけから変更内容を推測しない。

確認したstaged、unstaged、untrackedの状態をユーザーへ示す。出力が大きい場合は、判断に必要な差分とファイル単位の要約を示す。

### コミット単位を確定する

staged changesがない場合は、確認した差分を論理的な変更単位へ分け、最初にコミットする単位を提案する。同じIssueやfeatureに属していても、設定、ロジック、文書など関心が異なる変更を一つにまとめない。細かい単位を優先する。

ただし、一つのfeatureだけを支えるために追加した設定ファイルなど、そのfeatureがなければ存在しないsupport fileはfeatureと同じ単位へ含める。

ユーザーが対象単位を承認または調整してから、対象ファイルを名前で指定してstageする。

```bash
git add <file>...
```

`git add -A`は、ユーザーが明示的に承認した場合だけ使用する。すでにstaged changesがある場合は、その内容を対象単位として次へ進む。新たにstageした場合は`git diff --staged`を再実行し、承認された範囲だけが含まれることを確認する。

### メッセージを確定する

Conventional Commitsのprefixを用いる。

| Prefix | 用途 |
| --- | --- |
| `feat:` | ユーザー向け機能の追加 |
| `fix:` | ユーザーに影響する不具合の修正 |
| `docs:` | 文書だけの変更 |
| `refactor:` | 挙動を変えないコード構造の変更 |
| `test:` | テストの追加または変更 |
| `chore:` | 開発環境、tooling、依存関係、CIの変更 |

`fix:`はユーザーに影響する不具合修正に限定する。開発環境の修正には`chore:`を用いる。prefixが差分から一意に決まる場合は自動で選び、判断が分かれる場合だけユーザーへ確認する。

メッセージは次の形式とする。

```text
<prefix>: <summary>

<background>

- <change 1>: <reason>
- <change 2>: <reason>
```

- summaryは、差分だけでは分からない変更理由または意図を簡潔に示す。変更内容そのものが理由を十分に表す場合は、その内容を記載してよい
- backgroundは、変更が必要になった問題または状況を文章で示す。summaryだけで経緯を十分に残せる単純な変更では省略できる
- bodyの各bulletは、一つの論理的な変更とその固有の理由を`- <what>: <why>`で示す。単純な変更を除いて省略しない
- repositoryの指示と直近の`git log --oneline -5`から使用言語を確認する
- 日本語は常体で書き、事実を明確に述べる

草案をユーザーへ示し、承認または修正を受けてからコミットする。

### 承認済みメッセージでコミットする

複数行または複数bulletのメッセージは、原則として`git commit -F`へ全文を一度に渡す。複数の`-m`は引数ごとに段落を分けるため、連続するbulletには使用しない。

#### Bash

quoted heredocを`git commit -F -`の標準入力へ直接渡す。一時ファイルのパスやcleanupへ依存せず、変数展開とbacktick展開も防げる。

```bash
git commit -F - <<'EOF'
docs: コミット手順の再現性を高める

シェル差異によりメッセージへ区切り文字が混入する経路が残っていた。

- Bash: quoted heredocから標準入力へ直接渡し、一時パスへの依存をなくす
- PowerShell: BOMなしUTF-8の一時ファイルを使用し、日本語を保持する
EOF
```

BashへPowerShellのhere-string記法を渡さない。`@'`と`'@`はBashで区切り文字にならず、`@`などがコミットメッセージへ混入する。

#### PowerShell

承認済みメッセージをGit管理領域内の一意な一時ファイルへBOMなしUTF-8で書き、`git commit -F`へ渡す。here-stringの開始記号と終了記号はそれぞれ独立した行へ置き、終了記号`'@`を行頭へ置く。here-stringを`git commit -F -`へpipeしない。

```powershell
$gitDirectory = git rev-parse --absolute-git-dir
if ($LASTEXITCODE -ne 0) {
    throw 'Git管理領域を解決できなかった。'
}

$messagePath = Join-Path $gitDirectory (
    'commit-message-{0}.txt' -f [System.Guid]::NewGuid().ToString('N')
)
$message = @'
docs: コミット手順の再現性を高める

シェル差異によりメッセージへ区切り文字が混入する経路が残っていた。

- Bash: quoted heredocから標準入力へ直接渡し、一時パスへの依存をなくす
- PowerShell: BOMなしUTF-8の一時ファイルを使用し、日本語を保持する
'@

try {
    [System.IO.File]::WriteAllText(
        $messagePath,
        $message,
        [System.Text.UTF8Encoding]::new($false)
    )
    git commit -F $messagePath
    if ($LASTEXITCODE -ne 0) {
        throw "git commitが終了コード$LASTEXITCODEで失敗した。"
    }
} finally {
    Remove-Item -LiteralPath $messagePath -Force -ErrorAction SilentlyContinue
}
```

### 結果を確認する

コミット後に次を実行する。

```bash
git log -1 --format=%B
git show --stat --oneline HEAD
git status --short
```

コミット済みメッセージを承認済み草案と照合し、次を確認する。

- prefix、summary、background、bulletの順序と改行構造が一致する
- 日本語の文字化け、先頭のBOM、行末の`CR`、escape artifact、欠落、truncationがない
- approved draftにない単独の`@`、`@'`、`'@`、`EOF`などの区切り文字が混入していない

`@`を一律に禁止しない。メールアドレス、GitHub mention、trailerなど、承認済み草案に意図して含めた`@`は正しい内容として扱う。照合に失敗した場合は自動でamendせず、差異をユーザーへ報告する。

pre-commit hookが失敗した場合は、コミットが作成されていないことを確認し、hookの出力とhookが自動変更したファイルを調べる。差分を再確認し、意図したファイルだけを再stageして、通常の`git commit`を再実行する。差分またはメッセージが承認時から実質的に変わった場合は、再実行前に草案を更新してユーザーへ示す。`--amend`は使用しない。

コミット対象から分けた変更が残っている場合は、その状態を報告し、次の単位を続けてコミットするか確認する。

## 禁止事項

- ユーザーが明示的に依頼しない限り`--amend`を使用しない
- ユーザーが明示的に依頼しない限り`git push`を実行しない
- lint、formatter、type checkerを手動で重複実行せず、repositoryに設定されたpre-commitなどの自動化を優先する
- project-levelのGit hook、pre-commit、CI設定をこのSkillへ内包しない
