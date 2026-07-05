# pgm — the standard

Canonical spec for the file-based task system used across all projects. Each project
carries a `pgm/` folder; **pgm-master** aggregates them. This file is the source of
truth — a project's `pgm/CLAUDE.md` is a copy of these rules for the agent.

## What a `pgm/` folder contains
| File | Role |
|------|------|
| `project.md` | Project descriptor. Frontmatter `key:` is the **ticket prefix** (e.g. `KAUT`). Also `name`, `status`. The monitor reads this. |
| `<KEY>-#####.md` | One ticket each. **YAML frontmatter is the single source of truth** (`id, title, status, type, epic, depends`; optional `jira`). Body: Slice value, Intent, Acceptance criteria, Subtasks, Comments. |
| `README.md` | The board. Table auto-generated between `<!-- BOARD:START/END -->`. Never hand-edited. |
| `board.py` | **Thin shim** (~15 lines). Points the shared engine at this folder (`PGM_DIR`) and execs it. Only sanctioned way to change status; regenerates the board. Same `python3 pgm/board.py …` CLI everywhere. |
| `_TEMPLATE.md` | Copy for new tickets. |
| `CLAUDE.md` | Agent rules (copy of the relevant parts of this spec). |

**The engine is single-source, not copied.** `pgm-master/pgm_engine.py` is canonical, installed at the stable `~/.pgm/pgm_engine.py`. Every project's `pgm/board.py` is a tiny shim that delegates to it — so there is one engine, zero drift. Change behavior once (in `pgm_engine.py`); every project picks it up. `board.py` reads the ticket prefix (KEY) from `project.md`, so the engine stays project-agnostic.

## Status model + two human-only gates
```
Backlog ─(YOU: approve)─▶ Approved ─(Claude: start)─▶ In Progress ─(Claude: review)─▶ In Review ─(YOU: working)─▶ Working
                                          └──────────────── block (Claude, if stuck) ─────────────┘
```
- **Approved** (dev gate) and **Working** (done gate) are set by the **human only**.
- The agent owns the middle: `start`, `review`, `block`. It never self-approves and never self-marks Working — it stops at `In Review` and waits.

## Change discipline — every change ↔ a task
1. **No code without a task.** Every change traces to a `<KEY>-#####`; none exists → `board.py new` and get it **Approved** first.
2. **One branch per task:** `<type>/<KEY>-#####-<slug>` (gitflow prefix), created at `start`. `board.py start` prints it.
3. **Commits reference** the `<KEY>-#####` — **unless** the ticket has an associated Jira issue (`jira:` in frontmatter), in which case commits reference the **Jira key** instead. The pgm id always owns the branch, board, and PR; Jira just rides the commit trail. `board.py start`/`wt` print the exact ref to use.
4. **One PR per task**, opened at `review`: conventional title with the id; body carries the ticket's Intent + Acceptance criteria + What changed + Tests. Ready, not draft.
5. **Merge + human `working`** closes the loop.

Lifecycle: `approve → start (branch) → commits → review (PR) → human working (merge/verify)`.

