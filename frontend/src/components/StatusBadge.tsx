import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STYLES: Record<string, string> = {
  Backlog: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-transparent",
  Approved: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-transparent",
  "In Progress": "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent",
  Blocked: "bg-red-500/15 text-red-700 dark:text-red-300 border-transparent",
  "In Review": "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-transparent",
  Working: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent",
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge className={cn("font-medium", STYLES[status] ?? STYLES.Backlog, className)}>
      {status}
    </Badge>
  )
}
