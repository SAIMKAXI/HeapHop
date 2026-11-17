"use client";

// The editor screen: pick or write a program, give it input, run it.
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, AlignLeft, Check, ChevronDown, Copy, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { LessonEntry } from "@content/lessons";
import type { RunError } from "@/core/types";
import { AppHeader } from "@/ui/app-header";
import { cn } from "@/ui/utils";
import { CodeInput } from "./code-input";
import { SnippetList } from "./snippet-list";
import { codeOf, createSnippet, MAX_SNIPPETS, resetTab, setCode, titleOf, useEditorState } from "./snippet-store";
import { formatCpp } from "./text-edits";

interface CodeEditorProps {
  onRun: (code: string) => void;
  lessons: LessonEntry[];
  onStartLesson: (id: string) => void;
  /** Text the program will read with cin. */
  input: string;
  onInputChange: (input: string) => void;
  error: RunError | null;
  isRunning: boolean;
  /** Where the "What C++ is supported" page is, or nothing when the shell has none. */
  supportedHref?: string;
}

const READS_INPUT = /\b(cin|getline)\b/;
const kbd = "rounded border border-card-border bg-background px-1.5 py-0.5 font-mono text-[10px]";

function ToolButton({ onClick, disabled, title, danger, children }: { onClick: () => void; disabled?: boolean; title: string; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-30",
        danger ? "text-danger hover:bg-danger/10" : "text-muted-foreground hover:bg-card-border/30 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function CodeEditor({ onRun, lessons, onStartLesson, input, onInputChange, error, isRunning, supportedHref }: CodeEditorProps) {
  const state = useEditorState();
  const code = codeOf(state);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const canRun = !isRunning && code.trim() !== "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) {
        e.preventDefault();
        onRun(code);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRun, code, onRun]);

  const copy = () => navigator.clipboard.writeText(code).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  });
  const lineCount = code.split("\n").length;
  const list = { state, lessons, onStartLesson, busy: isRunning, renaming, onRenaming: setRenaming };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <AppHeader subtitle="Write or pick a C++ program, then run it to watch the stack and the heap" />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[280px] shrink-0 flex-col border-r-2 border-card-border bg-card/50 md:flex">
          <div className="flex items-center justify-between border-b border-card-border px-5 py-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Programs</h2>
            <button
              type="button"
              data-new-snippet
              onClick={() => setRenaming(createSnippet())}
              title={`Create a new snippet (${state.snippets.length}/${MAX_SNIPPETS})`}
              className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Plus size={13} aria-hidden /> New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto"><SnippetList {...list} /></div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="relative border-b border-card-border md:hidden">
            <button type="button" data-example-menu aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3 text-sm text-muted-foreground">
              <span>{titleOf(state)}</span>
              <ChevronDown size={16} aria-hidden />
            </button>
            {menuOpen && (
              <div className="absolute inset-x-0 top-full z-20 max-h-80 overflow-y-auto border-b border-card-border bg-card shadow-lg">
                <button type="button" onClick={() => { createSnippet(); setMenuOpen(false); }} className="flex w-full items-center gap-1.5 border-b border-card-border/30 px-5 py-3 text-left text-sm text-accent">
                  <Plus size={14} aria-hidden /> New snippet
                </button>
                <SnippetList {...list} compact onPicked={() => setMenuOpen(false)} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 border-b border-card-border/60 bg-code-bg px-4 py-2">
            <ToolButton onClick={() => setCode(formatCpp(code))} disabled={!code.trim()} title="Fix the indentation">
              <AlignLeft size={13} aria-hidden /> Format
            </ToolButton>
            <ToolButton onClick={copy} disabled={!code.trim()} title="Copy the code">
              {copied ? <Check size={13} className="text-success" aria-hidden /> : <Copy size={13} aria-hidden />}
              {copied ? "Copied!" : "Copy"}
            </ToolButton>
            <ToolButton onClick={resetTab} title="Go back to the original code">
              <RotateCcw size={13} aria-hidden /> Reset
            </ToolButton>
            <ToolButton onClick={() => setCode("")} disabled={!code.trim()} title="Remove all the code" danger>
              <Trash2 size={13} aria-hidden /> Clear
            </ToolButton>
            <span className="ml-auto text-[11px] text-muted">{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <CodeInput value={code} onChange={setCode} />
          </div>

          {error && (
            <div data-run-error role="alert" className="flex items-start gap-3 border-t-2 border-danger/30 bg-danger-dim px-5 py-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0 flex-1 text-sm text-danger">
                <pre className="whitespace-pre-wrap font-sans">{error.message}</pre>
                {error.kind === "unsupported" && supportedHref && (
                  <a href={supportedHref} className="mt-1 inline-block font-semibold underline underline-offset-2">See what C++ HeapHop supports</a>
                )}
              </div>
            </div>
          )}

          {READS_INPUT.test(code) && (
            <div className="border-t-2 border-card-border bg-card px-5 py-3">
              <label htmlFor="program-input" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Program input
                <span className="ml-2 font-normal normal-case tracking-normal text-muted">what you would type when the program asks. One value per cin, in order.</span>
              </label>
              <textarea
                id="program-input"
                data-program-input
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                rows={2}
                spellCheck={false}
                placeholder="for example: 1 10 1 20 2 0"
                className="w-full resize-y rounded-lg border-2 border-card-border bg-code-bg px-3 py-2 font-mono text-[13px] text-foreground outline-none placeholder:text-muted focus:border-accent"
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-4 border-t-2 border-card-border bg-card px-5 py-3.5">
            <p className="hidden text-xs text-muted sm:block">
              Structs, classes, pointers, new and delete, arrays, functions, loops, cin.
              {supportedHref && <> <a href={supportedHref} data-supported-link className="underline underline-offset-2 hover:text-accent">What C++ is supported</a></>}
              <span className="ml-3"><kbd className={kbd}>Ctrl</kbd> or <kbd className={kbd}>⌘</kbd> + <kbd className={kbd}>Enter</kbd> to run</span>
            </p>
            <button
              type="button"
              data-run
              onClick={() => onRun(code)}
              disabled={!canRun}
              className={cn(
                "ml-auto flex items-center gap-2.5 rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:shadow-none",
                isRunning ? "opacity-80" : "disabled:opacity-40"
              )}
            >
              {isRunning ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden /> : <Play size={16} aria-hidden />}
              {isRunning ? "Running..." : "Run & Visualize"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
