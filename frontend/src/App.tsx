import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { Projects } from "@/pages/Projects"
import { Tasks } from "@/pages/Tasks"
import { Review } from "@/pages/Review"
import { Agents } from "@/pages/Agents"
import { ProjectsProvider } from "@/lib/projects-context"

export default function App() {
  return (
    <ProjectsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Projects />} />
            <Route path="/review" element={<Review />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/agents" element={<Agents />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ProjectsProvider>
  )
}
