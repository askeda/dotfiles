---
name: ship
description: Take a ticket from the board and implement it on a branch cut from the integration branch, self-reviewed. Two flows, chosen by the user at the start of every run - PR flow branches, commits and opens pull requests; handoff flow implements one ticket and stops with the changes uncommitted for the user to review in IDE. Also handles addressing review remarks left on PRs. Use when the user says to ship, implement, or pick up an issue by number, or tells you they left remarks on a PR.
disable-model-invocation: true
---

Implement a ticket end to end. The user reviews and merges — this skill never merges anything.

Generic across projects. Infer the integration branch, board, and gate commands from the repo; do not assume this project's setup.

## Entry points

Two, both user-triggered:

- **Ship a ticket** — `/ship 62`, or the user names an issue in conversation. Runs the process below, under one of the two flows.
- **Address remarks** — the user says something like "I left remarks on #64" or pastes a PR link. Skip to [Addressing review remarks](#addressing-review-remarks). No flow choice applies — remarks are always worked on the PR's own branch.

## 1. Choose the flow

Before anything else — before preconditions, before reading the ticket — ask the user which flow this run takes. Never assume one

**PR flow** — the full run. Branches, commits, gates, self-review, pull requests, board moves, progress ledger. A parent with sub-issues produces a parent branch plus one branch and PR per child.

**Handoff flow** — one ticket, one branch, nothing committed. The unit of work is a single leaf ticket: a standalone ticket, or exactly one child of a parent. Cut the branch, implement that ticket, run gates and self-review, then stop with the changes **uncommitted** in the worktree. The user reviews in their IDE, then commits, pushes, opens the PR, and merges on their own. The next ticket is a fresh session and a fresh run of this skill.

In handoff flow, if the user names a parent that has sub-issues, do **not** implement the tree. List the children with their `Blocked by` edges and ask which single one this run implements.

## 2. Preconditions

Fail fast, before any branch exists. Check in one pass:

- Inside a git repo. A dirty worktree does **not** stop the run — commit it with the `/commit` command so nothing is carried into the ticket's branch as loose changes. This matters more in handoff flow, where the run ends dirty by design and pre-existing changes would be indistinguishable from the ticket's work. One exception: if the current branch is the integration branch, do not commit onto it. Cut the ticket branch first (`git checkout -b` carries the changes over), then `/commit` there and say so in the report.
- `gh` is authenticated and the repo resolves.
- The issue the user named exists and is open.

Resolve the **integration branch**: `dev` if it exists, otherwise the repo default branch. If a repo has both and it is unclear which one feature work lands on, ask. Everything below branches from it and targets it.

## 3. Read the ticket

Fetch the issue. Determine whether it has native sub-issues (`gh api repos/{owner}/{repo}/issues/{n}/sub_issues`).

- **Sub-issues present** → this is a parent. In PR flow the children are the work; in handoff flow one chosen child is the work.
- **No sub-issues** → single slice. The ticket itself is the work.

Read the `Spec:` line if the body has one and read that spec file — it is the source of truth for the Spec review axis. Read the body of every ticket you will implement: What to build, Acceptance criteria, Blocked by.

Find the repo's **standards files** now — `CLAUDE.md`, docs the repo points at for conventions. The Standards review axis in step 6 is built from them.

## 4. Plan the branch topology

**Handoff flow.** Cut `<type>/<issue>-<slug>` from the integration branch, where `<issue>` is the leaf ticket chosen in step 1. No parent branch, no empty commit, no draft PR, no stacking, no sibling bases. If one of the ticket's `Blocked by` edges has not landed in the integration branch yet, say so before cutting — the user decides whether to base on it anyway or wait. Skip to step 5.

**PR flow, single slice.** Cut `<type>/<issue>-<slug>` from the integration branch. One PR into the integration branch. No parent branch, no empty commit. Skip to step 5.

**PR flow, parent with children.**

1. Cut the parent branch `<type>/<parent-issue>-<slug>` from the integration branch.
2. `git commit --allow-empty -m "chore: start <feature>"` so the branch has a diff.
3. Push it and open a **draft** PR into the integration branch. This PR is the feature's visible home and its progress ledger (step 7).
4. Order the children by their `Blocked by` edges.
5. For each child, decide its base:
   - Default: the **parent branch**.
   - **Stack on a sibling** when a `Blocked by` edge names it, or when the two children are predicted to touch the same files. Predicting overlap is a judgement call made before the code exists — when unsure, don't stack; step 8 flags the conflict risk instead.

State the planned topology before writing code, so the user can see the stack shape.

## 5. Implement

In PR flow, work one child at a time in dependency order. In handoff flow there is exactly one ticket. For each:

- Check out its base, cut the branch, implement the slice end to end — every layer the ticket needs, not one horizontal layer.
- Follow the repo's documented standards and existing idiom. Match the surrounding code.
- **PR flow:** commit with the `/commit` command, which applies the project's commit style. One commit per coherent step; do not squash the whole slice into one commit unless it genuinely is one step.
- **Handoff flow:** do not commit. Do not stage. Do not push. Leave every change in the working tree exactly as written, so the user's editor shows the full diff against the branch point.

**Tests.** Use tests only where the infrastructure already exists — a test script and a runner in the manifest. Where it exists, write tests at the seams the ticket implies and run the relevant file(s) as you go. Where it does not exist, **do not introduce a test runner**; note that verification was gates-only.

## 6. Gates, self-review, and what lands

Per ticket, in this order.

### Gates

Run whatever the repo defines: lint, typecheck, build, and the full test suite if one exists. Read the manifest for the real command names.

If a gate fails and cannot be fixed after a reasonable attempt:

- **PR flow:** push the branch, open the PR **as draft**, put the failing output in the body, and continue to the next child. Do not abandon the work and do not stop the run.
- **Handoff flow:** leave the changes in place and put the failing output in the final report, called out plainly at the top. Never hide a red gate behind a handoff.

### Self-review

Runs in both flows. Run the two axes as **parallel sub-agents** in a single message, so they do not pollute each other's context. Give each the diff command and the commit list — in PR flow `git diff <base>...HEAD` (three-dot); in handoff flow `git diff` plus `git status`, since nothing is committed.

**Standards axis brief.** Include the standards files found in step 3 plus the smell baseline below, pasted in full — the sub-agent has no other access to it. Ask for: (a) every place the diff violates a documented standard, citing the standard file and rule; (b) any baseline smell, named with the hunk quoted. Hard violations and judgement calls must be labelled distinctly. Skip anything tooling enforces. Under 400 words.

**Spec axis brief.** Include the spec and the ticket's acceptance criteria. Ask for: (a) requirements asked for but missing or partial; (b) behaviour in the diff nobody asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec or criterion line per finding. Under 400 words.

If there is no spec and no acceptance criteria, skip the Spec axis and say so.

### Fix, then report

- **Fix before handing over:** documented-standard breaches, unmet acceptance criteria, and implemented-but-wrong findings. Re-run gates after fixing. This applies in both flows — the user should never be handed work with a known hard finding in it.
- **Report only, never silently refactor:** baseline smells and scope-creep flags. In PR flow they go in the PR body under `## Review notes (judgement calls)`. In handoff flow they go in the final report under the same heading, since there is no PR body to carry them.

Findings that tooling already enforces are dropped entirely, not reported.

### Open the PR — PR flow only

Handoff flow opens nothing. Skip to step 8.

Base is the ticket's base branch (parent branch, or the sibling it stacks on). Title is the issue title verbatim. Body:

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

## 7. Progress ledger — PR flow only

After each child's PR is open, update the **parent PR body** with a checklist:

```markdown
## Slices
- [x] #63 Tab state in the URL — `feat/63-tab-url-state` → #71
- [ ] #64 Date range state in the URL
```

This is what makes a cut-short run resumable. A fresh session reads the parent PR body and restarts at the first unchecked box. Keep it current — it is the only durable record of where the run got to.

Handoff flow has no ledger. Each run is one ticket, and the durable record is the branch the user commits plus the board.

## 8. Board and report

**PR flow.** If the repo has a project board, move the card that represents this work — the parent for a multi-slice feature, the ticket itself for a single slice. Children are typically not on the board; do not add them.

- `In progress` (or the board's equivalent) when the run starts.
- `In review` when the PRs are open.
- Never `Done` — the user sets that after merging.

End the run with: the branch topology as built, every PR opened with its base, which are draft and why, judgement-call findings per slice, and any sibling PRs likely to conflict on merge.

**Handoff flow.** Do not write board fields. The user drives this ticket's lifecycle end to end and moves the card themselves.

End the run with:

- The ticket implemented, and the branch it sits on.
- **That the changes are uncommitted**, stated plainly — this is the headline.
- Gate results, with any failure at the top.
- `## Review notes (judgement calls)` from the self-review, or "None".
- What is left to the user: review, commit, push, open the PR, merge.

Do not rerank findings across the two axes — the separation exists to stop one axis masking the other.

## Addressing review remarks

Triggered conversationally. The user names a PR. No flow choice — this always works the PR's own branch and always commits.

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
- Assumes a flow. Step 1 asks, every run.
- Commits, stages, or pushes in handoff flow.
- Implements more than one ticket in a handoff run.
