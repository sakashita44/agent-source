---
name: commit
description: >-
  Git commit helper with conventional commits.
  Use when the user wants to commit changes, says "commit", or asks to save their work to git.
allowed-tools:
  - Bash
  - AskUserQuestion
---
# Git Commit Skill

Conventional commit workflow. Follow each step in order.

Invoke this skill only when the user has explicitly asked to commit. Never start a commit on your own initiative, and never commit outside this skill.

## Step 1: Inspect working tree

Run these commands in parallel:

```bash
git status
```

```bash
git diff --staged
```

Show the results to the user.

## Step 2: Staging

- If there are **no staged changes**, show the unstaged/untracked files and propose a staging plan.
- **Logical grouping**: Analyze the changes and suggest grouping files by **logical unit of change** — even within the same issue or feature, split by concern (e.g., config change vs. logic change vs. doc update). Do **not** propose merging into a single commit just because the changes belong to the same issue. Err on the side of finer granularity.
- **Exception — feature-bound support files**: a file that exists only to support one feature (e.g., a tool config file introduced for that feature, such as `fabrication-toolkit-options.json`) belongs in that feature's commit. Do not split it into a separate config-only commit.
- Ask the user which group to stage first, or let them adjust the grouping.
- Stage only the approved files by name (`git add <file>...`). **Never run `git add -A` without explicit user confirmation.**
- If there **are already staged changes**, proceed to Step 3.

## Step 3: Review staged diff

If new files were staged in Step 2, run `git diff --staged` again to show the full staged diff.

## Step 4: Determine commit type

Conventional commit prefixes:

| Prefix       | Usage                                       |
|-------------|---------------------------------------------|
| `feat:`     | New user-facing feature                     |
| `fix:`      | User-facing bug fix                         |
| `docs:`     | Documentation only                          |
| `refactor:` | Code restructuring without behavior change  |
| `test:`     | Adding or updating tests                    |
| `chore:`    | Dev environment, tooling, dependencies, CI  |

**Important:** `fix:` is strictly for user-facing bug fixes. Dev environment fixes use `chore:`.

If the correct prefix is obvious from the diff, select it automatically.
If ambiguous, ask the user to choose.

## Step 5: Write commit message

Format:

```text
<prefix>: <summary line>

<background paragraph>

- <change 1>: <reason>
- <change 2>: <reason>
- ...
```

Rules:

- **Summary line**: concise, explains **why** the change was made. The diff already shows *what* changed, so the message should convey intent or motivation. Exception: when the *what* is self-evidently the *why* (e.g., `docs: CLI リファレンスを追加`), restating it as-is is fine.
- **Background paragraph**: prose paragraph immediately after the blank line. Describe the problem or situation that necessitated this change — what was broken, missing, or needed. This is the "why" context a future reader needs to understand the commit without the PR thread. Omit only for trivially simple single-file changes where the summary already covers the full story.
- **Body bullets**: each bullet states one logical change and its specific reason (`- <what>: <why>`). Required unless the commit is trivially simple.
- Follow the project's language convention for commit messages (check CLAUDE.md or recent `git log --oneline -5`)
- **Register**: write Japanese messages in plain form (常体・だ/である), stating facts plainly — no ですます, no hedging, no normative phrasing (責務/許可/should)
- Present the draft to the user for approval. Accept edits if requested.

## Step 6: Commit

Run `git commit` with the approved message.

- **Default to `-F <tmpfile>` for any multi-bullet body.** Each `-m` flag is rendered as a separate paragraph with a blank line inserted between them, so repeated `-m` puts blank lines between bullets. To keep bullets contiguous (no blank lines), write the full message to a temp file and pass it with `-F`:
    - **Bash tool**: `tmp=$(mktemp); cat > "$tmp" <<'EOF'` … `EOF`, then `git commit -F "$tmp" && rm -f "$tmp"`. The quoted `'EOF'` prevents variable/backtick expansion.
    - **PowerShell tool**: a here-string `@'...'@` is fine (closing `'@` must be at column 0); pipe or write to a file and `-F` it, or use `git commit -F`.
- **Passing a multi-line message safely (recurring bug — read this):** Never use the PowerShell here-string `@'...'@` inside the **Bash** tool. Bash does not parse it as a here-string and leaks stray `@` lines into the summary/body.
    - Repeated `-m` is acceptable only when blank lines between paragraphs are desired (summary / background / single block). For bullet lists, use `-F` as above.
- **Always verify after committing**: run `git log -1 --format=%B` and confirm no stray `@`, escaping artifacts, or truncated lines before reporting success.
- If a pre-commit hook fails, show the output and help fix the issues, then create a **new** commit (never amend)
- After committing, if there are remaining unstaged changes from Step 2's grouping, remind the user and offer to start another commit cycle for the next group.

## Restrictions

- Do **NOT** use `--amend` unless the user explicitly requests it
- Do **NOT** run `git push` unless the user explicitly requests it
- Do **NOT** run linters, formatters, or type checkers manually — trust project-configured automation (e.g., pre-commit hooks) to run during `git commit`
