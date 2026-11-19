# Skill の点検

`.rulesync/skills/` の自作の Skill と、`rulesync.jsonc` の `sources` で取得する外部リポジトリの Skill が、外部の Skill や配布先の現状に照らして古くなっていないかを点検し、更新案を提案して採用分を Issue として作成する手順を定める。

点検は定期実行せず、利用者が必要と判断したときに、Claude Code、Codex CLI、Antigravity（IDE・CLI）のいずれかのエージェントへ、この文書に沿った点検を依頼する。この文書の主な読者は点検を実行するエージェントであり、利用者は点検の依頼と提案の採否判断を担う。エージェントは点検の過程でリポジトリのファイルを変更せず、点検結果に基づく更新案をチャットで提案する。採用された提案は、エージェントが Issue として作成する。

## 判断の方針

利用者は Claude Code、Codex、Antigravity を併用する。ある配布先に同じ目的の Skill や組み込み機能があっても、他の配布先では利用できないため、それだけを理由に自作の Skill を削除しない。外部の Skill は、自作の Skill を見直す参考として比較する。

Skill ごとに、自作の Skill か外部リポジトリから取得する Skill かに応じて、次のいずれかの判断を提案する。

| 判断 | 対象 | 選ぶ条件 | 提案する変更 |
| --- | --- | --- | --- |
| 維持 | 自作 / 外部取得 | 外部の Skill と同等以上であり、前提も古くなっていない（外部取得は上流の変更取り込みも不要） | なし |
| 自作の Skill の更新 | 自作 | 外部の Skill に取り込む価値のある観点や手順がある、または本文の前提が古い | 自作の Skill へ観点や手順を取り込み、または前提を修正して、すべての配布先へ配布する |
| 外部の Skill への置き換え | 自作 | 外部の Skill が自作の Skill より優れており、特定の配布先に依存せず、ライセンスや利用規約上も `agent-source` で問題なく利用できる | 自作の Skill を削除し、外部の Skill を `rulesync.jsonc` の `sources` へ追加する |
| 外部の Skill の上流追従 | 外部取得 | 上流リポジトリに有益な更新がある | `npx rulesync install --update` で `rulesync.lock` を更新する |
| 外部の Skill の取得見直し | 外部取得 | 上流が廃止または陳腐化した、あるいはより適した外部の Skill や自作の Skill へ切り替えるべき理由がある | `rulesync.jsonc` の `sources` から外し、必要に応じて別の外部の Skill または自作の Skill へ切り替える |

配布先の組み込み機能と自作の Skill の description が類似している場合は、その配布先でどちらが起動するかが不安定になる。この場合は、「自作の Skill の更新」として description の見直しを提案する。

Skill 名は、Claude Code と Antigravity ではスラッシュコマンドの名前に、Codex では `$` に続けて呼び出す名前になる。自作の Skill が組み込みのコマンドや付属の Skill と同名の場合、配布先によって扱いが異なる。Claude Code では組み込みのコマンドや Skill が自作の Skill で置き換えられるため、組み込み機能を呼び出せなくなる。Codex と Antigravity では両方が候補に表示される。同名の場合は、配布先ごとの扱いを確認し、名前を変更するか維持するかを提案に含める。

## 点検の手順

開始条件: このリポジトリのルートを作業ディレクトリとし、`main` の最新状態を読み取れること（作業ブランチがチェックアウトされている場合や、`main` が最新でない場合は、開始前に利用者へ確認すること）。

制約と対象:

- 点検は読み取りのみで実行し、リポジトリのファイルを変更しないこと
- 点検の対象は `.rulesync/skills/` の自作の Skill と、`rulesync.jsonc` の `sources` で取得する外部リポジトリの Skill とする。利用者が Skill を指定した場合は、指定された Skill のみを対象とする
- 外部リポジトリの Skill が `.rulesync/skills/.curated/` に取得されていない場合は、`rulesync.jsonc` と上流リポジトリから確認し、ローカルに取得されていない旨を提案に含める

調査の委譲と補助手段:

