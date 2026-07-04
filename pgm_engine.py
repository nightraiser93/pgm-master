#!/usr/bin/env python3
"""pgm engine — the ONE canonical board engine. Project-agnostic.

Operates on the pgm folder given by env `PGM_DIR` (set by each project's
`pgm/board.py` shim); falls back to the current directory. The ticket prefix
(KEY) is read from `<PGM_DIR>/project.md`. Do not copy this into projects —
projects carry only a thin shim that delegates here.

CLI (via the shim, `python3 pgm/board.py …`):
  (no args)                 regenerate the board
  new "title" [epic]        scaffold the next <KEY>-##### ticket
  approve <id> [msg]        Backlog/Blocked -> Approved       (HUMAN)
  start   <id> [msg]        Approved -> In Progress            (Claude)
  review  <id> [msg]        In Progress -> In Review           (Claude)
  working <id> [msg]        In Review -> Working               (HUMAN)
  block   <id> "why"        -> Blocked                         (Claude)
  reopen  <id> [msg]        Working/In Review -> In Progress   (HUMAN)
  link    <id> <rel> <tgt>  add a cross-task link (see LINK_RELS)
  unlink  <id> <tgt>        remove links to <tgt>
  ready                     list workable tasks (Approved, deps done) — one per session
  wt <id>                   start <id> + create an isolated git worktree (parallel work)
  wt rm <id>                remove <id>'s worktree (after its PR is raised)
  wt ls                     list this repo's pgm worktrees
  notify-setup              interactive: wire up Telegram notifications (optional)
  notify-test               send a test Telegram message (verify creds)

<tgt> for link = a same-project id (00003) OR an absolute path to another
project's ticket .md (cross-project). Links live in the `links:` frontmatter
as `<rel>:<abs-path>`.
"""
import os, re, sys, json, datetime, pathlib, subprocess

HERE = pathlib.Path(os.environ.get("PGM_DIR", ".")).resolve()
START, END = "<!-- BOARD:START -->", "<!-- BOARD:END -->"
ORDER = ["Backlog", "Approved", "In Progress", "Blocked", "In Review", "Working"]
LINK_RELS = ["blocked-by", "blocks", "relates-to", "duplicates", "depends-on"]

# command -> (from-states, to-state, actor)
TRANSITIONS = {
    "approve": (["Backlog", "Blocked"],              "Approved",    "you"),
    "start":   (["Approved"],                        "In Progress", "claude"),
    "review":  (["In Progress"],                     "In Review",   "claude"),
    "working": (["In Review"],                       "Working",     "you"),
    "block":   (["Approved", "In Progress"],         "Blocked",     "claude"),
    "reopen":  (["Working", "In Review", "Blocked"], "In Progress", "you"),
}

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

def project_key() -> str:
    pm = HERE / "project.md"
    if pm.exists():
        k = parse_fm(pm.read_text()).get("key")
        if k:
            return k
    return "TASK"

KEY = project_key()

def ticket_path(tid: str) -> pathlib.Path:
    tid = tid.upper().replace(f"{KEY}-", "")
    return HERE / f"{KEY}-{tid.zfill(5)}.md"

def branch_name(fm: dict) -> str:
    prefix = {"feature": "feat", "fix": "fix", "chore": "chore",
              "docs": "docs", "refactor": "refactor"}.get(fm.get("type", "feature"), "feat")
    slug = re.sub(r"[^a-z0-9]+", "-", fm.get("title", "").lower()).strip("-")[:40].strip("-")
    return f"{prefix}/{fm.get('id')}-{slug}"

# ---------- notifications (Telegram, stdlib only, best-effort) ----------
def project_name() -> str:
    pm = HERE / "project.md"
    if pm.exists():
        return parse_fm(pm.read_text()).get("name", KEY)
    return KEY

def section(text: str, name: str) -> str:
    """Body text under a `## <name>` heading, up to the next `##` or EOF."""
    m = re.search(rf"(?m)^##\s+{re.escape(name)}\s*$(.*?)(?=^##\s|\Z)", text, re.S)
    return m.group(1).strip() if m else ""

