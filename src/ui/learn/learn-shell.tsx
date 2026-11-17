"use client";

// The Learn section: the list of lessons and examples, or the one the address names.
import { useEffect, useState } from "react";
import type { Trace } from "@/core/types";
import type { Lesson } from "@/core/learn";
import { EXAMPLES } from "@content/examples";
import { LESSONS } from "@content/lessons";
import type { RunFn } from "@/ui/editor/editor-shell";
import { PageFrame } from "@/ui/site/page-frame";
import { Visualizer } from "@/ui/visualizer/visualizer";
import { backToList, hrefOf, usePick, type Pick } from "./address";
import { LearnHome } from "./learn-home";

async function programOf(pick: Pick): Promise<{ code: string; input: string; lesson?: Lesson }> {
  if (pick.kind === "example") {
    const example = EXAMPLES.find((e) => e.id === pick.id);
    if (!example) throw new Error(`There is no example called "${pick.id}".`);
    return { code: example.code, input: "" };
  }
  const entry = LESSONS.find((l) => l.id === pick.id);
  if (!entry) throw new Error(`There is no lesson called "${pick.id}".`);
  const lesson = await entry.load();
  return { code: lesson.code, input: lesson.input ?? "", lesson };
}

type Shown = { href: string } & ({ trace: Trace; lesson?: Lesson } | { error: string });

export function LearnShell({ run }: { run: RunFn }) {
  const pick = usePick();
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (!pick) return;
    let current = true;
    const href = hrefOf(pick);
    (async () => {
      try {
        const program = await programOf(pick);
        const result = await run(program.code, { input: program.input });
        if (!current || (!result.ok && result.error.kind === "cancelled")) return;
        setShown(result.ok ? { href, trace: result.trace, lesson: program.lesson } : { href, error: result.error.message });
      } catch (e) {
        if (current) setShown({ href, error: e instanceof Error ? e.message : "This lesson could not be loaded." });
      }
    })();
    return () => { current = false; };
  }, [pick, run]);

  if (!pick) return <PageFrame current="learn"><LearnHome /></PageFrame>;
  if (shown?.href === hrefOf(pick) && "trace" in shown) {
    return <Visualizer key={shown.href} trace={shown.trace} lesson={shown.lesson} current="learn" backLabel="Learn" onBack={backToList} />;
  }
  const failed = shown?.href === hrefOf(pick) && "error" in shown ? shown.error : null;
  return (
    <PageFrame current="learn">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-5 py-24 text-center" role={failed ? "alert" : "status"}>
        {failed ? (
          <>
            <p data-run-error className="text-danger">{failed}</p>
            <button type="button" onClick={backToList} className="rounded-lg border border-card-border px-4 py-2 text-sm font-semibold hover:border-accent hover:text-accent">Back to the lessons</button>
          </>
        ) : (
          <>
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-hidden />
            <p className="text-sm text-muted-foreground">Running the program…</p>
          </>
        )}
      </div>
    </PageFrame>
  );
}
