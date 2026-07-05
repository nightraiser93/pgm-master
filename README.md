# pgm-master

**pgm — Project God Mode.** Cross-project dashboard over many `pgm/` folders. One place to
watch every project's board, approve tickets, and sign off finished work.

## How it works
- **Registry:** `~/.pgm/projects.json` — a list of project root paths.
- Each project root must contain `pgm/project.md` (with a `key:`) + `<KEY>-*.md` tickets.
- The monitor parses each project's frontmatter live and renders per-project cards:
  status counts, a **Backlog → approve** queue, and an **Awaiting your sign-off** (In Review) queue.
- **Actions** (`Approve`, `Mark Working`) shell out to that project's own `pgm/board.py`,
  so per-project keys, gate rules, and audit comments are respected.

## Install (once per machine)
pgm is single-source in **this** repo: the engine (logic) and the `pgm` skill (agent rules).
Symlink both into place — then every project inherits changes with no per-repo copies:
```
# 1) engine — projects' pgm/board.py shims delegate here
ln -s "$PWD/pgm_engine.py" ~/.pgm/pgm_engine.py

# 2) skills — agent rules + the /pgm-codeit driver (replaces per-repo pgm/CLAUDE.md)
for s in "$PWD"/skills/*/; do n=$(basename "$s"); mkdir -p ~/.claude/skills/"$n"; \
  ln -sf "$s/SKILL.md" ~/.claude/skills/"$n"/SKILL.md; done
```
Skills installed: **`pgm`** (the rulebook — status gates, one-task-one-session, worktrees),
**`pgm-codeit`** (invoke `/pgm-codeit` in any repo to drive the dev loop: read board → pick a READY
task → start → build → review → PR), **`pgm-add-task`** (invoke `/pgm-add-task` to create
ticket(s) — from a doc, splitting it into multiple tasks when it warrants that, or by interviewing
you when there's no doc), and **`pgm-address-comments`** (invoke `/pgm-address-comments <TICKET_ID>`
to address a human's unresolved review comments on that ticket's own PR — code change + reply where
actionable, clarifying question where not; ticket stays In Review). A consuming repo then needs only the tiny `board.py` shim + its
tickets — **no** copied `pgm/CLAUDE.md`.

## Run
Uses [uv](https://docs.astral.sh/uv/). Deps live in `pyproject.toml`; the React UI builds to `frontend/dist/`.
```
cd frontend && npm install && npm run build && cd ..   # build the dashboard UI (once / after UI changes)
uv run python app.py                                    # -> http://127.0.0.1:7777
```
UI dev with hot reload: `uv run python app.py` + `cd frontend && npm run dev` (Vite on :5173, proxies `/api`).

## Connect a project
- In the UI: paste the project root path → **Connect folder**.
- Or edit `~/.pgm/projects.json` directly.

A project shows up iff `<root>/pgm/project.md` exists.

## Telegram notifications (optional)
Get pinged when a task's PR is raised (`review`) or it's marked done (`working`), with a summary +
PR link. One-command setup — just needs a bot token from [@BotFather](https://t.me/BotFather):
```
python3 pgm/board.py notify-setup     # prompts for token, auto-detects chat id, writes config, tests
```
Then it just works from every pgm repo. Manual/env-var alternative + details in
[`PGM-SPEC.md`](PGM-SPEC.md#notifications-optional--telegram). Silent/best-effort if unset; `PGM_NOTIFY=0` mutes.

## Notes
- Read-mostly + your two gates (approve/working). Claude's mid-flow transitions
  (start/review/block) stay in the terminal via `board.py`.
- Local, single-user tool; it executes each registered project's `board.py`.
- Auto-refreshes every 5s.
