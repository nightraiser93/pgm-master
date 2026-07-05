import { useEffect, useState } from "react"
import { Bot, Clock, FolderGit2 } from "lucide-react"
import { api, type Agent } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function reload() {
      try {
        setAgents(await api.agents())
      } finally {
        setLoading(false)
      }
    }
    reload()
    const t = setInterval(reload, 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Agents</h1>
        <p className="text-xs text-muted-foreground">
          {loading ? "Loading…" : `${agents.length} active Claude Code session${agents.length === 1 ? "" : "s"}.`}
        </p>
      </div>

      {!loading && agents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            No active sessions.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {agents.map((a) => (
            <Card key={a.sessionId} className="gap-0 py-0">
              <CardContent className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <Bot className="size-4 text-muted-foreground" />
                    {a.name || `pid ${a.pid}`}
                  </span>
                  {a.taskId && (
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {a.taskId}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FolderGit2 className="size-3.5 shrink-0" />
                  <span className="truncate" title={a.cwd}>
                    {a.projectName ?? a.cwd}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {timeAgo(a.startedAt)}
                  </span>
                  <span className="font-mono">{a.kind}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
