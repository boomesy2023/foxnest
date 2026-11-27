import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { isTauri } from "./lib/db";
import "./index.css";

if (!isTauri()) {
  registerSW({ immediate: true });
  if (navigator.storage?.persist) void navigator.storage.persist();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