def _telegram_creds():
    tok = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if tok and chat:
        return tok, chat
    cfg = pathlib.Path.home() / ".pgm" / "telegram.json"
    if cfg.exists():
        try:
            d = json.loads(cfg.read_text())
            return d.get("bot_token"), d.get("chat_id")
        except Exception:
            pass
    return None, None

def send_telegram(text: str) -> bool:
    if os.environ.get("PGM_NOTIFY") == "0":
        return False
    tok, chat = _telegram_creds()
    if not (tok and chat):
        return False
    import urllib.request, urllib.parse
    payload = urllib.parse.urlencode({
        "chat_id": chat, "text": text, "parse_mode": "HTML",
        "disable_web_page_preview": "false"}).encode()
    try:
        req = urllib.request.Request(f"https://api.telegram.org/bot{tok}/sendMessage", data=payload)
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status == 200
    except Exception as e:
        print(f"(telegram notify failed: {e})")
        return False

def _tg_api(tok: str, method: str, **params):
    import urllib.request, urllib.parse
    url = f"https://api.telegram.org/bot{tok}/{method}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.loads(r.read().decode())

def cmd_notify_setup():
    """Interactive: validate a bot token, auto-detect chat id, write ~/.pgm/telegram.json, test."""
    print("pgm Telegram notifications — setup (get pinged on PR raised + task done)\n")
    tok = input("1) Paste your bot token from @BotFather (blank = cancel): ").strip()
    if not tok:
        print("cancelled — notifications stay off."); return
    try:
        me = _tg_api(tok, "getMe")
    except Exception as e:
        sys.exit(f"could not reach Telegram: {e}")
    if not me.get("ok"):
        sys.exit(f"bad token: {me.get('description')}")
    uname = me["result"]["username"]
    print(f"   ✓ bot @{uname}")
    input(f"2) Open @{uname} in Telegram, press Start / send any message, then press Enter here… ")
    chat = None
    for _ in range(4):
        try:
            upd = _tg_api(tok, "getUpdates")
        except Exception as e:
            sys.exit(f"getUpdates failed: {e}")
        for u in reversed(upd.get("result", [])):
            c = (u.get("message") or u.get("edited_message") or {}).get("chat", {})
            if c.get("id"):
                chat = c; break
        if chat:
            break
        input("   no message seen yet — send one to the bot, then Enter to retry… ")
    if not chat:
        sys.exit("no message found. message the bot, then re-run: board.py notify-setup")
    cid, who = chat["id"], (chat.get("title") or chat.get("first_name") or "")
    cfg = pathlib.Path.home() / ".pgm" / "telegram.json"
    cfg.parent.mkdir(parents=True, exist_ok=True)
    cfg.write_text(json.dumps({"bot_token": tok, "chat_id": str(cid)}))
    os.chmod(cfg, 0o600)
    print(f"3) ✓ wrote {cfg}  (chat {cid} {who})")
    ok = send_telegram("✅ pgm notifications wired up — you'll get pinged on PR raised + task done.")
    print("4) ✓ test message sent — check Telegram." if ok else "4) test send failed — check token/chat_id.")

def notify_transition(cmd: str, fm: dict, body: str, cur: str, to: str, msg: str):
    heads = {"review": "🔀 PR raised — ready for your review", "working": "✅ Task done"}
    head = heads.get(cmd)
    if not head:
        return
    tid, title, epic = fm.get("id"), fm.get("title", ""), fm.get("epic", "")
    lines = [f"<b>{head}</b>",
             f"<b>{project_name()}</b> · <code>{tid}</code>  {title}"]
    if epic:
        lines.append(f"Epic: {epic}")
    lines.append(f"Status: {cur} → {to}")
    intent = section(body, "Intent")
    if intent:
        intent = re.sub(r"\s+", " ", intent).strip()
        lines.append("\n" + (intent[:500] + ("…" if len(intent) > 500 else "")))
    if msg:  # e.g. the PR URL passed to `review`/`working`
        lines.append(f"\n🔗 {msg}")
    if send_telegram("\n".join(lines)):
        print("telegram: notified")

