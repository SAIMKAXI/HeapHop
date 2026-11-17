"use client";

// The whole interface as one component, with no knowledge of where it is hosted.
// The website (src/app) and the standalone bundle (src/standalone, used by the VS Code
// webview) each pass in their own way of running a program.
import { useState } from "react";
import type { RunError, RunResult, Trace } from "@/core/types";
import type { Lesson } from "@/core/learn";
import { LESSONS } from "@content/lessons";
import { CodeEditor } from "@/ui/editor/code-editor";
import { Visualizer } from "@/ui/visualizer/visualizer";

interface AppShellProps {
  /** Runs a program off the main thread and resolves with its trace or an error. */
  run: (code: string, options: { input: string }) => Promise<RunResult>;
  /** Link to the "What C++ is supported" page, when the shell has one. */
  supportedHref?: string;
}

interface Shown {
  trace: Trace;
  lesson: Lesson | null;
}

export function AppShell({ run, supportedHref }: AppShellProps) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [error, setError] = useState<RunError | null>(null);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  /** Runs `code` and shows its trace, or the reason it could not run. */
  async function start(code: string, programInput: string, lesson: Lesson | null) {
    setIsRunning(true);
    setError(null);
    const result = await run(code, { input: programInput });
    if (!result.ok && result.error.kind === "cancelled") return; // a newer run is on its way
    setIsRunning(false);
    if (result.ok) setShown({ trace: result.trace, lesson });
    else setError(result.error);
  }

  // A lesson brings its own program and input; its file is loaded only now.
  async function startLesson(id: string) {
    const entry = LESSONS.find((l) => l.id === id);
    if (!entry) return;
    try {
      const lesson = await entry.load();
      await start(lesson.code, lesson.input ?? "", lesson);
    } catch {
      setIsRunning(false);
      setError({ kind: "internal", message: "This lesson could not be loaded." });
    }
  }

  if (shown) {
    return <Visualizer key={shown.lesson?.id ?? "run"} trace={shown.trace} lesson={shown.lesson ?? undefined} onBack={() => setShown(null)} />;
  }
  return (
    <CodeEditor
      onRun={(code) => start(code, input, null)}
      lessons={LESSONS}
      onStartLesson={startLesson}
      input={input}
      onInputChange={setInput}
      error={error}
      isRunning={isRunning}
      supportedHref={supportedHref}
    />
  );
}