- 手順 3、4、5 の Web 調査は、Skill ごとまたは参照先ごとに独立しているため、`.rulesync/skills/subagent/SKILL.md`（`subagent` Skill）に従って委譲する。委譲先には、実際に開いた URL と、そこから得た事実を報告させる。委譲先の実行環境には、このリポジトリから配布された Skill とサブエージェントも配置されている。委譲先がそれらを配布先の組み込み機能と取り違えないよう、`.rulesync/skills/` の自作の Skill 名と `.rulesync/subagents/` の自作のサブエージェント名を依頼に含めて区別させる。結論の根拠となる URL は、提案前に委譲元が開いて確認する
- Claude Code で点検する場合、利用者は手順 2 と 3 の補助として `/doctor prompt-audit` を実行し、その結果をエージェントへ渡してもよい。このコマンドは指示ファイルや Skill について、現行のモデルに合わない書き方やファイル内外の食い違いを報告する。出力される対象パスは `~/.claude/` 配下の生成されたファイルを指すため、採用された修正案を後続作業で適用する際は、`.rulesync/` 配下の生成元へ反映する

手順:

1. 対象の把握: `.rulesync/skills/` の各 Skill の `SKILL.md` と参照ファイル（必要に応じて付属スクリプトやデータファイルも含む）を読み、役割、起動条件（description）、および本文が前提とする要素（ツール、コマンド、バージョン、外部の仕様）を書き出す
2. 内部の重複、参照切れ、配置差分の確認:
   - 自作の Skill 同士を比較し、役割や description が重複していないかを確認する
   - 本文が参照する Skill 名、ファイル、節がリポジトリ内に存在するかを確認する
   - 手動起動に限定する Skill（frontmatter に `disable-model-invocation: true` や `allow_implicit_invocation: false` が指定されているもの、または [Skill の一覧](skills.md)で起動が `手動` となっているもの）について、description にも自動起動を抑止する旨が記載されているかを確認する（Antigravity では frontmatter で自動起動を抑止できないため、description の記述で抑止する必要がある）
   - [Skill の一覧](skills.md)の用途と起動方法が、各 Skill の実態と食い違っていないかを確認する
   - ホームディレクトリに配置済みの Skill が `.rulesync/skills/` の内容と異なる場合（Skill 名の過不足や内容の不一致）は、その Skill 名を提案に含める。確認先パスは[保守手順の「生成元から外した生成物の削除」](maintenance.md#生成元から外した生成物の削除)の表を参照のこと
3. 古い前提の確認: 手順 1 で書き出した前提を、配布先と関連ツールの公式文書、変更履歴、リポジトリと照合する。CLI のコマンドとオプションは、公式文書の更新が CLI に追いついていない場合があるため、まずローカルに導入された CLI の `--help` で確認する
4. 外部との重複の確認: [点検時の参照先](#点検時の参照先)の各場所で、同名または同じ目的の Skill と組み込み機能を探す。Claude Code、Codex、Antigravity のいずれかに偏らず、3 つの配布先をそれぞれ確認する。見つかった Skill や組み込み機能について、観点、手順、検証方法を自作の Skill と比較する
5. 外部リポジトリから取得した Skill の上流確認: `rulesync.lock` の `resolvedRef` と、`rulesync.jsonc` の `sources` が指す上流リポジトリの最新コミットを比較する。差分がある場合は上流の変更内容を確認する。`rulesync.lock` が書き換えられるため、点検では `npx rulesync install --update` を実行しないこと
6. 参照先の見直し: 手順 4 で、[点検時の参照先](#点検時の参照先)に記載された場所が閉鎖または移転していた場合や、記載のない公式リポジトリや主要な Skill 集を見つけた場合は、この文書の更新を提案に含める
7. 提案と採用分の Issue 作成: [提案と採用後の対応](#提案と採用後の対応)に従ってチャットで提案し、利用者が採用した提案を Issue として作成する

例外時の対応: ネットワーク障害、URL の取得不可、ローカル CLI の未導入、またはサブエージェントの失敗により照合できない項目が生じた場合は、推測で判断せず、確認できなかった対象と理由を未確認事項として提案に明記すること。

完了条件: 対象のすべての Skill について判断（「維持」以外は根拠と出典を含む）がチャットで提案され、利用者が採用した提案が Issue として作成されていること。

## 点検時の参照先

次の参照先は 2026-10-08 に存在と内容を確認した。記載された場所自体も移転や閉鎖によって古くなるため、[点検の手順](#点検の手順)の手順 6 で見直す。

### 配布先の公式情報

配布先の組み込み機能は、組み込みのコマンド、Skill、ワークフローの一覧と、ローカルに導入された配布先に付属する Skill で確認する。Skill の仕様は、同名の扱いや frontmatter の対応範囲を照合するために参照する。

| 配布先 | 組み込み機能の一覧 | 付属する Skill | Skill の仕様 | 変更履歴 |
| --- | --- | --- | --- | --- |
| Claude Code | [Claude Code Commands](https://code.claude.com/docs/en/commands)（組み込みのコマンド、Skill、ワークフロー） | ローカル配置なし（組み込み機能の一覧で確認） | [Claude Code Skills](https://code.claude.com/docs/en/skills) | [Claude Code Changelog](https://code.claude.com/docs/en/changelog) |
| Codex | [Codex Developer commands](https://learn.chatgpt.com/docs/developer-commands)（CLI のオプションとスラッシュコマンド） | `~/.codex/skills/.system/` | [Codex Build skills](https://learn.chatgpt.com/docs/build-skills) | [Codex Changelog](https://learn.chatgpt.com/docs/changelog) |
| Antigravity | [Antigravity Slash commands](https://antigravity.google/docs/slash-commands/)（IDE と `agy`（Antigravity CLI）のスラッシュコマンド） | `~/.gemini/antigravity-cli/builtin/skills/` | [Antigravity Agent skills](https://antigravity.google/docs/skills) | [Antigravity Changelog](https://antigravity.google/docs/changelog) |

### ベンダー公式の Skill 集とマーケットプレイス

| ベンダー | 公式の Skill 集 | マーケットプレイス |
| --- | --- | --- |
| Anthropic | [anthropics/skills](https://github.com/anthropics/skills) | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)。仕組みは [Anthropic's marketplaces](https://code.claude.com/docs/en/plugins/anthropic-marketplaces) を参照のこと |
| OpenAI | [openai/plugins](https://github.com/openai/plugins)。各プラグインの `skills/` に Skill が格納されている（非推奨の `openai/skills` は参照しないこと） | `openai/plugins` が兼ねる。仕組みは [OpenAI Plugins](https://learn.chatgpt.com/docs/plugins) を参照のこと |
| Google | [google/skills](https://github.com/google/skills)。Google のプロダクト向けの Skill が中心であり、Antigravity 専用の Skill 集はない | [Antigravity Marketplace](https://antigravity.google/docs/marketplace/) |

### 配布先横断の Skill 集

- [skills.sh](https://skills.sh): 配布先を横断する Skill のディレクトリ。インストール数の順位と、ベンダー公式の Skill 集の一覧（[skills.sh/official](https://skills.sh/official)）を確認できる
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills): 分野ごとに分類された Skill の一覧
- [trailofbits/skills](https://github.com/trailofbits/skills)、[trailofbits/skills-curated](https://github.com/trailofbits/skills-curated): レビュー、検証、計画、文章の推敲などの Skill 集
- [github/awesome-copilot](https://github.com/github/awesome-copilot): コミット、コードベースの把握などの Skill 集
- [mattpocock/skills](https://github.com/mattpocock/skills): 要件を具体化するインタビュー（`grilling`）などの Skill 集

### Skill 形式の仕様

- [Agent Skills](https://agentskills.io): `SKILL.md` 形式の仕様と、対応するクライアントの一覧。Skill の形式に関わる前提の照合に用いる

## 提案と採用後の対応

提案では、点検した Skill ごとに次の項目をチャットで示す。判断が「維持」であり、特記すべき根拠がない Skill は、一覧にまとめて示してよい。

- 判断: [判断の方針](#判断の方針)に定めた区分のいずれか
- 根拠: 比較した外部の Skill や照合した前提と、判断に至った理由
- 出典: 根拠とした URL、またはリポジトリ内のファイルと節
- 提案する変更: 「維持」以外の判断を選んだ場合に、変更する内容の要点

利用者が採用する提案を選んだ後、エージェントが提案ごとに、または関連するものをまとめて Issue を作成する。作成する Issue の本文には、判断に必要な根拠と出典を含める。以降の修正は通常の作業として実施する。