def transition(cmd: str, tid: str, msg: str):
    froms, to, actor = TRANSITIONS[cmd]
    f = ticket_path(tid)
    if not f.exists():
        sys.exit(f"no such ticket: {f.name}")
    text = f.read_text()
    body = text  # original ticket text, for the notification summary
    fm = parse_fm(text)
    cur = fm.get("status", "?")
    if cur == to:
        sys.exit(f"{f.stem} already {to}")
    if cur not in froms:
        sys.exit(f"illegal move: {f.stem} is '{cur}', {cmd} needs {froms}")
    text = re.sub(r"(?m)^status:.*$", f"status: {to}", text, count=1)
    date = datetime.date.today().isoformat()
    note = f"- {date} [{cur} → {to}] {actor}: {msg or cmd}"
    text = re.sub(r"^- _\(none yet.*\)_\s*$", "", text, flags=re.M)
    text = text.rstrip() + "\n" + note + "\n"
    f.write_text(text)
    print(f"{f.stem}: {cur} → {to}  ({actor})")
    if cmd == "start":
        print(f"branch: {branch_name(fm)}   # every change ↔ a task (see CLAUDE.md)")
    notify_transition(cmd, fm, body, cur, to, msg)
    regen()

def set_fm_field(text: str, key: str, value: str) -> str:
    """Replace or insert `key: value` inside the first frontmatter block."""
    end = text.index("\n---", 4)
    head, tail = text[:end], text[end:]
    line = f"{key}: {value}"
    if re.search(rf"(?m)^{key}:.*$", head):
        head = re.sub(rf"(?m)^{key}:.*$", line, head, count=1)
    else:
        head = head.rstrip("\n") + "\n" + line
    return head + tail

def resolve_target(tgt: str) -> pathlib.Path:
    """A same-project id (00003 / KEY-3) or an absolute path to another ticket .md."""
    if "/" in tgt or tgt.endswith(".md"):
        return pathlib.Path(tgt).expanduser().resolve()
    return ticket_path(tgt)

def add_link(tid: str, rel: str, tgt: str, note: str):
    if rel not in LINK_RELS:
        sys.exit(f"bad relation '{rel}'. one of: {', '.join(LINK_RELS)}")
    f = ticket_path(tid)
    if not f.exists():
        sys.exit(f"no such ticket: {f.name}")
    target = resolve_target(tgt)
    if not target.exists():
        sys.exit(f"link target not found: {target}")
    text = f.read_text()
    links = parse_fm(text).get("links", [])
    if isinstance(links, str):
        links = [links]
    entry = f"{rel}:{target}"
    if entry in links:
        sys.exit(f"link already exists: {entry}")
    links.append(entry)
    text = set_fm_field(text, "links", "[" + ", ".join(links) + "]")
    ttitle = parse_fm(target.read_text()).get("title", "") if target.suffix == ".md" else ""
    date = datetime.date.today().isoformat()
    tail = f"- {date} [link] {rel} → {target.name}" + (f" ({ttitle})" if ttitle else "") + (f" — {note}" if note else "")
    text = text.rstrip() + "\n" + tail + "\n"
    f.write_text(text)
    print(f"{f.stem}: {rel} → {target}")
    regen()

def remove_link(tid: str, tgt: str):
    f = ticket_path(tid)
    if not f.exists():
        sys.exit(f"no such ticket: {f.name}")
    target = str(resolve_target(tgt))
    text = f.read_text()
    links = parse_fm(text).get("links", [])
    if isinstance(links, str):
        links = [links]
    kept = [l for l in links if not l.endswith(target)]
    if len(kept) == len(links):
        sys.exit(f"no link to {target}")
    if kept:
        text = set_fm_field(text, "links", "[" + ", ".join(kept) + "]")
    else:
        text = re.sub(r"(?m)^links:.*\n", "", text, count=1)
    f.write_text(text)
    print(f"{f.stem}: unlinked {target}")
    regen()

