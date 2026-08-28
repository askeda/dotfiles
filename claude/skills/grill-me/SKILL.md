---
name: grill-me
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map the problem as a **design tree**, where every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled, the questions you can ask _now_ without guessing at answers you haven't heard yet.

Open every round with titles only. List the whole frontier as numbered one-line titles, no bodies and no recommended answers. The user reads the shape of the round and drops whatever doesn't matter. Wait for the user to approve or prune that list before you ask anything.

```
Round 1
1. <question title>
2. <question title>
```

Once the set is agreed, ask those questions one at a time. Ask one, wait for its answer, then ask the next. Number each question to match its title in the round list, so the user can see where they are. Never post two questions in the same message.

Ask each question like so:

```
🔍 **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

💡 <your recommended answer>
```

Every round of answers reshapes the tree. Settled decisions push the frontier outward and unblock the questions that depended on them. When the round's agreed set is exhausted, recompute the frontier and open the next round with its own title list, then work that one question at a time too. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it. Don't ask the user for anything you could look up yourself. Don't block on it either. A running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report. Move on to the next question in the round now.

The _decisions_ are the user's, so put each to them and wait. The session ends when the frontier is empty, meaning you have visited every branch of the design tree and made no silent assumptions. Do not act until the user confirms you have reached a shared understanding.
