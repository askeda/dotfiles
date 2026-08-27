---
name: ship
description: Take a unit of work and implement it on a branch cut from the integration branch, self-reviewed. Two flows, chosen by the user at the start of every run. PR flow branches, commits and opens pull requests off a board ticket; handoff flow implements one ticket, one local spec file, or the plan settled in the current conversation, and stops with the changes uncommitted for the user to review in IDE. Also handles addressing review remarks left on PRs. Use when the user says to ship, implement, or pick up an issue by number, or tells you they left remarks on a PR.
disable-model-invocation: true
---

Implement a ticket end to end. The user reviews and merges. This skill never merges anything.

Generic across projects. Infer the integration branch, board, and gate commands from the repo; do not assume this project's setup.

## Entry points

Two, both user-triggered:

- **Ship a unit of work.** `/ship 62`, `/ship docs/specs/<module>/<feature>.md`, or bare `/ship` after a design conversation. Runs the process below, under one of the two flows. PR flow always needs an issue; handoff flow does not.
- **Address remarks.** The user says something like "I left remarks on #64" or pastes a PR link. Skip to [Addressing review remarks](#addressing-review-remarks). No flow choice applies, since remarks are always worked on the PR's own branch.

## 1. Choose the flow and the work source

Before anything else, before preconditions and before reading the ticket, ask the user which flow this run takes. Never assume one.

**PR flow.** The full run. Branches, commits, gates, self-review, pull requests, board moves, progress ledger. A parent with sub-issues produces a parent branch plus one branch and PR per child.

**Handoff flow.** One unit of work, one branch, nothing committed. That unit is a single leaf ticket, one local spec file, or the plan settled in the current conversation. Cut the branch, implement that ticket, run gates and self-review, then stop with the changes **uncommitted** in the worktree. The user reviews in their IDE, then commits, pushes, opens the PR, and merges on their own. The next ticket is a fresh session and a fresh run of this skill.

In handoff flow, if the user names a parent that has sub-issues, do **not** implement the tree. List the children with their `Blocked by` edges and ask which single one this run implements.

### Work source, handoff flow only

PR flow always works from an issue on the board. Handoff flow does not need one, and must never create one. Once handoff is chosen, resolve where the work comes from, taking the first of these that applies:

1. **The user already named it.** An issue number (`/ship 62`), or a path to a local spec or plan file (`/ship docs/specs/<module>/<feature>.md`). Take it and move on. Ask nothing.
2. **This conversation already settled it.** A spec written earlier in the session, a plan agreed, a design discussion that landed. Say which of those you would implement and summarise its scope in two or three lines, then get a yes before cutting the branch. That summary is the scope for the rest of the run.
3. **Nothing to work from.** A fresh session with no prior context and no argument means the work lives somewhere you cannot see. Ask the user for the issue number or the spec path. Do not go hunting through the board for a likely-looking card.

The source decides what the rest of the run reads and what it skips:

- **Ticket.** Full run. Issue preconditions apply, and step 3 reads the issue body.
- **Spec or plan file.** Read that file. No issue, no `gh` requirement, no board, no `Closes #N` anywhere.
- **Conversation.** The confirmed summary is the scope. Restate it in the final report, since nothing else records it.

## 2. Preconditions

Fail fast, before any branch exists. Check in one pass:

- Inside a git repo. A dirty worktree does **not** stop the run. Commit it with the `/commit` command so nothing is carried into the ticket's branch as loose changes. This matters more in handoff flow, where the run ends dirty by design and pre-existing changes would be indistinguishable from the ticket's work. One exception: if the current branch is the integration branch, do not commit onto it. Cut the ticket branch first (`git checkout -b` carries the changes over), then `/commit` there and say so in the report.
- `gh` is authenticated and the repo resolves. Required for PR flow. In handoff flow it is required only when the work source is a ticket.
- The issue the user named exists and is open. Skip when the handoff source is a spec file or the conversation.

Resolve the **integration branch**: `dev` if it exists, otherwise the repo default branch. If a repo has both and it is unclear which one feature work lands on, ask. Everything below branches from it and targets it.

## 3. Read the work

**Spec or plan file source.** Read the file in full. Its scope and any acceptance criteria in it are the ticket for this run. Skip the sub-issue check and the rest of this step's issue handling, then go to step 4.

**Conversation source.** The summary confirmed in step 1 is the scope. Write out acceptance criteria for it before implementing, so step 6 has something concrete to review against. Go to step 4.

**Ticket source.** Fetch the issue. Determine whether it has native sub-issues (`gh api repos/{owner}/{repo}/issues/{n}/sub_issues`).

- **Sub-issues present.** This is a parent. In PR flow the children are the work; in handoff flow one chosen child is the work.
- **No sub-issues.** Single slice. The ticket itself is the work.

Read the `Spec:` line if the body has one and read that spec file. It is the source of truth for the Spec review axis. Read the body of every ticket you will implement: What to build, Acceptance criteria, Blocked by.

Find the repo's **standards files** now, meaning `CLAUDE.md` and any docs the repo points at for conventions. The Standards review axis in step 6 is built from them.

## 4. Plan the branch topology

**Handoff flow.** Cut `<type>/<issue>-<slug>` from the integration branch, where `<issue>` is the leaf ticket chosen in step 1. With no ticket, cut `<type>/<slug>` from a slug naming the work. No parent branch, no empty commit, no draft PR, no stacking, no sibling bases. For a ticket source, if one of its `Blocked by` edges has not landed in the integration branch yet, say so before cutting. The user decides whether to base on it anyway or wait. Skip to step 5.

**PR flow, single slice.** Cut `<type>/<issue>-<slug>` from the integration branch. One PR into the integration branch. No parent branch, no empty commit. Skip to step 5.

**PR flow, parent with children.**

1. Cut the parent branch `<type>/<parent-issue>-<slug>` from the integration branch.
2. `git commit --allow-empty -m "chore: start <feature>"` so the branch has a diff.
3. Push it and open a **draft** PR into the integration branch. This PR is the feature's visible home and its progress ledger (step 7).
4. Order the children by their `Blocked by` edges.
5. For each child, decide its base:
   - Default: the **parent branch**.
   - **Stack on a sibling** when a `Blocked by` edge names it, or when the two children are predicted to touch the same files. Predicting overlap is a judgement call made before the code exists. When unsure, don't stack; step 8 flags the conflict risk instead.

State the planned topology before writing code, so the user can see the stack shape.

## 5. Implement

In PR flow, work one child at a time in dependency order. In handoff flow there is exactly one ticket. For each:

- Check out its base, cut the branch, implement the slice end to end. Every layer the ticket needs, not one horizontal layer.
- Follow the repo's documented standards and existing idiom. Match the surrounding code.
- **PR flow.** Commit with the `/commit` command, which applies the project's commit style. One commit per coherent step; do not squash the whole slice into one commit unless it is one step.
- **Handoff flow.** Do not commit. Do not stage. Do not push. Leave every change in the working tree exactly as written, so the user's editor shows the full diff against the branch point.

**Tests.** Use tests only where the infrastructure already exists, meaning a test script and a runner in the manifest. Where it exists, write tests at the seams the ticket implies and run the relevant file(s) as you go. Where it does not exist, **do not introduce a test runner**; note that verification was gates-only.

## 6. Gates, self-review, and what lands

Per ticket, in this order.

### Gates

Run whatever the repo defines: lint, typecheck, build, and the full test suite if one exists. Read the manifest for the real command names.

If a gate fails and cannot be fixed after a reasonable attempt:

- **PR flow.** Push the branch, open the PR **as draft**, put the failing output in the body, and continue to the next child. Do not abandon the work and do not stop the run.
- **Handoff flow.** Leave the changes in place and put the failing output in the final report, at the top. Never hide a red gate behind a handoff.

### Self-review

Runs in both flows. Run the two axes as **parallel sub-agents** in a single message, so they do not pollute each other's context. Give each the diff command and the commit list: in PR flow `git diff <base>...HEAD` (three-dot), in handoff flow `git diff` plus `git status`, since nothing is committed.

**Standards axis brief.** Include the standards files found in step 3 plus the smell baseline below, pasted in full, since the sub-agent has no other access to it. Ask for: (a) every place the diff violates a documented standard, citing the standard file and rule; (b) any baseline smell, named with the hunk quoted. Label hard violations and judgement calls distinctly. Skip anything tooling enforces. Under 400 words.

**Spec axis brief.** Include the spec and the acceptance criteria, from whichever source step 1 resolved: the ticket body, the spec or plan file, or the criteria written in step 3 for conversation-sourced work. Ask for: (a) requirements asked for but missing or partial; (b) behaviour in the diff nobody asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec or criterion line per finding. Under 400 words.

If there is no spec and no acceptance criteria, skip the Spec axis and say so.

### Fix, then report

- **Fix before handing over.** Documented-standard breaches, unmet acceptance criteria, and implemented-but-wrong findings. Re-run gates after fixing. This applies in both flows. The user should never be handed work with a known hard finding in it.
- **Report only, never silently refactor.** Baseline smells and scope-creep flags. In PR flow they go in the PR body under `## Review notes (judgement calls)`. In handoff flow they go in the final report under the same heading, since there is no PR body to carry them.

Drop findings that tooling already enforces. Do not report them.

### Open the PR

PR flow only. Handoff flow opens nothing, so skip to step 8.

Base is the ticket's base branch, the parent branch or the sibling it stacks on. Title is the issue title verbatim. Body:

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

`Closes #N` is written for traceability. It will **not** fire automatically. These PRs merge into the integration branch or a parent branch, and GitHub only auto-closes on merge into the default branch. The user closes issues by hand.

## 7. Progress ledger

PR flow only. After each child's PR is open, update the **parent PR body** with a checklist:

```markdown
## Slices
- [x] #63 Tab state in the URL, `feat/63-tab-url-state`, PR #71
- [ ] #64 Date range state in the URL
```

This is what makes a cut-short run resumable. A fresh session reads the parent PR body and restarts at the first unchecked box. Keep it current. It is the only durable record of where the run got to.

Handoff flow has no ledger. Each run is one ticket, and the durable record is the branch the user commits plus the board.

## 8. Board and report

**PR flow.** If the repo has a project board, move the card that represents this work: the parent for a multi-slice feature, the ticket itself for a single slice. Children are typically not on the board; do not add them.

- `In progress` (or the board's equivalent) when the run starts.
- `In review` when the PRs are open.
- Never `Done`. The user sets that after merging.

End the run with the branch topology as built, every PR opened with its base, which are draft and why, judgement-call findings per slice, and any sibling PRs likely to conflict on merge.

**Handoff flow.** Do not write board fields. The user drives this ticket's lifecycle end to end and moves the card themselves.

End the run with:

- What was implemented, and the branch it sits on. Name the source: issue number, spec path, or that it came from this conversation.
- For conversation-sourced work, the scope and acceptance criteria you worked to, since no ticket or file records them.
- **That the changes are uncommitted.** This is the headline; state it plainly.
- Gate results, with any failure at the top.
- `## Review notes (judgement calls)` from the self-review, or "None".
- What is left to the user: review, commit, push, open the PR, merge.

Do not rerank findings across the two axes. The separation exists to stop one axis masking the other.

## Addressing review remarks

Triggered conversationally. The user names a PR. No flow choice applies. This always works the PR's own branch and always commits.

1. Fetch the threads. Inline comments: `gh api repos/{owner}/{repo}/pulls/{n}/comments`. Review summaries: `.../pulls/{n}/reviews`. Conversation comments: `.../issues/{n}/comments`. REST does not expose whether a thread is resolved, so get that from GraphQL `reviewThreads { isResolved }` and work only the unresolved ones.
2. Address each remark on the PR's own branch. Where a remark is a request you disagree with, say so in the reply rather than silently ignoring or silently complying.
3. Re-run gates. Push.
4. Reply in-thread to each remark with what changed. **Do not resolve the threads.** Resolving is the reviewer's signal, not yours.

**Restacking.** If the PR has children stacked on it, changing it invalidates them. Do not restack automatically. Report which downstream branches are now stale; rebase and force-push them only when the user asks.

## Smell baseline

The Standards axis carries this on top of whatever the repo documents. Two rules bind it. **The repo overrides:** a documented standard always wins, and where it endorses something the baseline would flag, suppress the smell. **Every entry is a judgement call**, labelled as a possibility ("possible Feature Envy"), never a hard violation. Skip anything tooling enforces.

- **Mysterious Name.** A function, variable, or type whose name doesn't reveal what it does or holds. Rename it; if no honest name comes, the design is murky.
- **Duplicated Code.** The same logic shape appears in more than one hunk or file in the change. Extract the shared shape, call it from both.
- **Feature Envy.** A method that reaches into another object's data more than its own. Move the method onto the data it envies.
- **Data Clumps.** The same few fields or params keep travelling together, a type wanting to be born. Bundle them into one type, pass that.
- **Primitive Obsession.** A primitive or string standing in for a domain concept that deserves its own type. Give the concept its own small type.
- **Repeated Switches.** The same switch or if-cascade on the same type recurs across the change. Replace with polymorphism, or one map both sites share.
- **Shotgun Surgery.** One logical change forces scattered edits across many files in the diff. Gather what changes together into one module.
- **Divergent Change.** One file or module is edited for several unrelated reasons. Split so each module changes for one reason.
- **Speculative Generality.** Abstraction, parameters, or hooks added for needs the spec doesn't have. Delete it; inline back until a real need shows.
- **Message Chains.** Long `a.b().c().d()` navigation the caller shouldn't depend on. Hide the walk behind one method on the first object.
- **Middle Man.** A class or function that mostly just delegates onward. Cut it, call the real target direct.
- **Refused Bequest.** A subclass or implementer that ignores or overrides most of what it inherits. Drop the inheritance, use composition.

## This skill never

- Merges a PR, or marks the parent PR ready for review.
- Resolves a review thread.
- Closes an issue.
- Sets Priority or applies labels.
- Introduces test infrastructure to a repo that has none.
- Restacks dependent branches without being asked.
- Assumes a flow. Step 1 asks, every run.
- Commits, stages, or pushes in handoff flow.
- Implements more than one unit of work in a handoff run.
- Creates an issue, or a board card, for handoff work that has none.
