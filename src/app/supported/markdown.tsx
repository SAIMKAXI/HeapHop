// Renders the small part of Markdown that docs/SUBSET.md uses: ## headings, paragraphs,
// tables, `code` and **bold**. Runs at build time only.
import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/).flatMap((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return <code key={i} className="rounded bg-foreground/10 px-1 py-px font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    return part.split(/(\*\*[^*]+\*\*)/).map((bit, j) =>
      bit.startsWith("**") && bit.endsWith("**") ? <strong key={`${i}-${j}`}>{bit.slice(2, -2)}</strong> : bit
    );
  });
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("## ")) {
      blocks.push(<h2 key={i} className="mt-8 mb-3 text-lg font-bold">{inline(line.slice(3))}</h2>);
      i++;
    } else if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      blocks.push(
        <div key={i} className="overflow-x-auto rounded-xl border-2 border-card-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-card"><tr>{cells(head).map((c, k) => <th key={k} className="px-3 py-2 font-semibold">{inline(c)}</th>)}</tr></thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k} className="border-t border-card-border">
                  {cells(r).map((c, m) => <td key={m} className={`px-3 py-2 align-top ${m === 2 && /^no\b/.test(c) ? "text-danger" : ""}`}>{inline(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("|")) para.push(lines[i++]);
      blocks.push(<p key={i} className="my-3 leading-relaxed text-muted-foreground">{inline(para.join(" "))}</p>);
    }
  }
  return blocks;
}
