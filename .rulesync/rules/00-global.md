---
root: true
targets:
  - "*"
---
# Global Agent Instructions

## General Workflow

Before starting any task, briefly state what you intend to do so the user can assess the direction and interrupt (Esc) if needed. Do not jump into investigation or implementation without first showing your approach.

- Trivial tasks (typo fix, single-line change, etc.): state the plan inline and proceed. No explicit approval needed.
- Non-trivial tasks: present a plan and get user approval before implementing.
- Unexpected failures (MCP errors, missing files, broken assumptions, etc.): stop, report the situation, and ask for direction before attempting additional investigation.

1. Plan: analyze the request and the codebase. Outline the necessary changes.
2. Review: check if the plan introduces technical debt. If so, revise to include refactoring.
3. Execute: implement the solution following the guidelines below.

Investigation — repo structure, existing implementations, environment and tooling state — goes to subagents by default; the main context keeps judgment, review, and integration.

## Skill Routing

- Markdown docs, PR descriptions, ADRs: write or edit only via the write-docs skill. It is the canonical source of the Documentation Style rules.
- Commits: only via the commit skill, and only when the user asks. Never commit on your own initiative.
- PR merge and branch cleanup: only via the pr-merge skill. Releases (CHANGELOG promotion, tagging): only via the release skill.
- grill-me (requirements interview) and verify-code / verify-docs / verify-manual (quality rubrics) are not model-invocable. Propose them to the user when the work calls for one.

## Git

- Use merge commit when merging PRs; never squash or rebase.
- Conventional commit prefixes apply to commits and PR titles. `fix:` is strictly for user-facing bug fixes; dev environment changes are `chore:`. Messages and titles state why the change was made, not what changed.
- Branch naming: `<branch_type>/<yyyymm>/sakashita44/<issue_num>-<content>`. The `<issue_num>-` prefix is optional when there is no associated issue.
- Every PR includes updates to affected documentation, or states in the PR description why none are needed.
- CHANGELOG follows [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/); maintenance rules are implemented in the pr-merge and release skills.

## Testing & Verification

- Test plans are not required for PRs (personal project context).
- Prefer existing automation (e.g., pre-commit hooks) over manually running linters or tools. Do not re-run tools that pre-commit already covers.

## Implementation Guidelines

- Decision priority: trivial decisions follow prevailing conventions; critical infrastructure follows established standards; domain-specific problems get purpose-built designs — spend original thinking there.
- Library First: evaluate well-maintained libraries before implementing standard functionality (validation, ID generation, UI patterns, etc.).
- Language: when a task calls for JavaScript, use TypeScript unless there is a specific reason not to. Otherwise choose the language that fits the problem domain and ecosystem.
- Before writing code, read the target files and related modules; do not patch a line without understanding the surrounding architecture. If the existing code is messy or violates SOLID, propose a refactoring plan first — do not build features on rotten code.
- Code quality target: readable names, single-responsibility functions, strict typing, DRY. Verification rubric: verify-code skill.
- Follow the project's naming conventions, directory structure, and typing patterns; if the project lacks a clear pattern, establish a clean one.
- Where each intent belongs: code expresses _How_ (the implementation itself); test code expresses _What_ (the expected behavior/spec); commit logs express _Why_ (the reason for the change); code comments express _Why not_ (rejected alternatives, non-obvious constraints, pitfalls avoided). Do not write comments that merely restate _How_ — the code already says that.
- Where each planning intent lives: specs/concept docs express _intended What/Why_ (the purpose of something not yet built); issues express the _fluid path_ (how to build it, the in-flight decomposition, task order); fixed `docs/` express _as-built current fact_ (the settled result); decision records / ADRs express _durable decision Why_ (the rationale). Do not pin the implementation path, task decomposition, type/function names, or concrete parameter values into fixed docs — keep them in issues and land them in docs as as-built once implementation settles.
- Express intent, not implementation vocabulary: plans and specs state what an element is meant to _do_. Defer binding implementation vocabulary (type names, function names, concrete constants) to the lowest layer (issue → code); never let it compress or hide the intent in durable docs or upstream planning.

## Environment Notes

- `node` and `uv` are available after `D:\UserData\Workspace\tools\Set-Env.ps1` is run.
- Shell: If running in Claude Code, it runs in Git Bash (`/usr/bin/bash`).
- Path: Windows paths (`D:\...`) are usable. Do not use `cd /d` (cmd.exe-specific); use plain `cd` in bash.
- Subagents: prefer the `agy` command (Google Antigravity) as the delegation target, including where a skill's procedure delegates. Fall back to the built-in Agent tool with a Sonnet-class model when `agy` is unavailable or when the work needs what the Agent tool provides (read-only Explore, background task tracking, session-local tool access).
  - Run non-interactively with `-p "<prompt>"`. Print mode waits 5 minutes by default; extend with `--print-timeout`.
  - Select the model with `--model`, using a Pro-class id such as `gemini-3.1-pro-high`. `agy models` lists the valid ids; avoid Flash models.
  - Reach paths outside the current workspace with `--add-dir <path>`. Headless mode auto-denies file access it cannot prompt for.
  - When instructing agy, include a prompt that prevents the turn from ending with only a request for approval or only a declaration that work has started (depending on the case, agy also needs the `--dangerously-skip-permissions`). If agy fails, retry up to two times with a revised prompt.

## Other Notes

- Use Japanese for comments, documentation, pull requests, and commit messages.
- Write Japanese prose in plain form (常体), stating facts; the full register and style rules are in the write-docs skill.