## board.py commands
```
python3 pgm/board.py                     # regenerate the board
python3 pgm/board.py new "title" [epic]  # scaffold next <KEY>-##### (Backlog)
python3 pgm/board.py approve <id> [msg]  # Backlog/Blocked -> Approved     (HUMAN)
python3 pgm/board.py start   <id> [msg]  # Approved -> In Progress          (Claude)
python3 pgm/board.py review  <id> [msg]  # In Progress -> In Review         (Claude)
python3 pgm/board.py working <id> [msg]  # In Review -> Working             (HUMAN)
python3 pgm/board.py block   <id> "why"  # -> Blocked                       (Claude)
python3 pgm/board.py reopen  <id> [msg]  # Working/In Review -> In Progress (HUMAN)
python3 pgm/board.py link    <id> <rel> <target> [note]  # add a cross-task link
python3 pgm/board.py unlink  <id> <target>               # remove a link
python3 pgm/board.py jira    <id> <JIRA-KEY>             # associate a Jira issue ("-"/"clear" removes)
python3 pgm/board.py ready                               # workable tasks (Approved, deps done)
python3 pgm/board.py wt <id>                             # start <id> + isolated git worktree
python3 pgm/board.py wt rm <id>                          # remove <id>'s worktree (after PR raised)
python3 pgm/board.py wt ls                               # list this repo's pgm worktrees
```
`<id>` = `1`, `00001`, or `<KEY>-00001`. Illegal jumps are refused (can't skip a gate). Every transition stamps a dated comment (the audit trail).

## One task, one session
The agent works **one task per session** — in every pgm project, not just here. This keeps
each session's context small (cheaper, fewer usage-limit hits) and each task independently
reviewable.
- **Start every session with `board.py ready`.** It computes the workable set: tasks that are
  `Approved` **and** have every dependency done (a dep is done when it reaches **Working**).
  A dependency is any `depends:` id or a `blocked-by`/`depends-on` link.
- **Pick exactly one READY task; do only that task this session** (`start → build → review`), then stop.
- **READY tasks are independent** — none waits on another. Fan them out to **separate parallel
  sessions**, one task each. Never batch several tasks into one session.
- `ready` also prints a copy-paste **session prompt** per task, and lists what's `WAITING` on open
  deps and what still `NEEDS YOUR APPROVAL` (Backlog).

### Parallel work — one worktree per task
**Announce and confirm before going parallel.** Each parallel worktree is a separate Claude session
with its **own token budget** — fanning out multiplies usage and can exhaust limits. Before creating
more than one worktree the agent must state up front **which** tasks, **how many** worktrees +
concurrent sub-sessions, and that it **multiplies token use**, then wait for the user's explicit
go-ahead. Default is one task at a time; fan out only on opt-in, never beyond what was agreed.

Independent READY tasks then run **simultaneously** without stepping on each other, each in its own
**git worktree** (isolated checkout + branch). Same flow in every repo:
1. **`board.py wt <id>`** — starts the task (`Approved → In Progress`) and creates a git worktree at
   `<repo>-worktrees/<branch>/` on the task's branch `<type>/<KEY>-#####-<slug>`. Run one per READY task.
2. **Work each task in its own worktree**, one session each — commit on that branch. Trees never collide.
3. **`board.py review <id>`** — moves to `In Review` and opens the PR. Run status commands from the
   **main checkout** (the board + tickets live there); the worktree is for code only.
4. **`board.py wt rm <id>`** — once the PR is raised, drop the worktree. The branch is kept (the PR needs it).
- `wt ls` lists active worktrees. `wt rm … --force` discards uncommitted changes in a worktree.

## Task links (same-project or cross-project)
Relate tickets to one another — including tickets in **other projects** — via `board.py link`.
- **Relations:** `blocked-by`, `blocks`, `relates-to`, `duplicates`, `depends-on`.
- **`<target>`** = a same-project id (`00003`) **or an absolute path** to another project's ticket `.md`. Same-project ids resolve to their absolute path automatically.
- Stored in `links:` frontmatter as `<rel>:<abs-path>`; each link stamps a dated comment. `unlink <id> <target>` removes it.

## Ticket frontmatter
```yaml
---
id: KAUT-00003
title: DuckDB + Parquet data layer
status: Backlog          # Backlog|Approved|In Progress|Blocked|In Review|Working
type: feature            # feature|fix|chore|docs|refactor
epic: E1 Foundation
depends: [00002]         # same-project ordering (by number)
links: [blocked-by:/abs/path/other-proj/pgm/AAA-00007.md, relates-to:00004]  # optional, cross-project ok
jira: PROJ-1234          # optional — associate a Jira issue; commits reference this instead of the pgm id
pr: https://github.com/org/repo/pull/123   # auto-set by `board.py review <id> "<pr-url>"`; omitted until then
---
```
The pgm `id` is always the task's identity here (branch, board, PR). `jira` is an **optional
association** for teams that also track the work in Jira — set it with `board.py jira <id> <KEY>`.
When present, the board and the monitor show it, and **commit messages reference the Jira key
instead of the `<KEY>-#####`**. Add `jira_base: https://your.atlassian.net` to `project.md` to make
the monitor's Jira badges clickable (`<jira_base>/browse/<KEY>`).

`pr` is written automatically the moment a PR url is passed to `board.py review <id> "<pr-url>"` —
no extra step. If no url is passed, the field is simply omitted (never written blank).

## Notifications (optional — Telegram)
The engine can ping you on Telegram when a task reaches a gate: **`review`** (PR raised — ready for
your review) and **`working`** (done). The message is a summary built from the ticket — project,
`<KEY>-#####`, title, epic, status change, the Intent, and the PR URL if one is passed to the command.
Stdlib only; disabled and silent until you configure creds.

Setup (once) — easiest is the interactive command:
```
python3 pgm/board.py notify-setup     # prompts for the bot token, auto-detects your chat id, tests
```
It only needs a bot token: create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy
the token; `notify-setup` handles the rest (validates it, tells you to message the bot, reads your
chat id, writes `~/.pgm/telegram.json` @ `600`, sends a test). Manual alternative — configure creds
**outside** any repo yourself:
```
printf '{"bot_token":"<TOKEN>","chat_id":"<CHAT_ID>"}' > ~/.pgm/telegram.json
# or: export TELEGRAM_BOT_TOKEN=<TOKEN> TELEGRAM_CHAT_ID=<CHAT_ID>
# chat id: message the bot, then read result[].message.chat.id from
#   https://api.telegram.org/bot<TOKEN>/getUpdates
```
- Verify anytime: `board.py notify-test`. Pass the PR URL so the ping links it:
  `board.py review <id> "<pr-url>"` (`/pgm-codeit` does this).
- Best-effort: if creds are absent or the send fails, the transition still succeeds. Set `PGM_NOTIFY=0` to mute.

## Conventions
- One ticket = one **vertical slice** (end-to-end value where possible).
- Frontmatter is authoritative; the board derives from it. Change status only via `board.py`.
- Log meaningful decisions in `## Comments` (transitions log themselves).

## Install (once per machine)
Symlink the canonical engine to the stable path the shims look for, and the canonical agent-rules
skill into your personal skills dir — both single-source, edited in this repo, live everywhere:
```
ln -s /path/to/pgm-master/pgm_engine.py  ~/.pgm/pgm_engine.py     # engine (or set $PGM_ENGINE)
# skills: pgm (rulebook) + pgm-codeit (the /pgm-codeit dev-loop driver) + pgm-add-task (the /pgm-add-task ticket creator)
for s in /path/to/pgm-master/skills/*/; do n=$(basename "$s"); mkdir -p ~/.claude/skills/"$n"; \
  ln -sf "$s/SKILL.md" ~/.claude/skills/"$n"/SKILL.md; done
```
The **`pgm`** skill tells the agent how to work any repo's board; **`pgm-codeit`** is an invokable
command (`/pgm-codeit`) that drives the loop (read board → pick a READY task → start→build→review→PR);
**`pgm-add-task`** is an invokable command (`/pgm-add-task`) that creates ticket(s) — from a doc,
splitting it into multiple tasks when it warrants that, or by interviewing the user when there's no doc.
So a repo needs only the tiny `board.py` shim + tickets, never a copied `pgm/CLAUDE.md`.

## Bootstrapping a new project
```
cp -r pgm-master/template/pgm  <project>/pgm     # tickets folder + shim + docs
# edit <project>/pgm/project.md: set key + name
python3 <project>/pgm/board.py                     # renders the (empty) board
```
Then register the project root in the monitor (`~/.pgm/projects.json`, or via its UI).
The copied `board.py` is just the shim — no engine logic travels with it.
