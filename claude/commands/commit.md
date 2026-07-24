---
description: Commit the current changes using the project's commit style
---

Create a git commit for the current changes, following the commit style defined below.

## Style rules

- Conventional-commit prefix: `type: description`
- Allowed types: `feat`, `fix`, `chore`
  - `feat` — new features, refactors, UI/behavior changes (used broadly, even for adjustments/refactors)
  - `fix` — bug fixes
  - `chore` — config, tooling, deps, lint, settings
- Description: lowercase, short, no trailing period, imperative or concise noun phrase
- NO scope in parentheses
- NO commit body — subject line only
- For multi-part work, suffix ` N/M` (e.g. `feat: kinde to clerk migration 1/2`)

## Steps

1. Run `git status` and `git diff --staged` to review the staged changes.
2. Commit only what is already staged — do NOT run `git add` or stage additional files.
3. Pick the single most fitting `type` and write a concise subject following the style rules above.
4. Commit with `git commit -m "..."` — subject only, no body, no Co-Authored-By.
5. Do not push afterwards
