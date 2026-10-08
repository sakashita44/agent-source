# Skill の点検

`.rulesync/skills/` の Skill と、`rulesync.jsonc` の `sources` で取り込む Skill が、外部の Skill や配布先の現状に照らして古くなっていないかを点検し、更新を提案する手順を定める。点検は定期実行せず、利用者が必要と判断したときに、Claude Code、Codex CLI、agy のいずれかのエージェントへ、この文書に沿った点検を依頼する。エージェントは点検の結果をチャットで提案し、点検の過程で Skill を変更しない。

## 判断の方針

利用者は Claude Code、Codex CLI、Antigravity を併用する。ある配布先に同じ目的の Skill や組み込み機能があっても、他の配布先では利用できないため、自作の Skill を削除する理由にはしない。外部の Skill は、自作の Skill を更新する契機として比較する。

Skill ごとに次のいずれかの判断を提案する。

| 判断 | 選ぶ条件 | 提案する変更 |
| --- | --- | --- |
| 維持 | 自作の Skill が外部の Skill と同等以上であり、前提も古くなっていない | なし |
| 自作の Skill の更新 | 外部の Skill に取り込む価値のある観点や手順がある、または本文の前提が古い | 取り込む観点や修正する前提を自作の Skill へ反映し、すべての配布先へ配布する |
| 外部の Skill への置き換え | 外部の Skill が自作の Skill より優れており、特定の配布先に依存せず、ライセンス上も再配布できる | 自作の Skill を削除し、外部の Skill を `rulesync.jsonc` の `sources` へ追加する |

配布先の組み込み機能と自作の Skill の description が類似している場合は、その配布先においてどちらが起動するかが不安定になる。この場合は、自作の Skill の更新として description の見直しを提案する。

Skill 名は、Claude Code と Antigravity ではスラッシュコマンドの名前に、Codex では `$` に続けて呼び出す名前になる。自作の Skill が組み込みのコマンドや付属の Skill と同名の場合、配布先によって扱いが異なる。Claude Code では自作の Skill が組み込み側を置き換えるため、組み込み側を呼び出せなくなる。Codex と Antigravity では両方が候補に表示される。同名の場合は、配布先ごとの扱いを確かめ、名前を変えるか維持するかを提案に含める。

## 点検の手順

開始条件: このリポジトリのルートを作業ディレクトリとし、`main` の最新状態を読み取れること。点検は読み取りのみで行い、ファイルを変更しない。点検の対象は `.rulesync/` の内容とする。配置済みのホームディレクトリの Skill が `.rulesync/` と異なる場合は、その Skill 名を提案に含める。

