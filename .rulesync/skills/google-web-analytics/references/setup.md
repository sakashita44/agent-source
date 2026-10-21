# 認証の準備

`google-web-analytics` が用いる ADC を用意する手順と、アクセストークンを取得できない場合の診断手順を定める。

ADC の作成にはブラウザでの同意が必要であり、OAuth クライアントの作成は Google Cloud コンソールでのみ実行できる。エージェントはこれらの操作をユーザーへ依頼し、手順の提示と、`gcloud` で完結する手順の実行を担う。`gcloud` で完結する手順であっても、Google Cloud プロジェクトの作成や API の有効化など外部の状態を変更する操作は、実行前にユーザーの承認を得ること。

## Google アカウントごとに一度行う準備

GA4 と Search Console のスコープは Google Cloud 外の API に属するため、`gcloud` に組み込まれた OAuth クライアントでは ADC を作成できない。ユーザー自身の OAuth クライアントを作成し、その JSON ファイルを ADC の作成に用いる。API は、OAuth クライアントを作成するプロジェクトで有効化する。

1. Google Cloud プロジェクトを用意する。既存のプロジェクトを用いてもよい

   ```bash
   gcloud projects create <プロジェクト ID>
   ```

2. プロジェクトで GA4 と Search Console の API を有効化する

   ```bash
   gcloud services enable analyticsdata.googleapis.com analyticsadmin.googleapis.com searchconsole.googleapis.com --project <プロジェクト ID>
   ```

3. ユーザーが Google Cloud コンソールの Google Auth Platform で OAuth 同意画面を構成する。対象のユーザーには External を選択し、Audience のページで `Publish app` を押して公開ステータスを `In production` に設定する。公開ステータスが `Testing` の状態では、同意から 7 日で ADC のリフレッシュトークンが失効する。確認を受けていないアプリでは同意時に警告画面が表示されるが、ユーザー自身の利用には影響しない
4. ユーザーが Google Auth Platform の Clients のページで `CREATE CLIENT` を押し、種類に Desktop app を指定して OAuth クライアントを作成し、JSON ファイルをダウンロードする。この JSON ファイルはリポジトリへ配置しないこと

## 端末ごとに行う準備

ユーザーが OAuth クライアントの JSON ファイルを端末へ配置し、次のコマンドを実行する。コマンドの実行によってブラウザが開かれたら、GA4 と Search Console にアクセスできる Google アカウントで同意する。

```bash
gcloud auth application-default login --client-id-file=<OAuth クライアントの JSON ファイルのパス> --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/webmasters.readonly
```

このコマンドを実行すると、該当端末の既存の ADC が上書きされる。既存の ADC を別のスコープで利用している場合は、そのスコープも `--scopes` に含めること。

作成後、次の各要求が成功することを確認する。

```bash
node <Skill のディレクトリ>/scripts/google-api.mjs GET https://analyticsadmin.googleapis.com/v1beta/accountSummaries
node <Skill のディレクトリ>/scripts/google-api.mjs GET https://www.googleapis.com/webmasters/v3/sites
```

## 診断

スクリプトのエラー出力から、次の順に原因を特定する。

| エラー出力 | 原因 | 対応 |
| --- | --- | --- |
| `gcloud` を起動できない（`ENOENT`） | Google Cloud CLI が導入されていない、または PATH から解決できない | Google Cloud CLI の導入をユーザーへ依頼する |
| `Failed to get an access token` と、ADC が見つからない旨の `gcloud` のメッセージ | 端末で ADC が作成されていない | 「端末ごとに行う準備」の実施をユーザーへ依頼する |
| `Failed to get an access token` と、`invalid_grant` などの再認証を求めるメッセージ | リフレッシュトークンが失効または取り消されている | OAuth 同意画面の公開ステータスが `In production` であることを確認した上で、「端末ごとに行う準備」のコマンドの再実行をユーザーへ依頼する |
| HTTP 403 と `ACCESS_TOKEN_SCOPE_INSUFFICIENT` | ADC に必要なスコープが含まれていない | 「端末ごとに行う準備」のコマンドの再実行をユーザーへ依頼する |
| HTTP 403 と `SERVICE_DISABLED` | OAuth クライアントを所有するプロジェクトで API が有効化されていない | ユーザーの承認を得て、「Google アカウントごとに一度行う準備」の手順 2 を実行する |
| HTTP 403 と、ほかの行に該当しない `PERMISSION_DENIED` | 同意したアカウントに、対象の GA4 プロパティまたは Search Console のサイトの権限がない | 対象とアカウントの組み合わせをユーザーへ確認する |
