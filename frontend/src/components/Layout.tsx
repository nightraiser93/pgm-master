import { NavLink, Outlet } from "react-router-dom"
import { LayoutGrid, ListChecks } from "lucide-react"
import { cn } from "@/lib/utils"

function Tab({ to, icon: Icon, label }: { to: string; icon: typeof LayoutGrid; label: string }) {
  return (
    <NavLink
      to={to}
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
    </NavLink>
  )
}

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
              pgm
            </div>
            <span className="font-semibold tracking-tight">pgm-master</span>
          </div>
          <nav className="flex items-center gap-1">
            <Tab to="/" icon={LayoutGrid} label="Projects" />
            <Tab to="/tasks" icon={ListChecks} label="Tasks" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
