---
name: bitwarden-vault
description: >-
  Use when a task needs a secret stored in the user's Bitwarden vault without
  seeing it, or needs to take stock of or tidy up the vault, such as listing
  items with their URIs and usernames to reconcile them with a credential
  ledger, reading notes, renaming items or updating their notes and URIs,
  reading the public key and fingerprint of an SSH key item to compare it with
  a local key, checking password strength and reuse, registering a secret as a GitHub
  Actions secret, refreshing sudo authentication on a remote host over ssh,
  or generating and saving a new random secret. A broker process in a window on the user's Windows desktop
  holds the unlocked vault and asks the user to approve each transfer.
---

# Bitwarden Vault

利用者の Bitwarden の金庫にある秘密値を、エージェントが値を直接参照せずに利用する。金庫のロック解除と秘密値の受け渡しは、利用者のデスクトップ上のウィンドウで動作する仲介プロセスが担う。エージェントは付属スクリプトを用いて仲介プロセスへ要求を送信し、成否のみを受け取る。

この Skill は Windows でのみ動作する。実行には、ネイティブ版の Bitwarden CLI の実行ファイル（`bw.exe`）が `PATH` にあり、ログイン済みであることが必要である。npm で導入した Bitwarden CLI（`bw.cmd`）は対象外とする。`gh-secret` への送信には GitHub CLI（`gh`）の認証が必要である。

## 仲介プロセスの起動

各操作の前に仲介プロセスを起動する。起動済みの場合は何もしない。

```bash
node <Skill のディレクトリ>/scripts/bw-vault.mjs start --client <エージェントの製品名>
```

付属スクリプトのすべてのコマンドに、`--client` で自身の呼び名を指定すること。呼び名は、利用者が指示した名前があればその名前とし、なければ製品名（`Claude Code`、`Codex`、`Antigravity` など）とする。仲介プロセスは、どのエージェントからのリクエストかをこの呼び名で利用者に表示する。以下の例では `--client` を省略する。

起動すると新しいウィンドウが表示されるため、利用者にそのウィンドウでマスターパスワードの入力を依頼する。スクリプトは最大 90 秒間、ロック解除を待機する。待機中に解除されなかった場合は、利用者の入力完了後に `status` を実行して状態を確認する。

利用者がウィンドウで 15 分間操作しない場合は、金庫がロックされ、仲介プロセスが終了する。ロックの解除前も同様に、15 分以内にマスターパスワードが入力されない場合は終了する。リクエストの送信は操作に含まれない。作業完了後は `stop` を実行して終了させること。

利用者が明示的に指示した場合に限り、`start` に `--idle-minutes <分>` を付けて、ロックまでの時間を 15〜720 分の範囲で延ばしてよい。夜間の長時間のテストなど、作業の途中で利用者が操作できない場合に用いる。延ばした時間はウィンドウの冒頭に表示され、利用者はロックを解除する前に確認できる。起動中の仲介プロセスの時間は変更できないため、変更する場合は `stop` を実行してから、指定し直して起動すること。

```bash
node <Skill のディレクトリ>/scripts/bw-vault.mjs stop
```

Windows の Codex では、仲介プロセスの起動と付属スクリプトの実行をサンドボックスの外で行う。サンドボックス内からは、ウィンドウを開けない場合や、仲介プロセスの待ち受けポートへ接続できない場合があるためである。

## 操作

`send`、`generate`、`edit` と、内容のある項目を対象とする `notes` は、仲介プロセスのウィンドウで利用者が承認した場合に限り実行される。`--reason` には、利用者が承認の可否を判断できるよう、目的と影響を日本語で具体的に指定すること。応答の `approved` が `false` の場合は、利用者が要求を拒否したことを示す。理由を利用者に確認し、同じ要求を繰り返さないこと。ただし `cancelled` が `true` の場合は、利用者の拒否ではなく、仲介プロセスの終了による取り消しである。`start` で仲介プロセスを起動し直してから、同じ要求をやり直してよい。

承認を求める操作は、利用者が承認するまで応答を返さない。コマンドの実行に時間制限があるエージェントでは、制限を 10 分程度に設定すること。応答を待たずに付属スクリプトが中断された場合、そのリクエストは取り消され、利用者が後から承認しても実行されない。

項目名の一覧を取得する。応答には項目名、フォルダ、種別、パスワードの有無が含まれる。アーカイブした項目とゴミ箱の項目は含まれない。

```bash
node <Skill のディレクトリ>/scripts/bw-vault.mjs list [--search <文字列>] [--with <追加の情報>]
```

`--with` には、棚卸しなどで必要な追加の情報だけを、次の値からコンマ区切りで指定する。応答が大きくなるため、不要な情報は指定しないこと。いずれも秘密値を含まないため、承認なしで返される。

