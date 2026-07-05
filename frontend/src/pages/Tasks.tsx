import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Search, Link2, AlertCircle, Bot, User } from "lucide-react"
import {
  api,
  STATUS_ORDER,
  ACTIONS_FOR,
  ACTION_LABEL,
  needsAttention,
  type Action,
} from "@/lib/api"
import { useProjects } from "@/lib/projects-context"
import { useTaskRows, type Row } from "@/lib/rows"
import { useAgentTaskKeys } from "@/lib/use-agent-tasks"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function JiraBadge({ row }: { row: Row }) {
  if (!row.jira) return null
  const badge = (
    <Badge
      variant="outline"
      className="border-blue-400/40 font-mono text-[11px] text-blue-600 dark:text-blue-400"
    >
      {row.jira}
    </Badge>
  )
  if (!row.jiraBase) return badge
  return (
    <a
      href={`${row.jiraBase}/browse/${row.jira}`}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Open ${row.jira} in Jira`}
    >
      {badge}
    </a>
  )
}

export function Tasks() {
  const [params, setParams] = useSearchParams()
  const { projects, reload } = useProjects()
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<Row | null>(null)
  const agentTaskKeys = useAgentTaskKeys()

  const projectFilter = params.get("project") ?? "all"
  const statusFilter = params.get("status") ?? "all"
  const attentionOnly = params.get("attention") === "1"

  function setParam(k: string, v: string) {
    const next = new URLSearchParams(params)
    if (v === "all") next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
  }

  const rows = useTaskRows()

  const attentionCount = useMemo(
    () => rows.filter((r) => needsAttention(r.status)).length,
    [rows],
  )

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows
      .filter(
        (r) =>
          (projectFilter === "all" || r.projectKey === projectFilter) &&
          (statusFilter === "all" || r.status === statusFilter) &&
          (!attentionOnly || needsAttention(r.status)) &&
          (!term ||
            r.title.toLowerCase().includes(term) ||
            r.id.toLowerCase().includes(term) ||
            (r.jira?.toLowerCase().includes(term) ?? false) ||
            r.epic.toLowerCase().includes(term) ||
            r.desc.toLowerCase().includes(term)),
      )
      .sort((a, b) => Number(needsAttention(b.status)) - Number(needsAttention(a.status)))
  }, [rows, projectFilter, statusFilter, attentionOnly, q])

  async function act(r: Row, action: Action) {
    setBusy(r.id)
    try {
      await api.action(r.root, r.id, action)
      await reload()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Keep the open dialog's data fresh after refresh/actions.
  const openRow = open
    ? rows.find((r) => r.root === open.root && r.id === open.id) ?? open
    : null

  const projectOpts = projects.filter((p) => !p.error)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {rows.length} across all projects.
        </p>
      </div>

      {attentionCount > 0 && (
        <button
          onClick={() => setParam("attention", attentionOnly ? "all" : "1")}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
            attentionOnly
              ? "border-amber-500/60 bg-amber-500/15"
              : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10",
          )}
        >
          <AlertCircle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {attentionCount} task{attentionCount === 1 ? "" : "s"} need
            {attentionCount === 1 ? "s" : ""} your action
          </span>
          <span className="ml-auto text-xs font-medium text-amber-700/80 dark:text-amber-400/80">
            {attentionOnly ? "Showing only these — click to clear" : "Click to focus"}
          </span>
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search id, title, description…"
            className="pl-8"
          />
        </div>
        <Select value={projectFilter} onValueChange={(v) => setParam("project", v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projectOpts.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setParam("status", v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            No tasks match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => (
            <TaskCard
              key={`${r.projectKey}-${r.id}`}
              r={r}
              busy={busy === r.id}
              onAct={act}
              onOpen={() => setOpen(r)}
              agentActive={agentTaskKeys.has(`${r.root}|${r.id}`)}
              showProject={projectFilter === "all"}
            />
          ))}
        </div>
      )}

      <TaskDialog
        row={openRow}
        busy={busy === openRow?.id}
        onAct={act}
        onOpenChange={(o) => !o && setOpen(null)}
      />
    </div>
  )
}

function ActionButtons({
  r,
  busy,
  onAct,
  size = "sm",
}: {
  r: Row
  busy: boolean
  onAct: (r: Row, a: Action) => void
  size?: "sm" | "default"
}) {
  const actions = ACTIONS_FOR[r.status] ?? []
  if (actions.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((a) => (
        <Button
          key={a}
          size={size}
          variant={a === "block" || a === "reopen" ? "outline" : "default"}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            onAct(r, a)
          }}
        >
          {ACTION_LABEL[a]}
        </Button>
      ))}
    </div>
  )
}

function TaskCard({
  r,
  busy,
  onAct,
  onOpen,
  agentActive,
  showProject,
}: {
  r: Row
  busy: boolean
  onAct: (r: Row, a: Action) => void
  onOpen: () => void
  agentActive: boolean
  showProject: boolean
}) {
  const attention = needsAttention(r.status)

  return (
    <Card
      onClick={onOpen}
      className={cn(
        "flex cursor-pointer flex-col border-l-4 transition-shadow hover:shadow-md",
        attention
          ? "border-l-amber-500 shadow-sm shadow-amber-500/10 ring-1 ring-amber-500/20"
          : agentActive
            ? "border-l-blue-500 shadow-sm shadow-blue-500/10 ring-1 ring-blue-500/20"
            : "border-l-transparent",
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-3 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {r.id}
            </span>
            <JiraBadge row={r} />
          </span>
          <span className="flex items-center gap-1.5">
            {attention && (
              <span title="Needs your action">
                <User className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              </span>
            )}
            {!attention && agentActive && (
              <span title="An agent is working this task">
                <Bot className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
              </span>
            )}
            <StatusBadge status={r.status} />
          </span>
        </div>

        <h3 className="text-sm font-semibold leading-snug">{r.title}</h3>

        {r.desc ? (
          <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
            {r.desc}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground/60">No description</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          {showProject && (
            <Badge variant="secondary" className="font-mono text-[11px]">
              {r.projectKey}
            </Badge>
          )}
          {r.epic && <span className="truncate">{r.epic}</span>}
          {r.depends?.length > 0 && (
            <span
              className="inline-flex items-center gap-1"
              title={`depends on ${r.depends.join(", ")}`}
            >
              <Link2 className="size-3" />
              {r.depends.length}
            </span>
          )}
        </div>

        <ActionButtons r={r} busy={busy} onAct={onAct} />
      </CardContent>
    </Card>
  )
}

function TaskDialog({
  row,
  busy,
  onAct,
  onOpenChange,
}: {
  row: Row | null
  busy: boolean
  onAct: (r: Row, a: Action) => void
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        {row && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{row.id}</span>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {row.projectKey}
                </Badge>
                <JiraBadge row={row} />
                <StatusBadge status={row.status} />
              </div>
              <DialogTitle className="pt-1 text-lg leading-snug">
                {row.title}
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {row.epic && (
                <span>
                  <b className="font-medium text-foreground">Epic:</b> {row.epic}
                </span>
              )}
              {row.depends?.length > 0 && (
                <span>
                  <b className="font-medium text-foreground">Depends:</b>{" "}
                  {row.depends.join(", ")}
                </span>
              )}
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-md border bg-muted/30 p-4">
              {row.desc ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                  {row.desc}
                </pre>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No description in this ticket.
                </p>
              )}
            </div>

            <ActionButtons r={row} busy={busy} onAct={onAct} size="default" />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
