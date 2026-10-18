---
root: true
targets:
  - codexcli
---
## Windows の Codex の sandbox で mise を経由するコマンド

Windows の Codex で mise の shim（`uv`、`node`、`npm`、`npx` など）を経由するコマンドを実行する場合は、sandbox 内で試さずに、最初から sandbox の外での実行を要求する。Codex デスクトップアプリの sandbox では mise が設定ファイルを無視するため、shim が版を解決できずに失敗する。
