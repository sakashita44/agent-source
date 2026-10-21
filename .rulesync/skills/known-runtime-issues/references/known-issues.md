# 既知の事例

## Windows の Codex サンドボックスで Python が作成したディレクトリへ書き込めない

一致条件:

- Windows 上の Codex のサンドボックス内で実行している。elevated のサンドボックスでは発生しないため、elevated と確認できる場合は一致しない
- Python 3.12.4 以降で実行している。uv が用意する Python も含む
- mode `0o700` で作成したディレクトリへの読み書きで `PermissionError`（`WinError 5`）が発生する。`tempfile.mkdtemp()`、`tempfile.TemporaryDirectory()`、`os.mkdir(path, 0o700)`、pytest の `tmp_path` は、この mode でディレクトリを作成する
- 失敗したコマンド自身がそのディレクトリを作成している

対応:

- 失敗したコマンドだけを、呼び出し元の権限昇格の手順で承認を得てサンドボックスの外で再実行する
- サンドボックスの外で実行する手段がない非対話の実行では、この事例に一致したことを報告して停止する

出典:

- [CPython gh-118486: Windows で mkdir の mode 0o700 が ACL を設定する変更](https://github.com/python/cpython/issues/118486)
- [CPython gh-134587: AppContainer で mkdtemp のディレクトリに書き込めない報告](https://github.com/python/cpython/issues/134587)
- [openai/codex #19791: Codex の Windows サンドボックスで 0o700 の一時ディレクトリにアクセスできない報告](https://github.com/openai/codex/issues/19791)

## Windows の Codex サンドボックスで mise の shim が版を解決できない

一致条件:

- Windows 上の Codex のサンドボックス内で実行している
- mise の shim（`uv`、`node`、`npm`、`npx` など）が `mise ERROR No version is set for shim: <ツール>` で終了する。グローバル設定やプロジェクトの `mise.toml` に版を宣言していても発生する

対応:

- 失敗したコマンドだけを、呼び出し元の権限昇格の手順で承認を得てサンドボックスの外で再実行する
- サンドボックスの外で実行する手段がない非対話の実行では、この事例に一致したことを報告して停止する

出典:

- [openai/codex #52593: Windows のサンドボックス内でネイティブの realpath が EPERM を返す報告](https://github.com/openai/codex/issues/52593)
- [openai/codex #45871: Windows の AppContainer でパスの正規化に必要なアクセスが拒否される報告](https://github.com/openai/codex/issues/45871)
- [mise `is_persisted_ignored`: パスの正規化に失敗した設定ファイルを無視する処理](https://github.com/jdx/mise/blob/v2026.9.12/src/config/config_file/mod.rs#L796-L816)

## Windows の Codex サンドボックスで Microsoft Store 版の PowerShell を起動できない

一致条件:

- Windows 上の Codex のサンドボックス内で実行している
- コマンドが実行される前に `CreateProcessAsUserW failed: 5` で失敗する
- エラーに示される起動対象の `pwsh.exe` が、`%LOCALAPPDATA%\Microsoft\WindowsApps\` 配下の実行エイリアス、または `C:\Program Files\WindowsApps\Microsoft.PowerShell_` で始まるディレクトリ配下にある

対応:

- 同じ PowerShell で再試行しないこと
- cmd.exe、Microsoft Store 版以外の PowerShell、エージェントが提供するほかの実行手段など、サンドボックス内で起動できる経路を選んで同じ処理を実行する
- サンドボックス内で起動できる経路では実行できない処理であれば、この事例に一致したことを報告して停止する

出典:

- [openai/codex #10090: Microsoft Store 版の PowerShell をサンドボックスが起動できない報告](https://github.com/openai/codex/issues/10090)
- [openai/codex #18937: Codex が PATH から PowerShell の実行エイリアスを選ぶ報告](https://github.com/openai/codex/issues/18937)
