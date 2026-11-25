// Entry point of the HeapHop panel inside VS Code.
//
// A webview cannot load a Worker from a file, so the Worker's code is embedded in this
// bundle as text and started from a Blob. The panel's security policy allows
// `worker-src blob:` for that and nothing looser.
import { createRoot } from "react-dom/client";
import { Runner } from "@/runtime/runner";
import type { WorkerLike } from "@/runtime/protocol";
import { App } from "./app";

/** Replaced at build time with the bundled Worker script (scripts/build.mjs). */
declare const __WORKER_SOURCE__: string;

const workerUrl = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: "text/javascript" }));
const runner = new Runner(() => new Worker(workerUrl) as unknown as WorkerLike);

/** Follow VS Code's theme: it marks the webview's <body> with vscode-light, vscode-dark... */
function followTheme() {
  const c = document.body.classList;
  const light = c.contains("vscode-light") || c.contains("vscode-high-contrast-light");
  document.documentElement.classList.toggle("light", light);
  document.documentElement.classList.toggle("dark", !light);
  document.documentElement.dataset.vscodeTheme = c.contains("vscode-high-contrast") || c.contains("vscode-high-contrast-light") ? "high-contrast" : light ? "light" : "dark";
}
followTheme();
new MutationObserver(followTheme).observe(document.body, { attributes: true, attributeFilter: ["class"] });

const root = document.getElementById("root");
if (root) createRoot(root).render(<App run={(code, input) => runner.run(code, { input })} />);
