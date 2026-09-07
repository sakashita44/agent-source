---
name: implement
description: >-
  Use when starting implementation work whose direction is already decided.
  Keeps comments out of the implementation itself and runs the comment pass
  afterwards.
---
# Implement

実装を進めるときの入口とする。このSkill自身は規則を持たない。

作業の分解と委譲は`subagent`、設計と品質の判断は`engineering-principles`を参照する。

このSkillが担うのは1つである。実装中はコメントを書かず、実装が済んだ時点で`add-comment`を起動する。`add-comment`は執筆を別のエージェントへ委譲するため、実装した本人がコメントを書くことにならない。

実装しながら書くコメントは、書いた本人には自明でない箇所が見えないため、実装の言い換えになりやすい。コメントを書く工程を実装から切り離す。
