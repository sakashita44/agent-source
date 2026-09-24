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
