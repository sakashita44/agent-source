---
name: implement
description: >-
  Use when starting implementation work whose direction is already decided.
  Keeps comments out of the implementation itself and runs the comment pass
  afterwards.
---
# Implement

実装を進めるときの入口とする。この Skill 自身は固有の規則を規定しない。

作業の分解と委譲は `subagent`、設計と品質の判断は `engineering-principles`、テストの設計と検証の選択は `verification-principles` を参照のこと。

この Skill では実装中にコメントを書かず、実装が完了した時点で `add-comment` を起動する。`add-comment` は執筆を別のエージェントへ委譲するため、実装者が自らコメントを書く事態を防げる。

実装しながら書くコメントは、書いた本人には自明でない箇所が見えにくく、実装の言い換えになりやすい。そのため、コメントを書く工程を実装から切り離す。