1. 対象の把握: `.rulesync/skills/` の各 Skill の `SKILL.md` と参照ファイルを読み、役割、起動条件（description）、本文が前提とするツール、コマンド、版、外部の仕様を書き出す。利用者が対象の Skill を指定した場合は、指定された Skill のみを対象とする。
2. 内部の重複と参照切れの確認: 自作の Skill 同士で役割や description が重複していないかを比較する。本文が参照する Skill 名、ファイル、節がリポジトリ内に存在するかを確認する。明示的な起動に限定する Skill は、description にもその旨が書かれているかを確かめる。Antigravity の Skill は frontmatter で自動起動を止められないため、description の記述だけが自動起動を抑える。[Skill の一覧](skills.md)の用途と起動のしかたが、各 Skill と食い違っていないかも確認する。
3. 古い前提の確認: 手順 1 で書き出した前提を、配布先と関連ツールの公式文書、変更履歴、リポジトリと照合する。CLI のコマンドとオプションは、まずローカルにインストールされた CLI の `--help` で確認する。公式文書の更新が CLI に追いついていない場合がある。
4. 外部との重複の確認: [外部の Skill を探す場所](#外部の-skill-を探す場所)の各場所で、同名または同じ目的の Skill と組み込み機能を探す。Claude Code、Codex、Antigravity のいずれかに偏らず、3 つの配布先をそれぞれ確認する。見つかったものは、観点、手順、検証方法を自作の Skill と比較する。
5. 取り込んだ Skill の上流の確認: `rulesync.lock` の `resolvedRef` と、`rulesync.jsonc` の `sources` が指す上流リポジトリの最新のコミットを比較する。差分がある場合は上流の変更内容を確認する。`npx rulesync install --update` は `rulesync.lock` を書き換えるため、点検では実行しない。
6. 探す場所の見直し: 手順 4 で、[外部の Skill を探す場所](#外部の-skill-を探す場所)に記載された場所が閉鎖または移転していた場合や、記載のない有力な場所を見つけた場合は、この文書の更新を提案に含める。
7. 提案: [提案の形式](#提案の形式)に従ってチャットで提案する。

手順 3、4、5 の Web 調査は、Skill ごとまたは場所ごとに独立しているため、`subagent` に従って委譲する。委譲先には、実際に開いた URL と、そこから得た事実を報告させる。委譲先の実行環境には、このリポジトリが配布した Skill とサブエージェントも置かれている。委譲先がそれらを配布先の組み込み機能と取り違えないよう、自作の Skill とサブエージェントの名前を依頼に含め、区別して報告させる。結論の根拠となる URL は、提案前に委譲元が開いて確認する。

Claude Code で点検する場合は、手順 2 と 3 の補助として `/doctor prompt-audit` を併用してよい。このコマンドは、指示ファイルや Skill について、現行のモデルに合わない書き方やファイル内外の食い違いを報告する。報告と修正案は `~/.claude/` 配下の生成されたファイルを指すため、採用する修正は `.rulesync/` の生成元へ反映する。

完了条件: 対象のすべての Skill について判断と根拠が提案され、利用者が採用する提案を選んでいること。

## 外部の Skill を探す場所

次の場所は 2026-10-08 に存在と内容を確認した。記載された場所自体も移転や閉鎖によって古くなるため、[点検の手順](#点検の手順)の手順 6 で見直す。

配布先の組み込み機能は、組み込みのコマンド、Skill、ワークフローの一覧と、ローカルにインストールされた配布先に付属する Skill で確認する。Skill の仕様は、同名の扱いや frontmatter の対応範囲を照合するために参照する。

| 配布先 | 組み込み機能の一覧 | 付属する Skill | Skill の仕様 | 変更履歴 |
| --- | --- | --- | --- | --- |
| Claude Code | [Commands](https://code.claude.com/docs/en/commands)（組み込みのコマンド、Skill、ワークフロー） | 一覧のみ | [Skills](https://code.claude.com/docs/en/skills) | [Changelog](https://code.claude.com/docs/en/changelog) |
| Codex | [Developer commands](https://learn.chatgpt.com/docs/developer-commands)（CLI のオプションとスラッシュコマンド） | `~/.codex/skills/.system/` | [Build skills](https://learn.chatgpt.com/docs/build-skills) | [Changelog](https://learn.chatgpt.com/docs/changelog) |
| Antigravity | [Slash commands](https://antigravity.google/docs/slash-commands/)（IDE と agy のスラッシュコマンド） | `~/.gemini/antigravity-cli/builtin/skills/` | [Agent skills](https://antigravity.google/docs/skills) | [Changelog](https://antigravity.google/docs/changelog) |

公式の Skill とマーケットプレイスは、ベンダーごとに次の場所で探す。

| ベンダー | 公式の Skill 集 | マーケットプレイス |
| --- | --- | --- |
| Anthropic | [anthropics/skills](https://github.com/anthropics/skills) | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)。仕組みは [Anthropic's marketplaces](https://code.claude.com/docs/en/plugins/anthropic-marketplaces) を参照のこと |
| OpenAI | [openai/plugins](https://github.com/openai/plugins)。各プラグインの `skills/` に Skill が格納されている。`openai/skills` は非推奨となり、こちらへ移行した | `openai/plugins` が兼ねる。仕組みは [Plugins](https://learn.chatgpt.com/docs/plugins) を参照のこと |
| Google | [google/skills](https://github.com/google/skills)。Google のプロダクト向けの Skill が中心であり、Antigravity 専用の Skill 集はない | [Antigravity Marketplace](https://antigravity.google/docs/marketplace/) |

配布先をまたいで広く使われている Skill は、次の場所で探す。

- [skills.sh](https://skills.sh): 配布先を横断する Skill のディレクトリ。インストール数の順位と、ベンダーの公式 Skill 集の一覧（[skills.sh/official](https://skills.sh/official)）を確認できる
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills): 分野別に分類された Skill の一覧
- [trailofbits/skills](https://github.com/trailofbits/skills)、[trailofbits/skills-curated](https://github.com/trailofbits/skills-curated): レビュー、検証、計画、文章の推敲などの Skill 集
- [github/awesome-copilot](https://github.com/github/awesome-copilot): コミット、コードベースの把握などの Skill 集
- [mattpocock/skills](https://github.com/mattpocock/skills): 要件を詰めるインタビュー（`grill-me` が参考にした `grilling`）などの Skill 集
- [Agent Skills](https://agentskills.io): `SKILL.md` 形式の仕様と、対応するクライアントの一覧。Skill の形式に関わる前提の照合に使う

## 提案の形式

提案は、点検した Skill ごとに次の項目をチャットで示す。判断が維持であり、根拠を示す必要のない Skill は、一覧にまとめて示してよい。

- 判断: [判断の方針](#判断の方針)に定めた 3 つのいずれか
- 根拠: 比較した外部の Skill や照合した前提と、判断に至った理由
- 出典: 根拠とした URL、またはリポジトリ内のファイルと節
- 提案する変更: 自作の Skill の更新、または外部の Skill への置き換えを行う場合に、変更する内容の要点

利用者が採用した提案については、提案ごと、または関連する提案をまとめて Issue を作成し、通常の作業として対応する。Issue の本文には、判断に必要な根拠と出典を含める。
