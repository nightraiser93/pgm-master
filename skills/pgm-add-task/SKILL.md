---
name: pgm-add-task
description: Create one or more pgm tickets — from a markdown doc (splitting it into multiple tasks when it describes more than one), or interactively by interviewing the user when no doc is given. Use when the user runs /pgm-add-task, or says "add a task", "create a ticket", "file this as a pgm task", or hands over a spec/doc to turn into tickets.
---

# pgm-add-task — create tickets from a doc or an interview

Invokable action command. Creates ticket(s) in the current repo's `pgm/` board via
`board.py new`, then fills in the body (Intent, Acceptance criteria, Subtasks, Slice value)
and frontmatter (`type`, `epic`, `depends`) that `new` doesn't set. Follow the `pgm` skill's
rules — this command only ever touches `Backlog` tickets it just created; it never changes status.

`ARGUMENTS` may carry: a path to a markdown file to source the task(s) from, or nothing (go interactive).

## Procedure

1. **Locate the board.** Confirm `pgm/` exists in the current repo. If not, stop and offer to
   bootstrap it (`cp -r <pgm-master>/template/pgm ./pgm`, then set `key`/`name` in `pgm/project.md`).
2. **Read existing tickets for context**: current epics (`grep -h '^epic:' pgm/*.md`) and the
   highest existing id, so proposed epics/depends make sense against what's already there.

### Path A — doc given
3. Read the file at the given path.
4. **Decide split vs. single**: does the doc describe more than one independently shippable
   piece of work (multiple headings/sections each with their own scope, a numbered feature
   list, distinct components)? If yes, propose splitting into N tickets; if it's one cohesive
   change, propose a single ticket. State the proposed breakdown (titles + one-line scope each)
   and **ask the user to confirm or adjust** before creating anything — use AskUserQuestion if
   the split is ambiguous.
5. For each proposed ticket, draft: title, type (feature/fix/chore/docs/refactor), epic, slice
   value, Intent, Acceptance criteria, Subtasks — pulled from the doc's content, not invented.
   If the doc leaves something material unclear (e.g. no acceptance criteria stated), ask the
   user rather than guessing.
6. If tickets depend on each other (doc implies an order, e.g. "step 2 needs step 1"), note the
   dependency to wire in step 8.

### Path B — no doc
3. Interview the user. Ask for the essentials one round at a time, inferring what you can from
   repo context instead of asking:
   - **Title + one-line description** (what and why) — free text.
   - **Type**: feature/fix/chore/docs/refactor — use AskUserQuestion.
   - **Epic**: show existing epics found in step 2 plus "new epic" — use AskUserQuestion.
   - **Slice value**: the end-to-end value this delivers — ask if not obvious from the description.
   - **Acceptance criteria**: 1+ observable/testable outcomes — ask explicitly, don't invent.
   - **Depends on**: any existing ticket id this waits on — ask only if the description suggests
     an ordering dependency; otherwise skip (default `[]`).
   Don't ask about things you can derive (e.g. don't ask "which repo" — you're already in it).

### Create + fill in (both paths)
7. For each ticket, run `python3 pgm/board.py new "<title>" "<epic>"` from the repo root. It
   scaffolds `<KEY>-#####.md` in `Backlog` with `type: feature` and `depends: []` and regenerates
   the board.
8. Edit the new file directly to set the real `type:` and `depends:` in frontmatter (if not
   `feature` / `[]`), and fill in the body: **Slice value**, **Intent**, **Acceptance criteria**
   (checklist), **Subtasks** (checklist, if known). This is content editing, not a status
   transition — fine to hand-edit per the `pgm` skill's rules (only status/board-table are off
   limits). Re-run `python3 pgm/board.py` after editing frontmatter so the board reflects `type`/`depends`.
9. For cross-ticket ordering among tasks created in this same run, set `depends: [00003]` etc.
   directly in frontmatter (same-project ids) rather than via `link` (which is for cross-project
   or non-blocking relations).
10. **Report back**: list the created `<KEY>-#####` ids with titles, and remind the user they're
    in `Backlog` — they need `board.py approve <id>` before any agent can `start` them.

## Guardrails
- Never invent acceptance criteria or scope not present in the doc / the user's answers — ask.
- Never set `status` to anything but the `new` default (`Backlog`); never call `approve`/`start`.
- One doc → as many tickets as it genuinely contains; don't split a cohesive change just to pad the board.
- If unsure whether to split, ask — don't guess silently.
