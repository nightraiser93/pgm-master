---
name: pgm
description: Working rules for the pgm file-based task board (a lightweight Jira in a repo's pgm/ folder). Use whenever the repo has a pgm/ folder, when asked to pick up work / "what's next" / start a task, or when tickets, the board, board.py, approve/start/review/working/block, or <KEY>-##### ids come up. Replaces the per-repo pgm/CLAUDE.md.
---

# pgm — how to work the board

`pgm/` is a file-based task tracker, portable across every project. Same rules everywhere.
Frontmatter in each `<KEY>-#####.md` is the single source of truth; the board (`README.md`
table between `<!-- BOARD:START/END -->`) is auto-generated. **Never hand-edit status or the
board table** — change status only via `python3 pgm/board.py`. Canonical spec:
`~/Documents/pgm-master/PGM-SPEC.md`.

## Status model + two human-only gates
```
Backlog ─(YOU: approve)─▶ Approved ─(Claude: start)─▶ In Progress ─(Claude: review)─▶ In Review ─(YOU: working)─▶ Working
                                     └──────────── block (Claude, if stuck) ───────────┘
```
- **Approved** (dev gate) and **Working** (done gate) are **human-only**. Never self-approve, never self-mark Working.
- Claude owns the middle: `start`, `review`, `block`. Finish → move to `In Review` and **stop**; wait for the human's `working`.

## One task, one session (important)
1. **Start every session with `python3 pgm/board.py ready`.** It lists the workable set:
   tasks that are `Approved` **and** have every dependency done (a dep is done at **Working**).
2. **Pick exactly one READY task. Work only that task this session** (`start → build → review`), then stop.
   Keeps context small — cheaper, fewer usage-limit hits, independently reviewable.
3. **READY tasks are independent** (none waits on another). Fan them out to **separate sessions**,
   one task each — never batch several tasks into one session. `ready` prints a copy-paste session prompt per task.
4. Only ever work `Approved` tickets. `ready` also shows what's WAITING on open deps and what NEEDS YOUR APPROVAL (Backlog).

## Parallel work — one worktree per task
**Announce and confirm before going parallel — mandatory.** Spinning up worktrees means running
several Claude sessions at once, and **each session has its own token budget** — going wide
multiplies token/usage burn and can exhaust limits fast. Before creating more than one worktree,
state up front in plain terms: **which** READY tasks you'll take, **how many** worktrees +
concurrent sub-sessions that spawns, and that it **multiplies token use**. Then **wait for the
user's explicit go-ahead**. Default to **one task at a time**; only fan out when the user opts in,
and never spawn more worktrees than they agreed to.

When you do go parallel, each task runs in its own **git worktree** (isolated checkout + branch)
so concurrent sessions never collide:
1. **`python3 pgm/board.py wt <id>`** — starts the task (`Approved → In Progress`) and creates a
   worktree at `<repo>-worktrees/<branch>/`. Do this once per READY task you want to run in parallel.
2. **cd into the worktree; do that task only, in its own session**; commit on its branch.
3. **`python3 pgm/board.py review <id>`** — In Review + open the PR. Run status/board commands from
   the **main checkout** (tickets + board live there); the worktree is code-only.
4. **`python3 pgm/board.py wt rm <id>`** — after the PR is raised, drop the worktree (branch is kept).

## Change discipline — every change ↔ a task
No code without a ticket. Ticket → branch → PR are one chain.
1. **Task first.** Every change traces to a `<KEY>-#####`. None exists? `board.py new "…"` and get it **Approved** first.
2. **One branch per task:** `<type>/<KEY>-#####-<slug>` (gitflow prefix), created at `start` (`board.py start` prints it).
3. **Commits reference** the `<KEY>-#####`.
4. **One PR per task**, opened at `review`: conventional title with the id; body = Intent + Acceptance criteria + What changed + Tests. Ready, not draft.
5. **Merge + human `working`** closes the loop.

## Commands
```
python3 pgm/board.py                     # regenerate the board
python3 pgm/board.py ready               # workable tasks now (Approved, deps done) — pick ONE
python3 pgm/board.py wt <id>             # start <id> + isolated git worktree (parallel work)
python3 pgm/board.py wt rm <id>          # remove <id>'s worktree (after its PR is raised)
python3 pgm/board.py wt ls               # list this repo's pgm worktrees
python3 pgm/board.py start   <id> [msg]  # Approved -> In Progress          (Claude)
python3 pgm/board.py review  <id> [msg]  # In Progress -> In Review          (Claude)
python3 pgm/board.py block   <id> "why"  # -> Blocked                        (Claude)
python3 pgm/board.py approve <id> [msg]  # Backlog/Blocked -> Approved       (HUMAN)
python3 pgm/board.py working <id> [msg]  # In Review -> Working              (HUMAN)
python3 pgm/board.py reopen  <id> [msg]  # Working/In Review -> In Progress  (HUMAN)
python3 pgm/board.py new "title" [epic]  # scaffold next <KEY>-##### (Backlog)
python3 pgm/board.py link   <id> <rel> <target> [note]   # blocked-by|blocks|relates-to|duplicates|depends-on
python3 pgm/board.py unlink <id> <target>
```
`<id>` accepts `1`, `00001`, or `<KEY>-00001`. Illegal jumps are refused (can't skip a gate).
Every transition auto-stamps a dated comment — that's the audit trail. Dependencies live in
`depends: [00002]` (same-project) or `links:` (`blocked-by`/`depends-on`, cross-project ok).

## Writing tickets
One ticket = one **vertical slice** (end-to-end value where possible). Keep frontmatter accurate;
log meaningful decisions in the ticket's `## Comments` (transitions log themselves).
