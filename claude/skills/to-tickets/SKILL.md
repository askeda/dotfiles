---
name: to-tickets
description: Break a spec into tracer-bullet vertical-slice tickets with blocking edges, publish them as GitHub issues on the repo's project board, and link them back into the spec. Use when the user asks to turn a spec into tickets/issues, slice work into tickets, or plan a feature into a board.
---

# to-tickets

Break a spec into tracer-bullet vertical slices, each declaring the tickets that block it, and publish them as GitHub issues on the current repo's project board.

This skill is generic across projects. It assumes no specific repo, board, or field setup. It infers them from the current project and confirms with the user before publishing.

## 1. Resolve the spec

The user passes a spec path as the argument, e.g. `docs/specs/<module>/<feature-slug>.md`. Read its full body.

If no path is given, do not guess. List what's under `docs/specs/` and ask the user which one to use. Resolving the file is the only thing you may interrupt for. Never interview the user about the feature itself.

## 2. Explore the codebase

Explore the repo to understand the current state before slicing. Match ticket titles and descriptions to the project's existing naming conventions. Look for prefactoring that makes the implementation easier ("make the change easy, then make the easy change") and sequence any prefactor first.

## 3. Draft vertical slices

Break the work into tracer-bullet tickets.

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests). Vertical, never a horizontal slice of one layer.
- A completed slice is demoable or verifiable on its own.
- Each slice is sized to fit in a single fresh context window.
- Any prefactoring is done first.
- Give each ticket its blocking edges, the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception.** A wide refactor is one mechanical change, like renaming a column or retyping a shared symbol, that breaks call sites all over the codebase at once, so no vertical slice can land green. Don't force it into a tracer bullet. Sequence it expand-contract:

- **Expand.** Add the new form beside the old so nothing breaks.
- **Migrate.** Move call sites over in batches sized by how many files each touches (per package, per directory). Each batch is its own ticket blocked by the expand, and CI stays green because the old form still exists.
- **Contract.** Delete the old form once no caller remains, in a ticket blocked by every migrate batch.

## 4. Resolve the publish target

Before publishing, infer where these tickets go:

- **Repo.** The current repository, from `gh` (working directory). No need to ask.
- **Board.** Query the repo's linked projects (`gh project list`). If exactly one, take it as the likely target. If zero or several, that's ambiguous.
- **Fields.** Read the target project's actual fields (`gh project field-list`). Do not assume field names or option values. Find the single-select field that represents workflow status and its "backlog"-equivalent starting option, and the size field and its options, from what the project actually defines.

Present what you inferred: the repo, the board, and the status and size field values you'll use. Get the user's confirmation. If the board was ambiguous, ask which one. Fold this confirmation into the approval step below so the user approves the breakdown and the target together.

## 5. Get approval before publishing

Present the proposed breakdown as a numbered list. For each ticket show the title, what it delivers (the end-to-end behavior it makes work), and what it's blocked by.

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct? Does each ticket depend only on tickets that gate it?
- Should any tickets be merged or split further?

Iterate until the user approves. Do not publish anything before approval.

## 6. Publish to the board

Before creating any issue, run the `unslop` skill on every drafted title and body. Invoke it with the Skill tool and apply its edits. These issues are read by people and cannot be quietly rewritten once published, so they must not read as AI output. The same applies to the `## Tickets` section written in step 7.

Publish the approved tickets as GitHub issues using the `gh` CLI. The shape depends on whether the feature decomposes into more than one slice.

**Single slice.** The feature is one unit of work. Create one issue, where the parent is the ticket. It carries the full work body (What to build, Acceptance criteria, Blocked by). Add it to the board. No children.

**Multiple slices.** Create one parent issue plus one child issue per slice:

- **Parent.** A feature-level container, not a work ticket. Body is a short summary of the feature plus the `Spec:` line. It does not carry What-to-build or Acceptance criteria; the children do. The parent goes on the board.
- **Children.** One per vertical slice, each with the full work body. Attach each as a native sub-issue of the parent (`gh` sub-issue relationship). Create them in dependency order (blockers first) so each child's `Blocked by` line can reference real sibling issue numbers. Children do NOT go on the board. They live inside the parent so the board stays at one card per feature.

Board fields apply to whatever sits on the board, the single-slice ticket or the multi-slice parent:

- Add it to the project board resolved in step 4.
- Set the status field to its starting (backlog-equivalent) option.
- Set the size field based on how much of the codebase the work touches. For a parent, size the whole feature.

Do NOT set priority. Do NOT apply labels. The user sets those by hand when promoting a ticket out of the starting column. Board field writes require `gh` with the `project` scope.

## 7. Link the tickets back into the spec

Once the issues exist, write them into the spec resolved in step 1 so the spec points at the work it produced.

Append a `## Tickets` section as the **last** section of the spec. If the spec already has one, from a re-run or from slices added later, rewrite that section in place instead of appending a second one. Leave every other section untouched.

Use full issue URLs. GitHub autolinks bare `#N` inside issue and PR bodies but not inside repository markdown files, so `#N` alone would render as plain text here.

**Multiple slices.** Parent first, then children in dependency order:

```markdown
## Tickets

Parent: [#70 Crypto tab](https://github.com/<owner>/<repo>/issues/70)

- [#71 Schema and read path](https://github.com/<owner>/<repo>/issues/71)
- [#72 Tab state in the URL](https://github.com/<owner>/<repo>/issues/72)
- [#73 Chart panel](https://github.com/<owner>/<repo>/issues/73)
```

**Single slice.** One line, no parent/child distinction:

```markdown
## Tickets

[#70 Crypto tab](https://github.com/<owner>/<repo>/issues/70)
```

Report the spec path you edited when the run ends. Do not touch any file other than the spec.

## Ticket body template

Used for the work ticket, the single-slice parent or each child in the multi-slice case.

```markdown
Spec: <repo-relative path to the source spec, e.g. docs/specs/<module>/<feature-slug>.md>

## What to build
The end-to-end behavior this ticket makes work, from the user's perspective. Not a layer-by-layer implementation list.

## Acceptance criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by
#N, #N   (or "None" if nothing blocks it)
```

The parent-child link uses GitHub's native sub-issue relationship, not a text reference. In the multi-slice case the parent's body is just a short feature summary plus the `Spec:` line. It omits What to build, Acceptance criteria, and Blocked by.
