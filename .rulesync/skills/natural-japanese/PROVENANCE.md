# 取得元

このSkillは第三者の実装をそのまま取り込んだものである。このリポジトリでは編集しない。更新は再取得で行う。

- 取得元: <https://github.com/coji/natural-japanese>
- ライセンス: MIT（`LICENSE`に全文を置く）
- 取得コミット: `9a78a42964096da509b8f3e011f0085a5f080151`
- 取得日: 2026-09-07

```bash
npx rulesync fetch coji/natural-japanese --ref <コミットSHA>
```

`LICENSE`は`fetch`の対象に含まれないため、同じコミットから個別に取得して置いている。再取得のときは`LICENSE`とこのファイルのコミットSHAも更新する。

## 実行に必要なもの

同梱のスクリプトはPythonで書かれており、`uv run`で実行する。`semantic.py`はtorchとsentence-transformersに依存し、初回に約1GBのモデルを取得する。この検出器はフル工程での任意実行であり、他の検査には要らない。

## 文体の正本

日本語の文体と表現の規則は`writing-principles`が正本である。このSkillの規則と食い違う場合は`writing-principles`に従う。このSkillは文章の自然さと読みやすさを担い、文書の構造と責務は`write-docs`が担う。
