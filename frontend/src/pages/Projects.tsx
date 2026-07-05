import { useState } from "react"
import { Link } from "react-router-dom"
import {
  FolderPlus,
  Pencil,
  Trash2,
  AlertTriangle,
  ArrowRight,
  AlertCircle,
} from "lucide-react"
import { api, STATUS_ORDER, needsAttention, type Project } from "@/lib/api"
import { useProjects } from "@/lib/projects-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function Projects() {
  const { projects, loading, reload } = useProjects()

  const sorted = [...projects].sort((a, b) => attentionOf(b) - attentionOf(a))

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Every connected <code className="text-xs">pgm/</code> folder, live.
          </p>
        </div>
        <ProjectDialog
          title="Connect a project"
          trigger={
            <Button>
              <FolderPlus className="size-4" /> Connect folder
            </Button>
          }
          onSubmit={async (path) => {
            await api.register(path)
            await reload()
          }}
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p) => (
            <ProjectCard key={p.root} p={p} onChange={reload} />
          ))}
        </div>
      )}
    </div>
  )
}

function attentionOf(p: Project): number {
  if (p.error) return 0
  return p.tickets.filter((t) => needsAttention(t.status)).length
}

function ProjectCard({ p, onChange }: { p: Project; onChange: () => void }) {
  const total = Object.values(p.counts || {}).reduce((a, b) => a + b, 0)
  const attention = attentionOf(p)

  async function remove() {
    if (!confirm(`Disconnect ${p.name}?\n${p.root}`)) return
    await api.unregister(p.root)
    onChange()
  }

  if (p.error) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-destructive" />
            {p.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-destructive">{p.error}</p>
          <p className="break-all text-xs text-muted-foreground">{p.root}</p>
          <Button variant="outline" size="sm" onClick={remove}>
            <Trash2 className="size-4" /> Disconnect
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        "border-l-4 transition-shadow hover:shadow-md",
        attention > 0
          ? "border-l-amber-500 shadow-sm shadow-amber-500/10"
          : "border-l-transparent",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="truncate">{p.name}</span>
              <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">
                {p.key}
              </Badge>
              {attention > 0 && (
                <Badge className="shrink-0 gap-1 border-transparent bg-amber-500/15 font-medium text-amber-700 dark:text-amber-300">
                  <AlertCircle className="size-3" />
                  {attention}
                </Badge>
              )}
            </CardTitle>
            <p className="mt-1 break-all text-xs text-muted-foreground">{p.root}</p>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <ProjectDialog
              title="Re-point project"
              initial={p.root}
              trigger={
                <Button variant="ghost" size="icon" className="size-8">
                  <Pencil className="size-4" />
                </Button>
              }
              onSubmit={async (path) => {
                if (path !== p.root) {
                  await api.register(path)
                  await api.unregister(p.root)
                }
                onChange()
              }}
            />
            <Button variant="ghost" size="icon" className="size-8" onClick={remove}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_ORDER.filter((s) => p.counts?.[s]).map((s) => (
            <Badge key={s} variant="outline" className="font-normal">
              {s} <b className="ml-1 tabular-nums">{p.counts[s]}</b>
            </Badge>
          ))}
          {total === 0 && (
            <span className="text-xs text-muted-foreground">No tickets yet.</span>
          )}
        </div>
        <Link
          to={`/tasks?project=${encodeURIComponent(p.key)}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View {total} task{total === 1 ? "" : "s"} <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  )
}

function ProjectDialog({
  title,
  trigger,
  initial = "",
  onSubmit,
}: {
  title: string
  trigger: React.ReactNode
  initial?: string
  onSubmit: (path: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState(initial)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    setErr("")
    setBusy(true)
    try {
      await onSubmit(path.trim())
      setOpen(false)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setPath(initial)
          setErr("")
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Absolute path to a project root containing{" "}
            <code className="text-xs">pgm/project.md</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="path">Project root</Label>
          <Input
            id="path"
            value={path}
            placeholder="/Users/you/code/my-project"
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button disabled={busy || !path.trim()} onClick={submit}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-secondary">
          <FolderPlus className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">No projects connected</p>
          <p className="text-sm text-muted-foreground">
            Connect a folder that contains a <code className="text-xs">pgm/</code> directory.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
