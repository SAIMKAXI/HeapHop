// "What C++ is supported". Generated at build time from docs/SUBSET.md, so the
// page and the document cannot disagree. Error messages about unsupported C++ link here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { PageFrame } from "@/ui/site/page-frame";
import { Markdown } from "./markdown";

export const metadata: Metadata = { title: "What C++ is supported · HeapHop" };

export default function SupportedPage() {
  const subset = readFileSync(join(process.cwd(), "docs", "SUBSET.md"), "utf8");
  const sections = subset.slice(subset.indexOf("\n## ") + 1);
  return (
    <PageFrame
      current="supported"
      title="What C++ HeapHop supports"
      intro="HeapHop does not compile your code. It runs a part of C++ that covers the linked-list, stack, queue and tree programs of a first data-structures course. Anything outside that part stops with a message that names the line, so a picture is never drawn from code HeapHop did not understand."
    >
      <Markdown source={sections} />
    </PageFrame>
  );
}
