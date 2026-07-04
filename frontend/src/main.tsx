import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"

// Follow the OS light/dark preference.
const setTheme = (dark: boolean) =>
  document.documentElement.classList.toggle("dark", dark)
const mq = window.matchMedia("(prefers-color-scheme: dark)")
setTheme(mq.matches)
mq.addEventListener("change", (e) => setTheme(e.matches))

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
