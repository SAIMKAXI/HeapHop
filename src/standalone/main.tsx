// Standalone shell: the same interface without Next.js, as one script file.
// Used by the webview check. (The VS Code extension has its own entry in vscode-extension/webview.)
//
// A webview may not load a Worker from a file URL, so the Worker's code is embedded in
// this bundle as text and started from a Blob. The page's security policy needs
// `worker-src blob:` for that and nothing looser.
import { createRoot } from "react-dom/client";
import { Runner } from "@/runtime/runner";
import type { WorkerLike } from "@/runtime/protocol";
import { EditorShell } from "@/ui/editor/editor-shell";
import { applySavedTheme } from "@/ui/theme";

/** Replaced at build time with the bundled Worker script (scripts/build-standalone.mjs). */
declare const __WORKER_SOURCE__: string;

const workerUrl = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: "text/javascript" }));
const runner = new Runner(() => new Worker(workerUrl) as unknown as WorkerLike);

applySavedTheme();
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<EditorShell run={(code, options) => runner.run(code, options)} />);
}
