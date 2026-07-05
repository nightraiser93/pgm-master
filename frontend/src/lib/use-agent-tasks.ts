import { useEffect, useState } from "react"
import { api } from "@/lib/api"

/** `root|taskId` keys for every ticket currently claimed by an active agent session. */
export function useAgentTaskKeys(): Set<string> {
  const [keys, setKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function reload() {
      const agents = await api.agents().catch(() => [])
      setKeys(
        new Set(
          agents.filter((a) => a.root && a.taskId).map((a) => `${a.root}|${a.taskId}`),
        ),
      )
    }
    reload()
    const t = setInterval(reload, 5000)
    return () => clearInterval(t)
  }, [])

  return keys
}
