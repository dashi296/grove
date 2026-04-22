import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import "./shared/tokens.css";

const container = document.getElementById("root");

if (container === null) {
  throw new Error("Desktop root container was not found.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
