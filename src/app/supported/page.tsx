// "What C++ is supported". Generated at build time from docs/SUBSET.md, so the
// page and the document cannot disagree. Error messages about unsupported C++ link here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { AppHeader } from "@/ui/app-header";
import { Markdown } from "./markdown";

export const metadata: Metadata = { title: "What C++ is supported · HeapHop" };

export default function SupportedPage() {
  const subset = readFileSync(join(process.cwd(), "docs", "SUBSET.md"), "utf8");
  const sections = subset.slice(subset.indexOf("\n## ") + 1);
  return (
    <div className="min-h-dvh bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-5 py-8">
        <a href="./" className="text-sm text-accent underline underline-offset-2">Back to the editor</a>
        <h1 className="mt-4 text-2xl font-bold">What C++ HeapHop supports</h1>
        <p className="my-3 leading-relaxed text-muted-foreground">
          HeapHop does not compile your code. It runs a part of C++ that covers the linked-list, stack, queue and
          tree programs of a first data-structures course. Anything outside that part stops with a message that
          names the line, so a picture is never drawn from code HeapHop did not understand.
        </p>
        <Markdown source={sections} />
      </main>
    </div>
  );
}
