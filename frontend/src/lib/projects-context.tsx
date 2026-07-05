import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { api, needsAttention, type Project } from "@/lib/api"

type Ctx = {
  projects: Project[]
  loading: boolean
  attentionCount: number
  reload: () => Promise<void>
}

const ProjectsContext = createContext<Ctx | null>(null)

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  async function reload() {
    try {
      setProjects(await api.projects())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    const t = setInterval(reload, 5000)
    return () => clearInterval(t)
  }, [])

  const attentionCount = projects
    .filter((p) => !p.error)
    .reduce(
      (sum, p) => sum + p.tickets.filter((t) => needsAttention(t.status)).length,
      0,
    )

  return (
    <ProjectsContext.Provider value={{ projects, loading, attentionCount, reload }}>
      {children}
    </ProjectsContext.Provider>
  )
}

export function useProjects() {
  const ctx = useContext(ProjectsContext)
  if (!ctx) throw new Error("useProjects must be used within ProjectsProvider")
  return ctx
}
