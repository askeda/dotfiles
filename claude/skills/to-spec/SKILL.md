---
name: to-spec
description: Turn the current conversation into a technical spec file under specs/. Use when the user asks to write up, spec out, or capture what was discussed as a spec document. Synthesizes the existing conversation plus the real codebase; never interviews the user.
---

# to-spec

Turn the current conversation into a technical spec file. Do NOT interview the user. Synthesize what has already been discussed in this conversation, grounded in the actual codebase.

## Where the file goes

Write the spec under a `specs/` folder at the repo root.

Explore the repo to understand how it groups work. If the project organizes code into modules (e.g. a `modules/`, `features/`, or `domains/` folder, or clear top-level feature directories) and you are confident the feature belongs to one of them, write to `specs/<module>/<feature-slug>.md`.

If you are not confident a module fits, or the project is flat, write a flat file at `specs/<feature-slug>.md`.

`<feature-slug>` is a short kebab-case name for the feature 

## Behavior

- **No interview.** Never ask the user questions while running. Synthesize only from the conversation and the codebase.
- **Surface uncertainty, don't invent.** When the conversation didn't settle something, or you had to assume, do not paper over it with a confident answer. Record it in the "Open questions & assumptions" section instead.
- **Explore the repo first** so implementation and verification details reflect the real codebase, not guesses.

## Spec template

Write the file with these sections, in this order:

### Problem

The problem being solved, from the user's perspective.

### Solution

The approach landed on during the conversation, from the user's perspective.

### Behavior

What the feature actually does.

### Implementation decisions

Decisions made during the conversation: modules built or modified, interfaces changed, schema changes, API contracts, architectural calls, specific interactions.

### Verification

How to prove the feature works.

- **Automated gates** (always include): running the test suite, typecheck, lint, and a passing build. Name the actual project commands where known.
- **Manual QA checklist** (include only when the feature warrants human verification, e.g. UI work): concrete steps to perform and what to look for.

### Open questions & assumptions

Anything the conversation left unsettled, and any assumption made while writing the spec. This is where uncertainty goes instead of being invented away.

### Notes

Anything else worth recording.
