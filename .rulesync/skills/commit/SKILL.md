---
name: commit
description: >-
  Git commit helper with conventional commits. Use when the user wants to commit
  changes, says "commit", or asks to save their work to git.
---
# Git Commit

## 実行条件

ユーザーが明示的にコミットを依頼した場合にのみ使用する。自発的なコミットは行わず、この Skill を使わないコミットも行わない。

Git 操作の共通原則には `git-general`、検証の選択と完了判定には `verification-principles` を併用する。この Skill は、変更単位の確定、ステージング、コミットメッセージの作成、コミット実行、結果確認を一続きの手順として扱う。

## コミット手順

### 変更状態を確認する

次を可能な範囲で並行して実行する。

```bash
git status --short
git diff --staged
git diff
```

未追跡ファイルは `git diff` には現れない。コミット単位の判断に関係する未追跡ファイルについて、内容、種類、既存ファイルとの関係を個別に確認する。ファイル名のみから変更内容を推測しない。

確認した staged、unstaged、untracked の状態をユーザーへ提示する。出力が大きい場合は、判断に必要な差分とファイル単位の要約を示す。

### コミット単位を確定する

staged changes がない場合は、確認した差分を論理的な変更単位に分割し、最初にコミットする単位を提案する。同一の Issue や feature に属していても、設定、ロジック、文書など関心が異なる変更を一つにまとめない。細かい単位への分割を優先する。

ただし、一つの feature のみを支えるために追加した設定ファイルなど、その feature がなければ存在しない support file は、feature と同じ単位に含める。

ユーザーが対象単位を承認または調整した後に、対象ファイルを名前で指定して stage する。

```bash
git add <file>...
```

`git add -A` は、ユーザーが明示的に承認した場合にのみ使用する。すでに staged changes がある場合は、その内容を対象単位として次へ進む。新たに stage した場合は `git diff --staged` を再実行し、承認された範囲のみが含まれていることを確認する。

### メッセージを確定する

Conventional Commits の prefix を用いる。

| Prefix | 用途 |
| --- | --- |
| `feat:` | ユーザー向け機能の追加 |
| `fix:` | ユーザーに影響する不具合の修正 |
| `docs:` | 文書のみの変更 |
| `refactor:` | 挙動を変えないコード構造の変更 |
| `test:` | テストの追加または変更 |
| `chore:` | 開発環境、tooling、依存関係、CI の変更 |

`fix:` はユーザーに影響する不具合の修正に限定する。開発環境の修正には `chore:` を用いる。prefix が差分から一意に決まる場合は自動で選定し、判断が分かれる場合にのみユーザーへ確認する。

メッセージは次の形式とする。

```text
<prefix>: <summary>

<background>

- <change 1>: <reason>
- <change 2>: <reason>
```

- summary は、差分だけでは分からない変更理由や意図を簡潔に示す。変更内容自体が理由を十分に表している場合は、その内容を記載してよい
- background は、変更が必要になった問題や状況を文章で示す。summary だけで経緯を十分に説明できる単純な変更では省略できる
- body の各 bullet は、一つの論理的な変更とその固有の理由を `- <what>: <why>` で示す。単純な変更を除き、省略しない
- repository の指示と直近の `git log --oneline -5` から使用言語を確認する
- 日本語は常体で記述し、事実を明確に述べる

草案をユーザーへ提示し、承認または修正を受けてからコミットする。

### 承認済みメッセージでコミットする

複数行または複数 bullet のメッセージは、原則として `git commit -F` に全文を一度に渡す。複数の `-m` は引数ごとに段落が分かれるため、連続する bullet には使用しない。

#### Bash

quoted heredoc を `git commit -F -` の標準入力へ直接渡す。一時ファイルのパスや cleanup に依存せず、変数展開と backtick 展開も防止できる。

```bash
git commit -F - <<'EOF'
docs: コミット手順の再現性を高める

シェル差異によりメッセージへ区切り文字が混入する経路が残っていた。

- Bash: quoted heredocから標準入力へ直接渡し、一時パスへの依存をなくす
- PowerShell: BOMなしUTF-8の一時ファイルを使用し、日本語を保持する
EOF
```

Bash に PowerShell の here-string 記法を渡さない。`@'` と `'@` は Bash で区切り文字として認識されず、`@` などがコミットメッセージに混入する原因となる。

#### PowerShell

承認済みメッセージを Git 管理領域内の一意な一時ファイルへ BOM なし UTF-8 で書き出し、`git commit -F` に渡す。here-string の開始記号と終了記号はそれぞれ独立した行に配置し、終了記号 `'@` を行頭に置く。here-string を `git commit -F -` へ pipe しない。

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

- prefix、summary、background、bullet の順序と改行構造が一致していること
- 日本語の文字化け、先頭の BOM、行末の `CR`、escape artifact、欠落、truncation がないこと
- approved draft にない単独の `@`、`@'`、`'@`、`EOF` などの区切り文字が混入していないこと

`@` を一律に禁止するわけではない。メールアドレス、GitHub mention、trailer など、承認済み草案に意図して含めた `@` は正しい内容として扱う。照合に失敗した場合は自動で amend せず、差異をユーザーへ報告する。

pre-commit hook が失敗した場合は、コミットが作成されていないことを確認し、hook の出力と hook が自動変更したファイルの内容を調査する。差分を再確認し、意図したファイルのみを再度 stage して、通常の `git commit` を再実行する。差分またはメッセージが承認時から実質的に変更された場合は、再実行前に草案を更新してユーザーへ提示する。`--amend` は使用しない。

コミット対象から分割した変更が残っている場合は、その状態を報告し、次の単位を続けてコミットするかを確認する。

## 禁止事項

- ユーザーから明示的な依頼がない限り `--amend` を使用しない
- ユーザーから明示的な依頼がない限り `git push` を実行しない
- lint、formatter、type checker を手動で重複実行せず、repository に設定された pre-commit などの自動化を優先する
- project-level の Git hook、pre-commit、CI の設定をこの Skill に内包しない
