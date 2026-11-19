# 保守手順

定常的な配布適用（[README.md の「配布の適用」](../README.md#配布の適用)）とは別に、必要に応じて実施する保守作業の手順を定める。配布する Skill が外部の Skill や配布先の現状に照らして古くなっていないかの点検は、[Skill の点検](skill-audit.md)を参照のこと。

## 外部リポジトリの Skill の更新

`rulesync.jsonc` の `sources` に定義した外部リポジトリの Skill を、上流の最新コミットへ追従させる。

開始条件: リポジトリルートを作業ディレクトリとし、作業ツリーに未コミットの変更がないこと。

1. 上流から最新の Skill を取得し、`rulesync.lock` を更新する

   ```powershell
   npx rulesync install --update
   ```

2. `git diff rulesync.lock` の出力と、`.rulesync/skills/.curated/` の変更内容を確認する
3. [README.md の「適用手順」](../README.md#適用手順)に従って dry-run を実行し、配布差分に意図しない変更がないことを確認する
4. 問題がなければ、更新された `rulesync.lock` のみをコミットし、利用中のホームディレクトリへ反映する場合は `./scripts/apply.ps1` を実行する

完了条件: `rulesync.lock` の更新がコミットされていること（`.rulesync/skills/.curated/` 本体は Git の管理対象外のためコミットされない）。

回復: 更新を見送る場合は、`rulesync.lock` を元に戻したうえで `npx rulesync install --frozen` を実行する。これにより、`.rulesync/skills/.curated/` が更新前の状態へ復元される。

## Rulesync の更新

Rulesync のバージョンは `package.json` で固定し、`package-lock.json` とあわせて Git で管理する。バージョンによって配布先の設定ファイルの生成結果が変わるため、最新バージョンへは自動追従しない。定期的な更新確認も実施せず、次のいずれかに該当した場合に更新を検討する。

- 配布先の設定仕様が変わり、生成結果が仕様と合わなくなった
- 必要な機能や不具合の修正が Rulesync に追加された
- Rulesync 自体にセキュリティ上の問題が見つかった
- 利用中の Node.js との互換性に問題が生じた

npm の非推奨警告（deprecated warning）など、Rulesync の間接的な依存パッケージに起因する警告は、導入の失敗やセキュリティ勧告を伴わない限り更新の理由としない。メジャーバージョンが短い間隔で上がるため、patch、minor、major の区別ではなく、生成差分で更新の可否を判断する。

開始条件: リポジトリルートを作業ディレクトリとし、作業ツリーに未コミットの変更がないこと。

1. 固定中のバージョンから更新先のバージョンまでのリリースノートを読み、`rulesync.jsonc` の生成対象とスクリプトが用いるコマンドに関わる破壊的変更を確認する
2. 更新前に `./scripts/verify.ps1` を実行し、生成された `tmp/home` を `tmp/home-before`（またはリポジトリ外の一時ディレクトリ）へ退避する。Git の追跡対象となる場所へ退避しないこと
3. 更新先のバージョンを固定して導入する

   ```powershell
   npm install -E -D rulesync@<更新先のバージョン>
   ```

4. `./scripts/verify.ps1` を実行し、新しく生成された `tmp/home` を手順 2 で退避した生成結果と比較する。差分がリリースノートで説明できる変更に限られることを確認する
5. [README.md の「適用手順」](../README.md#適用手順)に従って `./scripts/apply.ps1 -DryRun` を実行し、利用中のホームディレクトリで書き込み対象となるファイルを確認する
6. 説明できない差分がある場合は、`.rulesync/` を調整して手順 4・5 を再実行するか、更新を見送る。問題がなければ、更新した `package.json`、`package-lock.json`（および調整した `.rulesync/`）をコミットし、手順 2 で退避したディレクトリを削除する

完了条件: 更新後に実行した `verify.ps1` と `apply.ps1 -DryRun` が成功し、更新したファイルがコミットされ、退避したディレクトリが削除されていること。

回復: 更新を見送る場合は、`package.json` と `package-lock.json` を更新前の状態へ戻し、`npm ci` を実行する。`node_modules/` が復元された後、退避したディレクトリを削除する。

## 生成元から外した生成物の削除

旧名の生成物の削除には、Rulesync の `generate --delete` を用いないこと。生成先には Rulesync 以外のツールや利用者もファイルを配置しており、`--delete` を指定するとそれらも削除される。

Rulesync と `scripts/apply.ps1` は生成元から削除されたファイルを生成先から自動で削除しないため、生成元の Skill、サブエージェント定義、hook スクリプトを削除または改名すると、旧名の生成物が生成先に残り、各エージェントが読み込み続ける。

| 生成先 | 種別 | Rulesync 以外が配置するディレクトリ・ファイル |
| --- | --- | --- |
| `~/.claude/skills/` | Skill | `synced/`（Claude Code が claude.ai から同期した Skill）、`.trash/`（同期を停止した Skill の退避先） |
| `~/.agents/skills/` | Skill | Codex 以外のツールが配置した Skill（Agent Skills の共通配置場所） |
| `~/.gemini/config/skills/` | Skill | Antigravity の `/learn` が作成した Skill |
| `~/.gemini/antigravity-cli/skills/` | Skill | なし |
| `~/.claude/scheduled-tasks/` | 定期タスク（`--delete` による誤削除の対象） | Claude デスクトップアプリの定期タスク（Rulesync の `--delete` が Skill の配置場所とみなして削除対象とする） |
| `~/.claude/agents/`、`~/.codex/agents/`、`~/.gemini/config/agents/` | サブエージェント定義 | 利用者が配置したサブエージェント定義 |
| `~/.local/agent-source/hooks/` | hook スクリプト | なし |

### 削除または改名したとき

生成元の Skill、サブエージェント定義、hook スクリプトを削除または改名した直後は、次の手順で旧名の生成物を削除する。

注意: 手順 2 の削除操作は回復不能であるため、削除対象のパスと旧名を事前に確認すること。

1. 通常の PowerShell から `./scripts/apply.ps1` を実行する。これにより、最新の生成元が適用される
2. 削除または改名した対象の種別に応じて、旧名の生成物を手作業で削除する
   - Skill: [生成元から外した生成物の削除](#生成元から外した生成物の削除)の表にある Skill の生成先 4 箇所から、旧名のディレクトリを削除する
   - サブエージェント定義: `~/.claude/agents/<旧名>.md`、`~/.codex/agents/<旧名>.toml`、`~/.gemini/config/agents/<旧名>.md` を削除する
   - hook スクリプト: `~/.local/agent-source/hooks/` から旧名のファイルを削除する

完了条件: 該当する生成先に旧名のディレクトリまたはファイルが存在しないこと。

### 棚卸し

削除漏れに気づいたときは、生成先を生成元と照合し、残った不要な生成物を手作業で削除する。

注意:
- 手順 2 の `rulesync` コマンドには必ず `--dry-run` を指定すること。`--dry-run` を指定せずに `--delete` を実行すると、Rulesync 以外が配置したファイルも削除される
- 手順 5 の削除操作は回復不能であるため、削除前に履歴とファイル内容を必ず確認すること

1. 生成元（`.rulesync/skills/`、`.rulesync/skills/.curated/`、`.rulesync/subagents/`、`hooks/`）にある Skill、サブエージェント定義、hook スクリプトの名前を一覧にする
2. 生成先にある名前のうち、生成元にないものを抽出する
   - Skill とサブエージェント定義: `npx rulesync generate --global --delete --dry-run` の出力にある `Would delete` の行を一覧として利用できる。このコマンドは生成先を変更しないが、Rulesync 以外が配置したファイルも列挙する
   - hook スクリプト: `~/.local/agent-source/hooks/` のファイル一覧を `hooks/*.mjs` と直接照合する（`rulesync` の出力には含まれない）
3. 抽出した名前から、[生成元から外した生成物の削除](#生成元から外した生成物の削除)の表にある Rulesync 以外が配置するディレクトリ・ファイル（`~/.claude/scheduled-tasks/` を含む）と、`.` で始まる管理用のディレクトリおよびファイル（`.system`、`.trash` など）を除外する
4. 残った名前が過去に生成元にあったかを履歴で確認する
   - 自作の Skill、サブエージェント定義、hook スクリプト: `git log --oneline -- .rulesync/skills/<名前> .rulesync/subagents/<名前>.md hooks/<ファイル名>` で履歴を確認する
   - 外部リポジトリの Skill: `git log -p -- rulesync.jsonc` で `sources` の履歴を確認する
5. 過去に生成元にあった名前の生成物を削除する。生成元の履歴にない名前のディレクトリやファイルは、利用者または他のツールが配置したものであるため、内容を確認したうえで残すか削除するかを判断する

完了条件: 過去に生成元にあった不要な生成物がすべて削除されていること。