# ---------- readiness (one task, one session) ----------
DONE_STATES = {"Working"}  # a dependency is satisfied once it reaches the done gate

def load_tickets() -> dict:
    out = {}
    for f in sorted(HERE.glob(f"{KEY}-*.md")):
        fm = parse_fm(f.read_text())
        if not fm:
            continue
        out[fm["id"]] = fm
    return out

def norm_id(d: str) -> str:
    d = str(d).upper().replace(f"{KEY}-", "")
    return f"{KEY}-{d.zfill(5)}" if d.isdigit() else d

def dep_targets(fm: dict) -> list[str]:
    """Everything this ticket waits on: `depends:` ids + blocking `links:`."""
    deps = list(fm.get("depends", []) or [])
    links = fm.get("links", [])
    if isinstance(links, str):
        links = [links]
    for l in links:
        if ":" in l:
            rel, tgt = l.split(":", 1)
            if rel in ("blocked-by", "depends-on"):
                deps.append(tgt)
    return deps

def dep_status(tgt: str, tickets: dict):
    """Status of a dep target: same-project id or an absolute path to another ticket."""
    if "/" in tgt or tgt.endswith(".md"):
        p = pathlib.Path(tgt).expanduser()
        return parse_fm(p.read_text()).get("status") if p.exists() else None
    fm = tickets.get(norm_id(tgt))
    return fm.get("status") if fm else None

def unmet_deps(fm: dict, tickets: dict) -> list[str]:
    return [d for d in dep_targets(fm) if dep_status(d, tickets) not in DONE_STATES]

def session_prompt(fm: dict) -> str:
    root = HERE.parent
    tid = fm.get("id")
    return (f'In {root}, work pgm task {tid} — "{fm.get("title","")}" — and nothing else. '
            f'Run `python3 pgm/board.py wt {tid}` (starts it + makes an isolated worktree), '
            f'cd into the printed worktree, build, commit, then `board.py review {tid}` to open the PR. '
            f'One task, one session.')

def cmd_ready():
    tickets = load_tickets()
    ready, waiting, needs_approval = [], [], []
    for fm in tickets.values():
        st = fm.get("status", "Backlog")
        if st == "Approved":
            (waiting if unmet_deps(fm, tickets) else ready).append(fm)
        elif st == "Backlog":
            needs_approval.append(fm)

    def line(fm):
        dep = ", ".join(dep_targets(fm)) or "—"
        return f'  {fm["id"]}  {fm.get("title","")}   (deps: {dep})'

    if not (ready or waiting or needs_approval):
        total = len(tickets)
        print(f"[{KEY}] ✓ nothing to work on — no Approved, waiting, or Backlog tickets "
              f"({'all ' + str(total) + ' done/closed' if total else 'no tickets yet'}).")
        return

    print(f"[{KEY}] readiness — one task, one session\n")
    print(f"READY — Approved, deps done ({len(ready)}). Independent: run each in its OWN session.")
    if ready:
        for fm in ready:
            print(line(fm))
        print("\n  session prompts (copy one per fresh session):")
        for fm in ready:
            print(f"    • {session_prompt(fm)}")
    else:
        hint = ("approve a Backlog task below" if needs_approval
                else "everything Approved is waiting on open deps — finish those first")
        print(f"  (none ready — {hint})")
    if waiting:
        print(f"\nWAITING — Approved but blocked by open deps ({len(waiting)}):")
        for fm in waiting:
            print(f'  {fm["id"]}  {fm.get("title","")}   waits on: {", ".join(unmet_deps(fm, tickets))}')
    if needs_approval:
        print(f"\nNEEDS YOUR APPROVAL — Backlog ({len(needs_approval)}):")
        for fm in needs_approval:
            print(line(fm))

# ---------- git worktrees (parallel tasks, isolated trees) ----------
def _git(root: pathlib.Path, *args):
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)

def git_root() -> pathlib.Path:
    """Repo top-level for the project holding this pgm/ folder."""
    proj = HERE.parent
    r = _git(proj, "rev-parse", "--show-toplevel")
    if r.returncode != 0:
        sys.exit(f"not a git repo: {proj} ({r.stderr.strip()})")
    return pathlib.Path(r.stdout.strip())

