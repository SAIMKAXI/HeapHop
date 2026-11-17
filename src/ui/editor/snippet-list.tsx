"use client";

// Everything the student can open: guided lessons, their own snippets, the examples.
// The sidebar shows it in full; the phone menu shows a compact version of the same list.
import { FileCode, Pencil, Trash2 } from "lucide-react";
import { EXAMPLES, GROUP_TITLES } from "@content/examples";
import type { LessonEntry } from "@content/lessons";
import { cn } from "@/ui/utils";
import { deleteSnippet, exampleTab, openTab, renameSnippet, type EditorState } from "./snippet-store";

interface SnippetListProps {
  state: EditorState;
  lessons: LessonEntry[];
  onStartLesson: (id: string) => void;
  busy: boolean;
  /** Phone menu: titles only, no renaming or deleting. */
  compact?: boolean;
  /** Called after something was chosen (the phone menu closes itself). */
  onPicked?: () => void;
  /** Snippet whose name is being edited, and how to change that. */
  renaming: string | null;
  onRenaming: (id: string | null) => void;
}

const groupHeading = "bg-card-border/20 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-muted";
const rowBase = "w-full border-b border-card-border/30 px-5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";
const rowTone = (active: boolean) => (active ? "bg-accent/10 text-foreground" : "text-muted-foreground hover:bg-card-border/20 hover:text-foreground");

export function SnippetList({ state, lessons, onStartLesson, busy, compact = false, onPicked, renaming, onRenaming: setRenaming }: SnippetListProps) {
  const pick = (tab: string) => { openTab(tab); onPicked?.(); };
  const itemAttr = compact ? "data-example-menu-item" : "data-example";

  return (
    <nav aria-label="Programs">
      {!compact && lessons.length > 0 && (
        <section data-lessons>
          <h3 className={groupHeading}>Guided lessons</h3>
          {lessons.map((l) => (
            <button key={l.id} type="button" data-lesson={l.id} disabled={busy} onClick={() => onStartLesson(l.id)} className={cn(rowBase, "py-3 hover:bg-accent/10")}>
              <span className="block text-sm font-semibold text-accent">{l.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">{l.summary}</span>
            </button>
          ))}
        </section>
      )}

      {state.snippets.length > 0 && (
        <section>
          <h3 className={groupHeading}>Your code</h3>
          {state.snippets.map((s) => (
            <div key={s.id} data-snippet className={cn("group flex items-center", rowTone(state.tab === s.id))}>
              {renaming === s.id && !compact ? (
                <input
                  autoFocus
                  defaultValue={s.title}
                  aria-label="Snippet name"
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => { renameSnippet(s.id, e.target.value); setRenaming(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="mx-5 my-2.5 min-w-0 flex-1 rounded border border-accent/40 bg-background/50 px-1.5 py-0.5 text-sm font-semibold outline-none focus:border-accent"
                />
              ) : (
                <button type="button" onClick={() => pick(s.id)} className={cn(rowBase, "flex min-w-0 flex-1 items-center gap-2 border-b-0 py-3")}>
                  <FileCode size={14} className="shrink-0 text-accent" aria-hidden />
                  <span className="truncate text-sm font-semibold">{s.title}</span>
                </button>
              )}
              {!compact && renaming !== s.id && (
                <span className="flex shrink-0 gap-0.5 pr-3 opacity-60 group-focus-within:opacity-100 group-hover:opacity-100">
                  <button type="button" aria-label={`Rename ${s.title}`} title="Rename" onClick={() => setRenaming(s.id)} className="rounded p-1 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">
                    <Pencil size={12} />
                  </button>
                  <button type="button" data-delete-snippet aria-label={`Delete ${s.title}`} title="Delete" onClick={() => deleteSnippet(s.id)} className="rounded p-1 hover:text-danger focus-visible:outline-2 focus-visible:outline-danger">
                    <Trash2 size={12} />
                  </button>
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      {EXAMPLES.map((ex, i) => (
        <div key={ex.id}>
          {(i === 0 || EXAMPLES[i - 1].group !== ex.group) && <h3 className={groupHeading}>{GROUP_TITLES[ex.group]}</h3>}
          <button
            type="button"
            {...{ [itemAttr]: ex.id }}
            aria-current={state.tab === exampleTab(ex.id) || undefined}
            onClick={() => pick(exampleTab(ex.id))}
            className={cn(rowBase, compact ? "py-3 text-sm" : "py-4", rowTone(state.tab === exampleTab(ex.id)))}
          >
            <span className="block text-sm font-semibold">{ex.title}</span>
            {!compact && <span className="mt-1 block whitespace-pre-line text-xs leading-relaxed text-muted">{ex.description}</span>}
          </button>
        </div>
      ))}
    </nav>
  );
}
