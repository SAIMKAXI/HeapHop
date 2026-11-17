"use client";

// The editor with its visualizer, with no knowledge of where it is hosted. The website
// (src/app/editor) and the standalone bundle (src/standalone, used by the VS Code
// webview) each pass in their own way of running a program.
import { useState } from "react";
import type { RunError, RunResult, Trace } from "@/core/types";
import { Visualizer } from "@/ui/visualizer/visualizer";
import { CodeEditor } from "./code-editor";

export type RunFn = (code: string, options: { input: string }) => Promise<RunResult>;

export function EditorShell({ run }: { run: RunFn }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<RunError | null>(null);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  async function start(code: string) {
    setIsRunning(true);
    setError(null);
    const result = await run(code, { input });
    if (!result.ok && result.error.kind === "cancelled") return; // a newer run is on its way
    setIsRunning(false);
    if (result.ok) setTrace(result.trace);
    else setError(result.error);
  }

  if (trace) return <Visualizer trace={trace} current="editor" backLabel="Editor" onBack={() => setTrace(null)} />;
  return <CodeEditor onRun={start} input={input} onInputChange={setInput} error={error} isRunning={isRunning} />;
}
