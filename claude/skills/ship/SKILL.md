---
name: ship
description: Take a ticket from the board, implement it on a branch cut from the integration branch, self-review it, and open pull requests — a parent PR for a feature with sub-issues plus one PR per slice, or a single PR for a standalone ticket. Also handles addressing review remarks left on those PRs. Use when the user says to ship, implement, or pick up an issue by number, or tells you they left remarks on a PR.
disable-model-invocation: true
---

Implement a ticket end to end: branch, code, gates, self-review, pull request. The user reviews and merges — this skill never merges anything.

Generic across projects. Infer the integration branch, board, and gate commands from the repo; do not assume this project's setup.

## Modes

Two entry points, both user-triggered:

- **Ship a ticket** — `/ship 62`, or the user names an issue in conversation. Runs the full process below.
- **Address remarks** — the user says something like "I left remarks on #64" or pastes a PR link. Skip to [Addressing review remarks](#addressing-review-remarks).

## 1. Preconditions

Fail fast, before any branch exists. Check in one pass:

- Inside a git repo. A dirty worktree does **not** stop the run — commit it with the `/commit` command so nothing is carried into the ticket's branch as loose changes. One exception: if the current branch is the integration branch, do not commit onto it. Cut the ticket branch first (`git checkout -b` carries the changes over), then `/commit` there and say so in the report — those changes are now part of the ticket's PR.
- `gh` is authenticated and the repo resolves.
- The issue the user named exists and is open.

Resolve the **integration branch**: `dev` if it exists, otherwise the repo default branch. If a repo has both and it is unclear which one feature work lands on, ask. Everything below branches from it and targets it.

## 2. Read the ticket

Fetch the issue. Determine whether it has native sub-issues (`gh api repos/{owner}/{repo}/issues/{n}/sub_issues`).

- **Sub-issues present** → this is a parent. The children are the work.
- **No sub-issues** → single slice. The ticket itself is the work.

Read the `Spec:` line if the body has one and read that spec file — it is the source of truth for the Spec review axis. Read every child's body: What to build, Acceptance criteria, Blocked by.


## 3. Plan the branch topology

**Single slice.** Cut `<type>/<issue>-<slug>` from the integration branch. One PR into the integration branch. No parent branch, no empty commit. Skip to step 4.

**Parent with children.**

1. Cut the parent branch `<type>/<parent-issue>-<slug>` from the integration branch.
2. `git commit --allow-empty -m "chore: start <feature>"` so the branch has a diff.
3. Push it and open a **draft** PR into the integration branch. This PR is the feature's visible home and its progress ledger (step 6).
4. Order the children by their `Blocked by` edges.
5. For each child, decide its base:
   - Default: the **parent branch**.
   - **Stack on a sibling** when a `Blocked by` edge names it, or when the two children are predicted to touch the same files. Predicting overlap is a judgement call made before the code exists — when unsure, don't stack; step 7 flags the conflict risk instead.

State the planned topology before writing code, so the user can see the stack shape.

## 4. Implement

Work one child at a time, in dependency order. For each:

- Check out its base, cut the branch, implement the slice end to end — every layer the ticket needs, not one horizontal layer.
- Follow the repo's documented standards and existing idiom. Match the surrounding code.
- Commit with the `/commit` command, which applies the project's commit style. One commit per coherent step; do not squash the whole slice into one commit unless it genuinely is one step.

**Tests.** Use tests only where the infrastructure already exists — a test script and a runner in the manifest. Where it exists, write tests at the seams the ticket implies and run the relevant file(s) as you go. Where it does not exist, **do not introduce a test runner**; note in the PR body that verification was gates-only.

## 5. Gates, self-review, PR

Per child, in this order. Do not open the PR before the first two pass.

### Gates

Run whatever the repo defines: lint, typecheck, build, and the full test suite if one exists. Read the manifest for the real command names.

If a gate fails and cannot be fixed after a reasonable attempt: push the branch, open the PR **as draft**, put the failing output in the body, and continue to the next child. Do not abandon the work and do not stop the run.

### Self-review

Run the two axes as **parallel sub-agents** in a single message, so they do not pollute each other's context. Give each the diff command (`git diff <base>...HEAD`, three-dot) and the commit list.

**Standards axis brief.** Include the standards files found in step 2 plus the smell baseline below, pasted in full — the sub-agent has no other access to it. Ask for: (a) every place the diff violates a documented standard, citing the standard file and rule; (b) any baseline smell, named with the hunk quoted. Hard violations and judgement calls must be labelled distinctly. Skip anything tooling enforces. Under 400 words.

**Spec axis brief.** Include the spec and the child's acceptance criteria. Ask for: (a) requirements asked for but missing or partial; (b) behaviour in the diff nobody asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec or criterion line per finding. Under 400 words.

If there is no spec and no acceptance criteria, skip the Spec axis and say so in the PR body.

### Fix, then report

- **Fix before opening the PR:** documented-standard breaches, unmet acceptance criteria, and implemented-but-wrong findings. Re-run gates after fixing.
- **Report only, never silently refactor:** baseline smells and scope-creep flags. They go in the PR body under `## Review notes (judgement calls)` for the user to rule on.

Findings that tooling already enforces are dropped entirely, not reported.

### Open the PR

Base is the child's base branch (parent branch, or the sibling it stacks on). Title is the issue title verbatim. Body:

```markdown
Closes #<issue>

Spec: <path>            (omit if none)
Part of #<parent>       (omit for a single slice)

## Acceptance criteria
- [x] …copied from the ticket, checked to reflect reality…

## Review notes (judgement calls)
- …baseline smells and scope-creep flags, or "None"…

## Verification
Gates run and their results. Note if tests were unavailable.
```

`Closes #N` is written for traceability. It will **not** fire automatically — these PRs merge into the integration branch or a parent branch, and GitHub only auto-closes on merge into the default branch. The user closes issues by hand.

## 6. Progress ledger

After each child's PR is open, update the **parent PR body** with a checklist:

```markdown
## Slices
- [x] #63 Tab state in the URL — `feat/63-tab-url-state` → #71
- [ ] #64 Date range state in the URL
```

This is what makes a cut-short run resumable. A fresh session reads the parent PR body and restarts at the first unchecked box. Keep it current — it is the only durable record of where the run got to.

## 7. Board and report

If the repo has a project board, move the card that represents this work — the parent for a multi-slice feature, the ticket itself for a single slice. Children are typically not on the board; do not add them.

- `In progress` (or the board's equivalent) when the run starts.
- `In review` when the PRs are open.
- Never `Done` — the user sets that after merging.

End the run with: the branch topology as built, every PR opened with its base, which are draft and why, judgement-call findings per slice, and any sibling PRs likely to conflict on merge. Do not rerank findings across the two axes — the separation exists to stop one axis masking the other.

## Addressing review remarks

Triggered conversationally. The user names a PR.

1. Fetch the threads. Inline comments: `gh api repos/{owner}/{repo}/pulls/{n}/comments`. Review summaries: `.../pulls/{n}/reviews`. Conversation comments: `.../issues/{n}/comments`. REST does not expose whether a thread is resolved — get that from GraphQL `reviewThreads { isResolved }` and work only the unresolved ones.
2. Address each remark on the PR's own branch. Where a remark is a request you disagree with, say so in the reply rather than silently ignoring or silently complying.
3. Re-run gates. Push.
4. Reply in-thread to each remark with what changed. **Do not resolve the threads** — resolving is the reviewer's signal, not yours.

**Restacking.** If the PR has children stacked on it, changing it invalidates them. Do not restack automatically. Report which downstream branches are now stale; rebase and force-push them only when the user asks.

## Smell baseline

Carried by the Standards axis on top of whatever the repo documents. Two rules bind it: **the repo overrides** — a documented standard always wins, and where it endorses something the baseline would flag, suppress the smell; and **every entry is a judgement call**, labelled as a possibility ("possible Feature Envy"), never a hard violation. Skip anything tooling enforces.

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same switch/if-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

## This skill never

- Merges a PR, or marks the parent PR ready for review.
- Resolves a review thread.
- Closes an issue.
- Sets Priority or applies labels.
- Introduces test infrastructure to a repo that has none.
- Restacks dependent branches without being asked.
