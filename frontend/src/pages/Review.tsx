import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Bot, Link2, Search, User } from "lucide-react"
import {
  api,
  ACTIONS_FOR,
  ACTION_LABEL,
  needsAttention,
  type Action,
} from "@/lib/api"
import { useTaskRows, type Row } from "@/lib/rows"
import { useAgentTaskKeys } from "@/lib/use-agent-tasks"
import { useProjects } from "@/lib/projects-context"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// One-key-per-action, disjoint across every status's action set — safe to
// treat globally rather than re-mapping per status.
const HOTKEY: Partial<Record<Action, string>> = {
  approve: "a",
  start: "s",
  review: "r",
  working: "w",
  block: "b",
  reopen: "o",
}

function rowKey(r: Pick<Row, "root" | "id">): string {
  return `${r.root}|${r.id}`
}

export function Review() {
  const rows = useTaskRows()
  const agentTaskKeys = useAgentTaskKeys()
  const { projects } = useProjects()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const projectFilter = params.get("project") ?? "all"

  function setParam(k: string, v: string) {
    const next = new URLSearchParams(params)
    if (v === "all") next.delete(k)
    else next.set(k, v)
    setParams(next, { replace: true })
  }

  const queue = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows
      .filter((r) => projectFilter === "all" || r.projectKey === projectFilter)
      .filter(
        (r) =>
          !term ||
          r.title.toLowerCase().includes(term) ||
          r.id.toLowerCase().includes(term),
      )
      .sort((a, b) => Number(needsAttention(b.status)) - Number(needsAttention(a.status)))
  }, [rows, projectFilter, q])

  // Keep a selection valid as the queue changes (filter, action, poll refresh).
  useEffect(() => {
    if (queue.length === 0) {
      setSelectedKey(null)
      return
    }
    if (!queue.some((r) => rowKey(r) === selectedKey)) {
      setSelectedKey(rowKey(queue[0]))
    }
  }, [queue, selectedKey])

  const index = queue.findIndex((r) => rowKey(r) === selectedKey)
  const current = index >= 0 ? queue[index] : undefined

  const goDelta = useCallback(
    (delta: number) => {
      if (queue.length === 0) return
      const i = index < 0 ? 0 : index
      const next = Math.min(queue.length - 1, Math.max(0, i + delta))
      setSelectedKey(rowKey(queue[next]))
    },
    [queue, index],
  )

  const act = useCallback(
    async (r: Row, action: Action) => {
      setBusy(true)
      try {
        await api.action(r.root, r.id, action)
        goDelta(1)
      } catch (e) {
        alert((e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [goDelta],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      const key = e.key.toLowerCase()
      if (key === "arrowdown" || key === "j") {
        e.preventDefault()
        goDelta(1)
        return
      }
      if (key === "arrowup" || key === "k") {
        e.preventDefault()
        goDelta(-1)
        return
      }
      if (!current || busy) return
      const actions = ACTIONS_FOR[current.status] ?? []
      const action = actions.find((a) => HOTKEY[a] === key)
      if (action) {
        e.preventDefault()
        act(current, action)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, busy, goDelta, act])

  const projectOpts = projects.filter((p) => !p.error)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="text-sm text-muted-foreground">
          {queue.length} ticket{queue.length === 1 ? "" : "s"} · j/k or ↓/↑ to move ·
          hotkeys act on the selected ticket.
        </p>
      </div>

      <div className="flex gap-4">
        <div className="flex w-80 shrink-0 flex-col gap-3">
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search id, title…"
                className="pl-8"
              />
            </div>
            <Select value={projectFilter} onValueChange={(v) => setParam("project", v)}>
              <SelectTrigger className="w-full">
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
          </div>

          <div className="max-h-[75vh] flex-1 overflow-y-auto rounded-md border">
            {queue.length === 0 ? (
              <p className="p-4 text-center text-xs italic text-muted-foreground">
                Nothing to review.
              </p>
            ) : (
              queue.map((r) => {
                const key = rowKey(r)
                const attention = needsAttention(r.status)
                const agentActive = agentTaskKeys.has(key)
                const isSelected = key === selectedKey
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b px-3 py-2.5 text-left transition-colors last:border-b-0",
                      isSelected ? "bg-secondary" : "hover:bg-secondary/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {r.id}
                      </span>
                      <span className="flex items-center gap-1">
                        {attention && (
                          <User className="size-3 shrink-0 text-amber-600 dark:text-amber-400" />
                        )}
                        {!attention && agentActive && (
                          <Bot className="size-3 shrink-0 text-blue-600 dark:text-blue-400" />
                        )}
                        <StatusBadge status={r.status} />
                      </span>
                    </div>
                    <span className="truncate text-sm font-medium">{r.title}</span>
                    {projectFilter === "all" && (
                      <Badge variant="secondary" className="w-fit font-mono text-[10px]">
                        {r.projectKey}
                      </Badge>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="max-h-[75vh] flex-1 overflow-y-auto rounded-md border">
          {!current ? (
            <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
              Select a ticket
            </div>
          ) : (
            <DetailPane
              current={current}
              busy={busy}
              onAct={act}
              agentActive={agentTaskKeys.has(rowKey(current))}
              index={index}
              total={queue.length}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function DetailPane({
  current,
  busy,
  onAct,
  agentActive,
  index,
  total,
}: {
  current: Row
  busy: boolean
  onAct: (r: Row, a: Action) => void
  agentActive: boolean
  index: number
  total: number
}) {
  const attention = needsAttention(current.status)
  const actions = ACTIONS_FOR[current.status] ?? []

  return (
    <div
      key={rowKey(current)}
      className="flex flex-col gap-4 p-6 duration-200 animate-in fade-in"
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {index + 1} of {total}
        </span>
        <Badge variant="secondary" className="font-mono text-[11px]">
          {current.projectKey}
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {current.id}
          </span>
          {current.jira && (
            <Badge
              variant="outline"
              className="border-blue-400/40 font-mono text-[11px] text-blue-600 dark:text-blue-400"
            >
              {current.jira}
            </Badge>
          )}
        </span>
        <span className="flex items-center gap-2">
          {attention && (
            <span title="Needs your action">
              <User className="size-4 text-amber-600 dark:text-amber-400" />
            </span>
          )}
          {!attention && agentActive && (
            <span title="An agent is working this task">
              <Bot className="size-4 text-blue-600 dark:text-blue-400" />
            </span>
          )}
          <StatusBadge status={current.status} />
        </span>
      </div>

      <h2 className="text-xl font-semibold leading-snug">{current.title}</h2>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {current.epic && (
          <span>
            <b className="font-medium text-foreground">Epic:</b> {current.epic}
          </span>
        )}
        {current.depends?.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Link2 className="size-3" />
            <b className="font-medium text-foreground">Depends:</b>{" "}
            {current.depends.join(", ")}
          </span>
        )}
      </div>

      <div className="rounded-md border bg-muted/30 p-4">
        {current.desc ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
            {current.desc}
          </pre>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No description in this ticket.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        {actions.map((a) => (
          <Button
            key={a}
            disabled={busy}
            variant={a === "block" || a === "reopen" ? "outline" : "default"}
            onClick={() => onAct(current, a)}
          >
            {ACTION_LABEL[a]}
            <kbd className="ml-1.5 rounded border border-current/30 px-1 text-[10px] opacity-70">
              {HOTKEY[a]?.toUpperCase()}
            </kbd>
          </Button>
        ))}
        {actions.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            No actions available in this status.
          </p>
        )}
      </div>
    </div>
  )
}
