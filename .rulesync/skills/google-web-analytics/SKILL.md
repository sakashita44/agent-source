---
name: google-web-analytics
description: >-
  Use when a task needs Google Analytics 4 or Google Search Console data, such
  as traffic reports, search queries and rankings, index status, or sitemaps
  of the user's web sites and blogs. Calls the official REST APIs with the
  user's Application Default Credentials through a bundled script that keeps
  the access token out of the conversation.
---

# Google Web Analytics

Google Analytics 4（以下、GA4）と Search Console の REST API を、ユーザーの Application Default Credentials（以下、ADC）で呼び出し、Web サイトの計測データと検索データを取得する。

## 前提

この Skill の実行には、Google Cloud CLI（`gcloud`）と、GA4 と Search Console の読み取りスコープを含めてユーザーが作成した ADC が必要である。

アクセストークンの取得または ADC のスコープの確認に失敗した場合は、[認証の準備](references/setup.md)の「診断」に従って原因を特定し、不足している手順をユーザーへ提示する。

## API の呼び出し

付属スクリプトに HTTP メソッドと URL を指定して実行する。リクエスト本文は、JSON 文字列を `--body` で渡すか、JSON ファイルのパスを `--body-file` で渡す。シェルの引用符の処理によって本文が崩れる場合は `--body-file` を用いる。

```bash
node <Skill のディレクトリ>/scripts/google-api.mjs GET https://analyticsadmin.googleapis.com/v1beta/accountSummaries
node <Skill のディレクトリ>/scripts/google-api.mjs POST https://analyticsdata.googleapis.com/v1beta/properties/<プロパティ ID>:runReport --body-file <本文のパス>
```

リクエストが成功した場合は、応答本文が標準出力へ出力される。HTTP エラーが発生した場合は、ステータスコードと応答本文が標準エラー出力へ出力され、終了コード 1 で終了する。スクリプトは、次のホストとパス以外への要求を拒否する。

| API | 呼び出せる URL |
| --- | --- |
| GA4 Data API | `https://analyticsdata.googleapis.com/` |
| GA4 Admin API | `https://analyticsadmin.googleapis.com/` |
| Search Console API（URL 検査） | `https://searchconsole.googleapis.com/` |
| Search Console API（検索パフォーマンス、サイト、サイトマップ） | `https://www.googleapis.com/webmasters/` |

エンドポイント、リクエストの形式、指定できる指標とディメンションは、次の公式リファレンスで確認してから要求を組み立てること。

- [Google Analytics Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/rest)
- [Google Analytics Admin API](https://developers.google.com/analytics/devguides/config/admin/v1/rest)
- [Search Console API](https://developers.google.com/webmaster-tools/v1/api_reference_index)

GA4 のプロパティ ID は Admin API の `accountSummaries` で、Search Console のサイト URL は `webmasters/v3/sites` で確認する。

## 認証情報の扱い

- アクセストークンを取得するコマンド（`gcloud auth application-default print-access-token` など）を直接実行しないこと。アクセストークンは付属スクリプトの内部でのみ処理される
- ADC ファイル（`application_default_credentials.json`）や OAuth クライアントの JSON ファイルの内容を読み取らないこと

## 書き込み操作

設定の変更、サイトマップの送信や削除などの書き込み操作は、この Skill では実行しないこと。書き込みが必要な場合は、対象の操作と手順を提示し、GA4 または Search Console の画面での実行をユーザーへ依頼する。
