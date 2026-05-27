import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.scss";

// Apply the persisted theme before React mounts so the first paint matches
// the user's preference (no light→dark flash).
try {
  const raw = localStorage.getItem("scribbly:ui");
  if (raw) {
    const parsed = JSON.parse(raw) as { state?: { theme?: string } };
    const t = parsed.state?.theme;
    if (t === "dark" || t === "light") {
      document.documentElement.dataset.theme = t;
    }
  }
} catch {
  // Persisted state missing or malformed — fall back to light default.
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
