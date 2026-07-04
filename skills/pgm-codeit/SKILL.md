---
name: pgm-codeit
description: Drive the pgm development loop in the current repo — read the board, pick a READY task, and take it start→build→review→PR. Use when the user runs /pgm-codeit, or says "work the board", "code the next task", "pick up pgm work", "build the next ticket", or "pgm codeit".
---

# pgm-codeit — drive the board

Invokable action command. Runs the pgm dev loop **in the current repo**. Follow the pgm rules from
the `pgm` skill (status gates, one task = one session, one branch + one PR, worktrees). This command
is the *driver*; the `pgm` skill is the *rulebook*.

`ARGUMENTS` may carry: a task id (`KAUT-00003` → work that one), a count or `parallel N`
(fan out N tasks — requires the confirm step below), or nothing (pick one READY task).

## Procedure
1. **Locate the board.** Confirm `pgm/` exists here. If not, stop and offer to bootstrap
   (`cp -r <pgm-master>/template/pgm ./pgm`, then set `key`/`name` in `pgm/project.md`).
2. **Read readiness:** run `python3 pgm/board.py ready`. Three outcomes:
   - **Nothing to work on** (board clear — no READY, nothing WAITING, nothing in Backlog) → say so
     plainly: *"Nothing to work on — the board is clear (all tasks done or none exist)."* Then stop.
   - **No READY but there's WAITING / NEEDS APPROVAL** → report them. You **cannot** approve (human
     gate) — tell the user which Backlog tickets to approve (or that everything is blocked on open
     deps), then stop.
   - **READY tasks exist** → continue.
3. **Choose the task(s).**
   - Id in `ARGUMENTS` → that one (must be in READY).
   - Else default to **exactly one** (the first READY, or ask which if ambiguous).
   - **Parallel only on explicit opt-in.** If the user asked for >1 (a count / "parallel"), FIRST
     **announce and get a yes**: which tasks, how many worktrees + concurrent sub-sessions, and that
     each is a separate token budget (**multiplies token use**). Never exceed the agreed count.
4. **Start + isolate:** `python3 pgm/board.py wt <id>` — moves it `Approved → In Progress` and makes
   a git worktree at `<repo>-worktrees/<branch>/`. `cd` into that worktree.
5. **Build the task, and only that task.** Read the ticket's Intent + Acceptance criteria. Implement,
   test, commit on its branch with the `<KEY>-#####` in the message. Keep context tight.
6. **PR, then review:** from the **main checkout**, open the PR first with `gh pr create` — ready (not
   draft), conventional title with the id, body = Intent + Acceptance criteria + What changed + Tests.
   Capture the PR URL, then `python3 pgm/board.py review <id> "<pr-url>"` — this moves it to `In Review`
   **and** fires the Telegram notification (summary + link) if notifications are configured.
7. **Clean up + stop:** once the PR is raised, `python3 pgm/board.py wt rm <id>` (branch kept). Then
   **stop at `In Review`** — never self-`approve`, never self-`working`. Report the PR link + status.

## For each parallel task (only if opted in)
Repeat steps 4–7 per task, each in its **own worktree and its own session** — do not interleave two
tasks in one session. `board.py wt ls` shows active worktrees.

## Guardrails
- One task = one session; one branch + one PR per task; status only via `board.py`.
- Blocked mid-task → `python3 pgm/board.py block <id> "reason"` and report why.
- Never touch a `Backlog` ticket (not green-lit) or set the human gates (`approve`, `working`).