- `uris`: URI と、URI ごとの自動入力の判定方法（`default`、`domain`、`host`、`startsWith`、`exact`、`regex`、`never`）。`default` は Bitwarden のアプリの既定の設定に従うことを示す。既定の設定そのものは取得できない
- `username`: ユーザー名
- `dates`: 作成日時、更新日時、パスワードの最終変更日時
- `fields`: カスタムフィールドの名前と種別。値は含まれない
- `flags`: メモと TOTP の有無、お気に入り、マスターパスワードの再要求の設定
- `sshKey`: SSH キーの項目の公開鍵とフィンガープリント（`SHA256:` で始まる形式）。秘密鍵は含まれない。SSH キー以外の項目では `null` となる。手元の鍵と照合する場合は、`ssh-keygen -lf <公開鍵のファイル>` が出力するフィンガープリントと比較すること

メモの本文と、テキストのカスタムフィールドの値を読み取る。対象は `--item` の繰り返し、`--search`、`--all` のいずれかで指定する。メモとテキストのフィールドが空の項目は承認なしで返される。空でない項目がある場合は、仲介プロセスのウィンドウに内容が一覧で表示され、利用者が 1 回の承認でまとめて許可する。隠しフィールドの値は返されない。メモにはリカバリーコードなどの秘密値が書かれていることがあるため、対象は作業に必要な項目に絞ること。

```bash
node <Skill のディレクトリ>/scripts/bw-vault.mjs notes (--item <項目名> [--item <項目名>...] | --search <文字列> | --all) --reason <説明>
```

項目の名前、メモ、URI を変更する。パスワード、ユーザー名、TOTP、カスタムフィールドは変更できない。変更前と変更後の内容が仲介プロセスのウィンドウに表示され、利用者が承認した場合に限り保存される。承認を待つ間に別の場所で同じ項目が変更された場合は、保存されずにエラーとなる。

```bash
node <Skill のディレクトリ>/scripts/bw-vault.mjs edit --item <項目名> [--rename <新しい項目名>] [--notes <メモ> | --append-notes <追記する文>] [--uris <JSON>] --reason <説明>
```

- `--rename`: 新しい項目名は `{対象サービス}-{種別}-{ラベル}` の命名規則に従うこと（規則は `generate` の説明を参照のこと）。同名の項目がすでに存在する場合は拒否される
- `--notes`: メモ全体を置き換える。空文字列を指定するとメモを削除する。既存のメモを置き換える場合は、先に `notes` で内容を確認すること
- `--append-notes`: 既存のメモの末尾に、改行を挟んで追記する
- `--uris`: URI の一覧全体を置き換える。`[{"uri":"https://example.com","match":"host"}]` の形式の JSON 配列で指定し、`match` を省略すると `default` となる。既存の URI を残す場合は、`list --with uris` で取得した一覧に追加して指定すること

ログイン項目のパスワードの強度（0〜4）と、金庫内での使い回しの回数を取得する。応答にパスワードそのものは含まれない。`--check-exposed` を指定すると、既知の漏えいに該当するかも照合する。照合では、パスワードのハッシュの先頭 5 文字が Have I Been Pwned へ送信されるため、利用者が漏えいの照合を求めた場合に限って指定すること。

```bash
node <Skill のディレクトリ>/scripts/bw-vault.mjs report [--check-exposed]
```

`status` は、仲介プロセスの状態に加えて、Bitwarden CLI の接続先のサーバー URL、最終同期日時、ログイン中のアカウントを `bitwarden` に返す。仲介プロセスを起動していなくても実行できる。

```bash
node <Skill のディレクトリ>/scripts/bw-vault.mjs status
```

項目のパスワードを GitHub Actions の secret に登録する。

```bash
node <Skill のディレクトリ>/scripts/bw-vault.mjs send gh-secret --item <項目名> --repo <owner/name> --name <Secret 名> [--env <環境名>] --reason <説明>
```

ssh で接続したリモートホストで `sudo -S -v` を実行し、sudo の認証を更新する。sudo の認証が失効し、`sudo -n` が失敗した場合に用いる。対象ホストにおいて、sudo の認証キャッシュがセッション間で共有される設定（sudoers の `timestamp_type=global`）を前提とする。仲介プロセスが `PATH` から解決する ssh は起動元のシェルによって異なり、対象ホストへの認証に必要な鍵を使用できない場合がある。`--ssh` には、エージェント自身が対象ホストへ接続できた ssh の実行ファイルを、ドライブ文字から始まる Windows のパスで指定すること。パスは PowerShell の `(Get-Command ssh).Source` または `where.exe ssh` で確認できる。Git Bash の `command -v ssh` が返す `/usr/bin/ssh` の形式は受け付けられないため、`cygpath -w "$(command -v ssh)"` で変換する。`--host` には、`~/.ssh/config` の Host 名、ホスト名、`ユーザー名@ホスト名` のいずれかを指定する。

