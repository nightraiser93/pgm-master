import { NavLink, Outlet } from "react-router-dom"
import { LayoutGrid, ListChecks, Bot, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { useProjects } from "@/lib/projects-context"

function Tab({
  to,
  icon: Icon,
  label,
  badge,
}: {
  to: string
  icon: typeof LayoutGrid
  label: string
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-secondary text-secondary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
        )
      }
    >
      <Icon className="size-4" />
      {label}
      {!!badge && (
        <span className="ml-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white">
          {badge}
        </span>
      )}
    </NavLink>
  )
}

export function Layout() {
  const { attentionCount } = useProjects()

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-xs font-bold shadow-sm">
              pgm
            </div>
            <span className="font-semibold tracking-tight">pgm-master</span>
          </div>
          <nav className="flex items-center gap-1">
            <Tab to="/" icon={LayoutGrid} label="Projects" />
            <Tab to="/review" icon={Inbox} label="Review" badge={attentionCount} />
            <Tab to="/tasks" icon={ListChecks} label="Tasks" />
            <Tab to="/agents" icon={Bot} label="Agents" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