def worktree_dir(root: pathlib.Path, branch: str) -> pathlib.Path:
    """Sibling of the repo: <parent>/<repo>-worktrees/<branch-with-dashes>."""
    return root.parent / f"{root.name}-worktrees" / branch.replace("/", "-")

def branch_exists(root: pathlib.Path, branch: str) -> bool:
    return _git(root, "show-ref", "--verify", "--quiet", f"refs/heads/{branch}").returncode == 0

def cmd_worktree_add(tid: str):
    f = ticket_path(tid)
    if not f.exists():
        sys.exit(f"no such ticket: {f.name}")
    root = git_root()  # fail fast before any status change
    fm = parse_fm(f.read_text())
    cur = fm.get("status", "?")
    # Creating a worktree = beginning the task. Auto-start if it's an Approved task.
    if cur == "Approved":
        transition("start", tid, "worktree")
        fm = parse_fm(f.read_text())
    elif cur != "In Progress":
        print(f"warning: {fm.get('id')} is '{cur}' — worktrees are for Approved/In Progress tasks")
    branch = branch_name(fm)
    wt = worktree_dir(root, branch)
    if wt.exists():
        print(f"worktree already exists: {wt}")
    else:
        wt.parent.mkdir(parents=True, exist_ok=True)
        add = ["worktree", "add"]
        add += [str(wt), branch] if branch_exists(root, branch) else ["-b", branch, str(wt)]
        r = _git(root, *add)
        if r.returncode != 0:
            sys.exit(f"worktree add failed: {r.stderr.strip()}")
        print(f"created worktree: {wt}")
    tid_full = fm.get("id")
    print(f"branch: {branch}")
    print("\n⚠ this worktree is meant to be worked in a SEPARATE Claude session — its own token budget.")
    print("  running several in parallel multiplies token use. confirm the count with the user first.")
    print("\nnext — in a fresh session, one task only:")
    print(f"  cd {wt}")
    print(f"  # build {tid_full} here, commit on this branch")
    print(f"  python3 {root}/pgm/board.py review {tid_full}   # In Review + open PR (run from main checkout)")
    print(f"  python3 {root}/pgm/board.py wt rm {tid_full}     # once the PR is raised, drop the worktree")

def cmd_worktree_rm(tid: str, force: bool = False):
    f = ticket_path(tid)
    if not f.exists():
        sys.exit(f"no such ticket: {f.name}")
    fm = parse_fm(f.read_text())
    branch = branch_name(fm)
    root = git_root()
    wt = worktree_dir(root, branch)
    args = ["worktree", "remove", str(wt)] + (["--force"] if force else [])
    r = _git(root, *args)
    if r.returncode != 0:
        sys.exit(f"worktree remove failed (commit/push first, or add --force): {r.stderr.strip()}")
    print(f"removed worktree: {wt}\nbranch {branch} kept — the PR still needs it.")

def cmd_worktree_list():
    root = git_root()
    base = str(root.parent / f"{root.name}-worktrees")
    r = _git(root, "worktree", "list")
    lines = [l for l in r.stdout.splitlines() if base in l]
    print("\n".join(lines) if lines else f"no pgm worktrees under {base}")

def next_id() -> str:
    nums = [int(f.stem.split("-")[1]) for f in HERE.glob(f"{KEY}-*.md")
            if f.stem.split("-")[1].isdigit()]
    return f"{(max(nums) + 1) if nums else 1:05d}"

def new_ticket(title: str, epic: str):
    tid = f"{KEY}-{next_id()}"
    f = HERE / f"{tid}.md"
    f.write_text(
        f"---\nid: {tid}\ntitle: {title}\nstatus: Backlog\ntype: feature\n"
        f"epic: {epic or 'E?'}\ndepends: []\n---\n# {tid} — {title}\n\n"
        f"- **Slice value:** <the end-to-end value this delivers>\n\n"
        f"## Intent\n<what and why>\n\n## Acceptance criteria\n- [ ] <observable outcome>\n\n"
        f"## Subtasks\n- [ ] <step>\n\n## Comments\n"
        f"- {datetime.date.today().isoformat()}: Created.\n")
    print(f"created {tid}.md")
    regen()

