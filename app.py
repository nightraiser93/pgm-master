#!/usr/bin/env python3
"""pgm-master — cross-project dashboard over many `pgm/` folders.

Reads a registry of project roots (~/.pgm/projects.json), parses each
`<root>/pgm/project.md` (key, name) + its `<KEY>-*.md` tickets, and serves a
live dashboard. Your gates (approve / working) are clickable — they shell out
to that project's own `pgm/board.py`, so per-project keys + audit comments are
respected.

Run:  uvicorn app:app --reload --port 7777      (or: python3 app.py)
"""
from __future__ import annotations
import json, re, subprocess, sys, pathlib
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

REG = pathlib.Path.home() / ".pgm" / "projects.json"
DIST = pathlib.Path(__file__).parent / "frontend" / "dist"
STATUS_ORDER = ["Backlog", "Approved", "In Progress", "Blocked", "In Review", "Working"]
ACTIONS = {"approve", "start", "review", "working", "block", "reopen"}
app = FastAPI(title="pgm-master")

# Dev: Vite dev server (5173) calls the API cross-origin. Prod serves dist/ same-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- registry ----------
def load_registry() -> list[str]:
    if REG.exists():
        return json.loads(REG.read_text())
    return []

def save_registry(paths: list[str]):
    REG.parent.mkdir(parents=True, exist_ok=True)
    REG.write_text(json.dumps(sorted(set(paths)), indent=2))

# ---------- frontmatter ----------
def parse_fm(text: str) -> dict:
    if not text.startswith("---\n"):
        return {}
    end = text.index("\n---", 4)
    fm = {}
    for line in text[4:end].splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        v = v.strip()
        if v.startswith("[") and v.endswith("]"):
            v = [x.strip() for x in v[1:-1].split(",") if x.strip()]
        fm[k.strip()] = v
    return fm

def parse_body(text: str) -> str:
    """Markdown body after the closing frontmatter `---` (the description)."""
    if not text.startswith("---\n"):
        return text.strip()
    try:
        end = text.index("\n---", 4)
    except ValueError:
        return ""
    rest = text[end + 4:]
    if rest.startswith("\n"):
        rest = rest[1:]
    return rest.strip()

def read_project(root: str) -> dict | None:
    pgm = pathlib.Path(root) / "pgm"
    pm = pgm / "project.md"
    if not pgm.is_dir() or not pm.exists():
        return None
    meta = parse_fm(pm.read_text())
    key = meta.get("key", "TASK")
    tickets = []
    for f in sorted(pgm.glob(f"{key}-*.md")):
        raw = f.read_text()
        fm = parse_fm(raw)
        if not fm:
            continue
        tickets.append({"id": fm.get("id", f.stem), "title": fm.get("title", ""),
                        "epic": fm.get("epic", ""), "status": fm.get("status", "Backlog"),
                        "depends": fm.get("depends", []),
                        "jira": (fm.get("jira") or "").strip(), "desc": parse_body(raw)})
    counts = {s: 0 for s in STATUS_ORDER}
    for t in tickets:
        counts[t["status"]] = counts.get(t["status"], 0) + 1
    return {"root": root, "key": key, "name": meta.get("name", key),
            "status": meta.get("status", ""),
            "jira_base": (meta.get("jira_base") or "").strip().rstrip("/"),
            "counts": counts, "tickets": tickets}

def all_projects() -> list[dict]:
    out = []
    for root in load_registry():
        p = read_project(root)
        out.append(p if p else {"root": root, "key": "?", "name": root,
                                 "error": "no pgm/project.md", "tickets": [], "counts": {}})
    return out

# ---------- live agent sessions ----------
def match_project(cwd: str, projects: list[dict]) -> dict | None:
    """Which registered project a session's cwd belongs to — either the repo
    itself or one of its `<repo>-worktrees/<branch>` checkouts."""
    for p in projects:
        root = pathlib.Path(p["root"])
        if cwd == str(root) or cwd.startswith(str(root) + "/"):
            return p
        wt_base = root.parent / f"{root.name}-worktrees"
        if cwd == str(wt_base) or cwd.startswith(str(wt_base) + "/"):
            return p
    return None

def api_agents() -> list[dict]:
    try:
        r = subprocess.run(["claude", "agents", "--json"], capture_output=True, text=True, timeout=10)
        sessions = json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else []
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError):
        sessions = []
    projects = [p for p in all_projects() if not p.get("error")]
    out = []
    for s in sessions:
        cwd = s.get("cwd", "")
        proj = match_project(cwd, projects)
        task_id = None
        if proj:
            m = re.search(rf"{re.escape(proj['key'])}-\d{{5}}", cwd)
            task_id = m.group(0) if m else None
        out.append({**s, "root": proj["root"] if proj else None,
                    "projectKey": proj["key"] if proj else None,
                    "projectName": proj["name"] if proj else None,
                    "taskId": task_id})
    return out

# ---------- api ----------
class RegisterIn(BaseModel):
    path: str

class ActionIn(BaseModel):
    root: str
    id: str
    action: str
    msg: str = ""

@app.get("/api/projects")
def api_projects():
    return all_projects()

@app.get("/api/agents")
def api_agents_route():
    return api_agents()

@app.post("/api/register")
def api_register(inp: RegisterIn):
    root = str(pathlib.Path(inp.path).expanduser().resolve())
    if not (pathlib.Path(root) / "pgm" / "project.md").exists():
        raise HTTPException(400, f"no pgm/project.md under {root}")
    reg = load_registry(); reg.append(root); save_registry(reg)
    return {"ok": True, "root": root}

@app.post("/api/unregister")
def api_unregister(inp: RegisterIn):
    root = str(pathlib.Path(inp.path).expanduser().resolve())
    save_registry([p for p in load_registry() if p != root])
    return {"ok": True}

@app.post("/api/action")
def api_action(inp: ActionIn):
    if inp.action not in ACTIONS:
        raise HTTPException(400, "bad action")
    if inp.root not in load_registry():
        raise HTTPException(400, "unregistered root")
    board = pathlib.Path(inp.root) / "pgm" / "board.py"
    if not board.exists():
        raise HTTPException(400, "no board.py")
    cmd = [sys.executable, str(board), inp.action, inp.id] + ([inp.msg] if inp.msg else [])
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise HTTPException(400, (r.stderr or r.stdout).strip())
    return {"ok": True, "out": r.stdout.strip()}

# ---------- serve built frontend (SPA) ----------
if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

@app.get("/{full_path:path}")
def spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(404, "not found")
    index = DIST / "index.html"
    if not index.exists():
        raise HTTPException(
            503, "frontend not built — run: cd frontend && npm install && npm run build"
        )
    f = DIST / full_path
    if full_path and f.is_file():
        return FileResponse(f)
    return FileResponse(index)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=7777)
