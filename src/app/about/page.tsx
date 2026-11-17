import type { Metadata } from "next";
import { PageFrame } from "@/ui/site/page-frame";

export const metadata: Metadata = { title: "About", description: "Why HeapHop was made, and the team behind it." };

const TEAM = ["M. Saim", "Yemna Khan", "Muhammad Musa", "Eeman Athar Malik", "Syeda Nazalia Zehra"];
const initials = (name: string) => name.replace(/\./g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("");

const h2 = "mt-12 text-xl font-bold";
const p = "mt-3 leading-relaxed text-muted-foreground";

export default function AboutPage() {
  return (
    <PageFrame
      current="about"
      title="About HeapHop"
      intro="HeapHop shows what a C++ program does to memory, one statement at a time, so that pointers stop being invisible."
    >
      <h2 className="text-xl font-bold">Why we made it</h2>
      <p className={p}>
        Linked lists and trees are where many students first get stuck in a data-structures course. The code is short,
        but what it does happens in memory, where you cannot see it: a pointer moves, an arrow is redirected, a node is
        lost. We wanted a tool that draws exactly that, for the programs students actually write in their labs, and that
        explains each step in plain words.
      </p>
      <p className={p}>
        HeapHop is our Data Structures semester project. It runs entirely in the browser, has no accounts, and does not
        collect any data.
      </p>

      <h2 className={h2}>The team</h2>
      <p className={p}>Cyber Security undergraduate students at Air University, Islamabad.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {TEAM.map((name) => (
          <li key={name} data-team-member className="flex items-center gap-4 rounded-xl border-2 border-card-border bg-card p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent" aria-hidden>
              {initials(name)}
            </span>
            <span>
              <span className="block font-semibold">{name}</span>
              <span className="block text-sm text-muted-foreground">BS Cyber Security, Air University</span>
            </span>
          </li>
        ))}
      </ul>
    </PageFrame>
  );
}
