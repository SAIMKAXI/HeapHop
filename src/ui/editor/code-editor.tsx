"use client";

// The editor screen: write a program, give it input, run it.
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, AlignLeft, Check, ChevronDown, Copy, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { RunError } from "@/core/types";
import { AppHeader } from "@/ui/site/app-header";
import { useOnWebsite } from "@/ui/site/website";
import { cn } from "@/ui/utils";
import { CodeInput } from "./code-input";
import { SnippetList } from "./snippet-list";
import { codeOf, createSnippet, MAX_SNIPPETS, resetTab, setCode, titleOf, useEditorState } from "./snippet-store";
import { formatCpp } from "./text-edits";
import { EXTENSION_HREF } from "@/ui/site/links";

interface CodeEditorProps {
  onRun: (code: string) => void;
  /** Text the program will read with cin. */
  input: string;
  onInputChange: (input: string) => void;
  error: RunError | null;
  isRunning: boolean;
}

const SUPPORTED_HREF = "/supported";

const READS_INPUT = /\b(cin|getline)\b/;
const kbd = "rounded border border-card-border bg-background px-1.5 py-0.5 font-mono text-[0.625rem]";

function ToolButton({ onClick, disabled, title, danger, children }: { onClick: () => void; disabled?: boolean; title: string; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.75rem] font-medium transition-colors lg:min-h-0 lg:min-w-0 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-30",
        danger ? "text-danger hover:bg-danger/10" : "text-muted-foreground hover:bg-card-border/30 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function CodeEditor({ onRun, input, onInputChange, error, isRunning }: CodeEditorProps) {
  const state = useEditorState();
  const onWebsite = useOnWebsite();
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
  const list = { state, renaming, onRenaming: setRenaming };

  return (
    <div className="flex h-dvh flex-col bg-background">
      <AppHeader current="editor" />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-70 shrink-0 flex-col border-r-2 border-card-border bg-card/50 md:flex">
          <div className="flex items-center justify-between border-b border-card-border px-5 py-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Your programs</h2>
            <button
              type="button"
              data-new-snippet
              onClick={() => setRenaming(createSnippet())}
              title={`Start a new program (${state.snippets.length}/${MAX_SNIPPETS})`}
              className="flex min-h-10 items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-[0.6875rem] font-semibold text-accent lg:min-h-0 lg:px-2.5 transition-colors hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Plus size={13} aria-hidden /> New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto"><SnippetList {...list} /></div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="relative border-b border-card-border md:hidden">
            <button type="button" data-program-menu aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3 text-sm text-muted-foreground">
              <span>{titleOf(state)}</span>
              <ChevronDown size={16} aria-hidden />
            </button>
            {menuOpen && (
              <div className="absolute inset-x-0 top-full z-20 max-h-80 overflow-y-auto border-b border-card-border bg-card shadow-lg">
                <button type="button" onClick={() => { createSnippet(); setMenuOpen(false); }} className="flex w-full items-center gap-1.5 border-b border-card-border/30 px-5 py-3 text-left text-sm text-accent">
                  <Plus size={14} aria-hidden /> New program
                </button>
                <SnippetList {...list} compact onPicked={() => setMenuOpen(false)} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 border-b border-card-border/60 bg-code-bg px-2 py-1.5 sm:gap-1.5 sm:px-4 sm:py-2">
            <ToolButton onClick={() => setCode(formatCpp(code))} disabled={!code.trim()} title="Fix the indentation">
              <AlignLeft size={13} aria-hidden /> <span className="max-sm:sr-only">Format</span>
            </ToolButton>
            <ToolButton onClick={copy} disabled={!code.trim()} title="Copy the code">
              {copied ? <Check size={13} className="text-success" aria-hidden /> : <Copy size={13} aria-hidden />}
              <span className="max-sm:sr-only">{copied ? "Copied!" : "Copy"}</span>
            </ToolButton>
            <ToolButton onClick={resetTab} title="Go back to the starter code">
              <RotateCcw size={13} aria-hidden /> <span className="max-sm:sr-only">Reset</span>
            </ToolButton>
            <ToolButton onClick={() => setCode("")} disabled={!code.trim()} title="Remove all the code" danger>
              <Trash2 size={13} aria-hidden /> <span className="max-sm:sr-only">Clear</span>
            </ToolButton>
            <span className="ml-auto text-[0.6875rem] text-muted">{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <CodeInput value={code} onChange={setCode} />
          </div>

          {error && (
            <div data-run-error role="alert" className="flex items-start gap-3 border-t-2 border-danger/30 bg-danger-dim px-5 py-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0 flex-1 text-sm text-danger">
                <pre className="whitespace-pre-wrap font-sans">{error.message}</pre>
                {error.kind === "unsupported" && onWebsite && (
                  <>
                    <a href={SUPPORTED_HREF} className="mt-1 inline-block font-semibold underline underline-offset-2">See what C++ HeapHop supports</a>
                    <p data-extension-hint className="mt-1 text-foreground/80">
                      The <a href={EXTENSION_HREF} className="font-semibold underline underline-offset-2">HeapHop extension for VS Code</a> runs much more C++, such as vectors, maps, templates and inheritance.
                    </p>
                  </>
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
                className="w-full resize-y rounded-lg border-2 border-card-border bg-code-bg px-3 py-2 font-mono text-[0.8125rem] text-foreground outline-none placeholder:text-muted focus:border-accent"
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t-2 border-card-border bg-card px-4 py-3 sm:gap-4 sm:px-5 sm:py-3.5">
            {onWebsite && <a href={SUPPORTED_HREF} className="inline-flex min-h-10 items-center text-xs text-muted underline underline-offset-2 hover:text-accent sm:hidden">Supported C++</a>}
            <p className="hidden text-xs text-muted sm:block">
              Structs, classes, pointers, new and delete, arrays, functions, loops, cin.
              {onWebsite && <> <a href={SUPPORTED_HREF} data-supported-link className="underline underline-offset-2 hover:text-accent">What C++ is supported</a></>}
              <span className="ml-3"><kbd className={kbd}>Ctrl</kbd> or <kbd className={kbd}>⌘</kbd> + <kbd className={kbd}>Enter</kbd> to run</span>
            </p>
            <button
              type="button"
              data-run
              onClick={() => onRun(code)}
              disabled={!canRun}
              className={cn(
                "ml-auto flex items-center gap-2.5 rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-on-accent shadow-lg shadow-accent/20 transition-all hover:bg-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:shadow-none",
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