def regen():
    rows = []
    for f in sorted(HERE.glob(f"{KEY}-*.md")):
        fm = parse_fm(f.read_text())
        if not fm:
            continue
        dep = ", ".join(fm.get("depends", [])) or "—"
        rows.append((fm["id"], fm.get("title", ""), fm.get("epic", ""),
                     fm.get("status", "Backlog"), dep, f.name))
    table = ["| ID | Title | Epic | Status | Depends on |",
             "|----|-------|------|--------|------------|"]
    for _id, title, epic, status, dep, fname in rows:
        table.append(f"| [{_id}]({fname}) | {title} | {epic} | {status} | {dep} |")
    counts = {}
    for r in rows:
        counts[r[3]] = counts.get(r[3], 0) + 1
    summary = " · ".join(f"{s}: {counts[s]}" for s in ORDER if counts.get(s))
    block = (f"{START}\n_Auto-generated by `board.py` — do not edit by hand._\n\n"
             f"**{len(rows)} tickets** — {summary}\n\n" + "\n".join(table) + f"\n{END}")
    readme = HERE / "README.md"
    if not readme.exists():
        print(f"(no README.md in {HERE}; skipped board render)"); return
    text = readme.read_text()
    if START in text and END in text:
        text = re.sub(re.escape(START) + r".*?" + re.escape(END), block, text, flags=re.S)
    else:
        text = text.rstrip() + "\n\n## Board\n\n" + block + "\n"
    readme.write_text(text)
    print(f"board [{KEY}]: {len(rows)} rows ({summary})")

def main():
    if len(sys.argv) == 1:
        regen(); return
    cmd = sys.argv[1]
    if cmd in ("ready", "next"):
        cmd_ready(); return
    if cmd == "notify-setup":
        cmd_notify_setup(); return
    if cmd == "notify-test":
        tok, chat = _telegram_creds()
        if not (tok and chat):
            sys.exit("no Telegram creds — set ~/.pgm/telegram.json or TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID")
        ok = send_telegram(f"✅ pgm notification test — <b>{project_name()}</b> [{KEY}] is wired up.")
        print("sent ✓" if ok else "send failed (check token/chat_id)"); return
    if cmd in ("wt", "worktree"):
        sub = sys.argv[2] if len(sys.argv) > 2 else ""
        if sub in ("rm", "remove"):
            if len(sys.argv) < 4:
                sys.exit("usage: board.py wt rm <id> [--force]")
            cmd_worktree_rm(sys.argv[3], force="--force" in sys.argv[4:]); return
        if sub in ("ls", "list"):
            cmd_worktree_list(); return
        if not sub:
            sys.exit("usage: board.py wt <id>  |  wt rm <id>  |  wt ls")
        cmd_worktree_add(sub); return
    if cmd == "new":
        if len(sys.argv) < 3:
            sys.exit('usage: board.py new "title" [epic]')
        new_ticket(sys.argv[2], " ".join(sys.argv[3:])); return
    if cmd == "link":
        if len(sys.argv) < 5:
            sys.exit(f'usage: board.py link <id> <rel> <target> [note]   rel ∈ {LINK_RELS}')
        add_link(sys.argv[2], sys.argv[3], sys.argv[4], " ".join(sys.argv[5:])); return
    if cmd == "unlink":
        if len(sys.argv) < 4:
            sys.exit("usage: board.py unlink <id> <target>")
        remove_link(sys.argv[2], sys.argv[3]); return
    if cmd not in TRANSITIONS:
        sys.exit(__doc__)
    if len(sys.argv) < 3:
        sys.exit(f"usage: board.py {cmd} <id> [message]")
    transition(cmd, sys.argv[2], " ".join(sys.argv[3:]))

if __name__ == "__main__":
    main()
