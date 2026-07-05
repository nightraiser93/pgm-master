# pgm-master — project instructions

Cross-project dashboard over many `pgm/` folders (a local FastAPI app). It reads a
registry of project roots (`~/.pgm/projects.json`), parses each project's
`pgm/project.md` + `<KEY>-*.md` tickets, and renders a live board with your two
gates (Approve / Mark Working) clickable.

## Read first
- **[`PGM-SPEC.md`](PGM-SPEC.md)** — the canonical pgm standard (status model, gates, change discipline, board.py, worktrees, ticket format). This repo owns the standard.
- **[`skills/pgm/SKILL.md`](skills/pgm/SKILL.md)** — the canonical **agent rules**, shipped as the global `pgm` skill. Symlinked to `~/.claude/skills/pgm/SKILL.md`; it **replaces the per-repo `pgm/CLAUDE.md`** — a consuming repo needs only the `board.py` shim + tickets.
- **[`README.md`](README.md)** — how to run the monitor + the two install symlinks.
- **[`template/pgm/`](template/pgm/)** — the bootstrap kit new projects copy.

## Install (anyone using this repo)
Symlinks make pgm single-source — edit here, live everywhere:
```
ln -s "$PWD/pgm_engine.py" ~/.pgm/pgm_engine.py     # engine
# skills: pgm (rulebook) + pgm-codeit (/pgm-codeit dev-loop driver) + pgm-add-task (/pgm-add-task ticket creator)
for s in "$PWD"/skills/*/; do n=$(basename "$s"); mkdir -p ~/.claude/skills/"$n"; \
  ln -sf "$s/SKILL.md" ~/.claude/skills/"$n"/SKILL.md; done
```

## This app + the engine
- `pgm_engine.py` — **the ONE canonical pgm engine** (project-agnostic). Installed at `~/.pgm/pgm_engine.py` (symlink); every project's `pgm/board.py` is a thin shim delegating here. Change pgm behavior *here* — all projects pick it up, no drift.
- `skills/` — canonical, git-tracked, symlinked into `~/.claude/skills/`:
  - `skills/pgm/SKILL.md` — the **agent-rules doc** (the `pgm` skill; the passive rulebook). Keep in sync with `PGM-SPEC.md`.
  - `skills/pgm-codeit/SKILL.md` — the **`/pgm-codeit` command** (the active driver: read board → pick READY → start→build→review→PR).
  - `skills/pgm-add-task/SKILL.md` — the **`/pgm-add-task` command** (creates ticket(s) from a doc — split into multiple when it warrants — or by interviewing the user).
  - `skills/pgm-address-comments/SKILL.md` — the **`/pgm-address-comments <TICKET_ID>` command** (addresses a human's unresolved review comments on a ticket's own PR: code change + reply where actionable, clarifying question where not; ticket stays In Review, threads never auto-resolved).
- `template/pgm/` — bootstrap kit copied into new projects (shim `board.py`, `CLAUDE.md`, `_TEMPLATE.md`, `project.md`, `README.md`). Contains **no** engine logic.
- `app.py` — FastAPI dashboard. Endpoints: `/`, `/api/projects`, `/api/register`, `/api/unregister`, `/api/action`.
- **Actions shell out to each project's `pgm/board.py`** (the shim → engine) — so per-project keys, gate rules, and audit comments are respected. The monitor never edits tickets directly.
- Runs local, single-user: `uv run python app.py` → http://127.0.0.1:7777 (React UI in `frontend/`, built to `frontend/dist/`).

## Rules for changes here
Follows the pgm change discipline once this repo has its own `pgm/` folder (see PGM-SPEC.md):
every change ↔ a task, branch `<type>/<KEY>-#####-<slug>`, PR carries the task. The pgm
**engine and rules are canonical in this repo** — edit `pgm_engine.py` / `PGM-SPEC.md` /
`skills/pgm/SKILL.md` / `skills/pgm-codeit/SKILL.md` / `skills/pgm-add-task/SKILL.md` / `template/pgm/CLAUDE.md` here; projects
inherit automatically (engine + skills, via symlink) or on next template copy (bootstrap docs).
Edits to the rules should land in **both** `PGM-SPEC.md` and `skills/pgm/SKILL.md` (spec = full
standard, skill = agent-facing subset).

## Git
Global guardrails apply (`~/.claude/CLAUDE.md`): never commit on the default branch — branch first; ask before pushing.
