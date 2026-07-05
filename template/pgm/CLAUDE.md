# pgm — how to work the board

`pgm/` is a **file-based task tracker** (a lightweight Jira). It is portable: the
same rules apply in any project that contains a `pgm/` folder. Read this before
touching tickets.

## The pieces
- `project.md` — project descriptor. Its `key:` is the ticket prefix (e.g. `KAUT`), so tickets are `<KEY>-#####`.
- `<KEY>-#####.md` — one ticket each. **YAML frontmatter is the single source of truth** (`id, title, status, type, epic, depends`).
- `README.md` — the board. Its table is **auto-generated** between `<!-- BOARD:START/END -->`. Never hand-edit it.
- `board.py` — the only sanctioned way to change status. It also regenerates the board.
- `_TEMPLATE.md` — copy for new tickets.

## Status model + two human-only gates
```
Backlog ─(YOU: approve)─▶ Approved ─(Claude: start)─▶ In Progress ─(Claude: review)─▶ In Review ─(YOU: working)─▶ Working
                                          └──────────────── block (Claude, if stuck) ─────────────┘
```
- **Approved** and **Working** are set by the **human only** — the dev gate and the done gate.
- Claude owns the middle: `start`, `review`, and `block`.

## Rules for Claude (important)
1. **One task, one session.** Start every session with `python3 pgm/board.py ready`. Pick **exactly one** task from its READY list and work **only that task** this session (`start → build → review`), then stop. This keeps context small and each task independently reviewable.
2. **Only work tickets that are `Approved`.** Never start a `Backlog` ticket — it hasn't been green-lit. `ready` only ever lists Approved tasks whose dependencies are all done.
3. **Independent tasks → separate sessions, each in its own git worktree.** Everything in the READY list is independent (nothing waits on another). Do **not** batch several into one session — fan them out to separate (parallel) sessions, one task each. Run `python3 pgm/board.py wt <id>` to start a task **and** spin an isolated worktree at `<repo>-worktrees/<branch>/`; work that task there, commit, then `board.py review <id>` (from the main checkout) to open the PR, then `board.py wt rm <id>` once the PR is raised. Worktrees let concurrent sessions build without colliding.
   - **Announce and confirm before going parallel.** Each worktree is a separate Claude session with its **own token budget** — going wide multiplies usage and can exhaust limits. Before creating more than one worktree, tell the user which tasks, how many worktrees + sub-sessions, and that it multiplies token use; then wait for explicit go-ahead. Default: one task at a time.
4. **Never set `Approved` and never set `Working`.** Those are the human's gates. When you finish, move to `In Review` and stop; wait for the human's `working` sign-off.
5. **Change status only via `board.py`** (never hand-edit a `status:` line or the board table). Every transition auto-stamps a dated comment — that is the audit trail.
6. **Blocked?** `board.py block <id> "reason"` and say why in the reason.

## Change discipline — every change ↔ a task (all projects)
No code changes without a ticket. The ticket, the branch, and the PR are one chain.

1. **Task first.** Every change must trace to a `<KEY>-#####`. None exists? Create one (`board.py new "…"`) and get it **Approved** before writing code. No approved ticket → no work.
2. **One branch per task**, named `<type>/<KEY>-#####-<slug>` (gitflow prefix per the global git guardrails). Create it when you `start` the ticket. Example: `feat/KAUT-00003-duckdb-data-layer`.
3. **Commits reference the task** — include `<KEY>-#####` in the message, **or the Jira key** if the ticket has a `jira:` association (`board.py start`/`wt` print the exact ref). The pgm id still owns the branch/board/PR. (Global commit trailer still applies.)
4. **One PR per task.** Open it when you move the ticket to `In Review`:
   - **Title:** conventional + task, e.g. `feat: KAUT-00003 DuckDB + Parquet data layer`.
   - **Body:** the task id/link, its **Intent** and **Acceptance criteria** (from the ticket), **What changed**, **Tests**. Ready (not draft).
5. **Merge + human verify → `working`.** The human's `working` sign-off closes the loop.

So the lifecycle is: `approve` → `start` (branch) → build (commits) → `review` (open PR) → human `working` (merge/verify).

## Commands
```
python3 pgm/board.py                     # regenerate the board
python3 pgm/board.py ready               # workable tasks now (Approved, deps done) — pick ONE
python3 pgm/board.py wt <id>             # start <id> + isolated git worktree (parallel work)
python3 pgm/board.py wt rm <id>          # remove <id>'s worktree (after its PR is raised)
python3 pgm/board.py wt ls               # list this repo's pgm worktrees
python3 pgm/board.py start   <id> [msg]  # Approved -> In Progress   (Claude)
python3 pgm/board.py review  <id> [msg]  # In Progress -> In Review   (Claude)
python3 pgm/board.py block   <id> "why"  # -> Blocked                 (Claude)
python3 pgm/board.py approve <id> [msg]  # Backlog/Blocked -> Approved (HUMAN)
python3 pgm/board.py working <id> [msg]  # In Review -> Working        (HUMAN)
python3 pgm/board.py reopen  <id> [msg]  # Working/In Review -> In Progress (HUMAN)
python3 pgm/board.py new "title" [epic]  # scaffold the next <KEY>-##### ticket
python3 pgm/board.py jira    <id> <KEY>   # associate a Jira issue ("-"/"clear" removes)
```
`<id>` accepts `1`, `00001`, or `<KEY>-00001`. `board.py` refuses illegal jumps (you can't skip a gate).

## Writing tickets
- One ticket = one **vertical slice** (end-to-end value where possible).
- Keep frontmatter accurate; the board derives from it.
- Log meaningful decisions in the ticket's `## Comments` (transitions log themselves).