```bash
node <Skill のディレクトリ>/scripts/bw-vault.mjs send ssh-sudo --item <項目名> --host <ssh の接続先> --ssh <ssh.exe のパス> --reason <説明>
```

固定の送信先（`gh-secret`、`ssh-sudo`）では、利用者が「a」を入力して承認すると、仲介プロセスが終了するまで同じ項目と送信先の組み合わせが自動で承認される。

固定の送信先では対応できない場合に限り、任意のコマンドの標準入力へ秘密値を渡す。コマンドは `--` の後に引数の配列として指定し、シェルを介さずに起動される。利用者は毎回 `yes` の入力で承認する。秘密値を画面、ファイル、ネットワークへ出力するコマンドや、エージェントが後から参照できる場所へ書き込むコマンドを組み立てないこと。利用者が承認の画面でコマンド全体を確認できるよう、秘密値を受け取るコマンドは、その値を必要とする処理だけに絞って短く保つこと。準備や後処理は別のコマンドとして実行する。

```bash
node <Skill のディレクトリ>/scripts/bw-vault.mjs send command --item <項目名> --reason <説明> -- <コマンド> [引数...]
```

`send` の応答に含まれる `exitCode` は、受け渡し先のコマンドの終了コードである。コマンドの出力は仲介プロセスのウィンドウにのみ表示されるため、失敗した場合は利用者にウィンドウの表示内容の確認を依頼すること。

ランダムな値を生成し、新しいログイン項目のパスワードとして保存する。利用者が手動で入力する必要のない秘密値に限って用いる。項目名は `{対象サービス}-{種別}-{ラベル}` の形式とし、種別は `Token`、`Account`、`KeyPair` のいずれかとする。対象サービスには ASCII の英数字と `.` を、ラベルには ASCII の英数字と `.`、`_`、`-` を用いる。同名の項目がすでに存在する場合は拒否される。

```bash
node <Skill のディレクトリ>/scripts/bw-vault.mjs generate --name <項目名> [--folder <フォルダ名>] [--length <16〜128>] [--special] --reason <説明>
```

保存した値を利用する場合は、続けて `send` で受け渡す。保存後は、項目の用途と期限を利用者が台帳に記録できるよう、項目名を利用者に報告すること。

## 禁止事項

- `bw` コマンドを直接実行しないこと。`bw unlock`、`bw get`、`bw serve` を実行すると、秘密値やセッションキーがエージェントへ出力されるためである
- 状態ファイル（`~/.local/agent-source/state/bitwarden-vault/broker.json`）のトークンを用いて、付属スクリプトを介さずに仲介プロセスへ要求を送信しないこと
- `send` や `generate` が失敗した場合に、秘密値を発行するコマンドや受け渡し先のコマンドを、秘密値が画面に出力される形で単体実行しないこと

## エラーへの対応

| エラー出力 | 対応 |
| --- | --- |
| `The bitwarden-vault broker is not running` | `start` を実行して仲介プロセスを起動する |
| `the vault is not unlocked yet` | 利用者にウィンドウでのマスターパスワードの入力を依頼し、入力後に `status` で確認する。bitwarden-vault のウィンドウが開いていない場合は、PC の再起動などで残った状態ファイルである。利用者に状態ファイルの削除を依頼してから `start` を再実行する |
| `window closed before the vault was unlocked` | ウィンドウに表示された内容を利用者に確認し、原因を解消してから `start` を再実行する |
| `Lost the connection to the bitwarden-vault broker` | 利用者にウィンドウの表示内容の確認を依頼する。同じリクエストを繰り返す前に、前のリクエストが実行されたかを利用者に確認する |
| `No item is named` | `list` で項目名を確認する。項目名は完全一致で照合される |
| `items are named` | 同名の項目が複数存在する。利用者に Bitwarden での改名を依頼する |
| `has no password` | 項目にパスワードが設定されていない。利用者に対象項目を確認する |
| `does not follow the naming rule` | 命名規則に適合する項目名を利用者と決定する |
| `already exists` | 同名の項目が存在する。別の項目名を利用者と決定する |
| `was changed elsewhere` | `list` や `notes` で最新の内容を確認してから、`edit` を再実行する |
| `bw ... failed` | 仲介プロセスのウィンドウに表示された `bw` のエラーの確認を利用者に依頼する |
