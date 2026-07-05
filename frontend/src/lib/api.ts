export type Ticket = {
  id: string
  title: string
  epic: string
  status: string
  depends: string[]
  jira?: string
  desc: string
}

export type Project = {
  root: string
  key: string
  name: string
  status?: string
  jira_base?: string
  counts: Record<string, number>
  tickets: Ticket[]
  error?: string
}

export const STATUS_ORDER = [
  "Backlog",
  "Approved",
  "In Progress",
  "Blocked",
  "In Review",
  "Working",
] as const

export type Agent = {
  pid: number
  cwd: string
  kind: string
  startedAt: number
  sessionId: string
  name?: string
  root: string | null
  projectKey: string | null
  projectName: string | null
  taskId: string | null
}

export type Action =
  | "approve"
  | "start"
  | "review"
  | "working"
  | "block"
  | "reopen"

// Allowed transitions surfaced in the UI. Engine enforces the real gates;
// anything invalid returns an error we show to the user.
export const ACTIONS_FOR: Record<string, Action[]> = {
  Backlog: ["approve"],
  Approved: ["start", "block"],
  "In Progress": ["review", "block"],
  Blocked: ["reopen"],
  "In Review": ["working", "block"],
  Working: ["reopen"],
}

export const ACTION_LABEL: Record<Action, string> = {
  approve: "Approve",
  start: "Start",
  review: "Send to review",
  working: "Mark Working",
  block: "Block",
  reopen: "Reopen",
}

// Statuses sitting behind a human gate — these are what need your attention.
export const ATTENTION_STATUSES = ["Backlog", "In Review", "Blocked"] as const

export function needsAttention(status: string): boolean {
  return (ATTENTION_STATUSES as readonly string[]).includes(status)
}

async function req<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { detail?: string }).detail || res.statusText)
  return data as T
}

export const api = {
  projects: () => req<Project[]>("/api/projects"),
  register: (path: string) => req<{ ok: boolean; root: string }>("/api/register", { path }),
  unregister: (path: string) => req<{ ok: boolean }>("/api/unregister", { path }),
  action: (root: string, id: string, action: Action, msg = "") =>
    req<{ ok: boolean; out: string }>("/api/action", { root, id, action, msg }),
  agents: () => req<Agent[]>("/api/agents"),
}
