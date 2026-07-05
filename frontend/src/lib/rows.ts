import { useMemo } from "react"
import { useProjects } from "@/lib/projects-context"
import type { Ticket } from "@/lib/api"

export type Row = Ticket & {
  projectKey: string
  projectName: string
  root: string
  jiraBase: string
}

/** Flattens every non-errored project's tickets into one list, tagged with project info. */
export function useTaskRows(): Row[] {
  const { projects } = useProjects()
  return useMemo(
    () =>
      projects
        .filter((p) => !p.error)
        .flatMap((p) =>
          p.tickets.map((t) => ({
            ...t,
            projectKey: p.key,
            projectName: p.name,
            root: p.root,
            jiraBase: p.jira_base ?? "",
          })),
        ),
    [projects],
  )
}
