"use client";

// The student's own programs. The sidebar shows them with rename and delete; the phone
// menu shows the titles only.
import { FileCode, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/ui/utils";
import { deleteSnippet, openTab, renameSnippet, type EditorState } from "./snippet-store";

interface SnippetListProps {
  state: EditorState;
  /** Phone menu: titles only, no renaming or deleting. */
  compact?: boolean;
  /** Called after something was chosen (the phone menu closes itself). */
  onPicked?: () => void;
  /** Snippet whose name is being edited, and how to change that. */
  renaming: string | null;
  onRenaming: (id: string | null) => void;
}

const rowBase = "w-full border-b border-card-border/30 px-5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";
const rowTone = (active: boolean) => (active ? "bg-accent/10 text-foreground" : "text-muted-foreground hover:bg-card-border/20 hover:text-foreground");

export function SnippetList({ state, compact = false, onPicked, renaming, onRenaming: setRenaming }: SnippetListProps) {
  const pick = (tab: string) => { openTab(tab); onPicked?.(); };

  return (
    <nav aria-label="Your programs">
      {state.snippets.map((s) => (
        <div key={s.id} data-snippet={s.id} aria-current={state.tab === s.id || undefined} className={cn("group flex items-center", rowTone(state.tab === s.id))}>
          {renaming === s.id && !compact ? (
            <input
              autoFocus
              defaultValue={s.title}
              aria-label="Program name"
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
              <button type="button" aria-label={`Rename ${s.title}`} title="Rename" onClick={() => setRenaming(s.id)} className="flex h-10 w-10 items-center justify-center rounded hover:text-accent focus-visible:outline-2 focus-visible:outline-accent lg:h-auto lg:w-auto lg:p-1">
                <Pencil size={12} />
              </button>
              <button type="button" data-delete-snippet aria-label={`Delete ${s.title}`} title="Delete" onClick={() => deleteSnippet(s.id)} className="flex h-10 w-10 items-center justify-center rounded hover:text-danger focus-visible:outline-2 focus-visible:outline-danger lg:h-auto lg:w-auto lg:p-1">
                <Trash2 size={12} />
              </button>
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
