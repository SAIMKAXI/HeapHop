import type { Metadata } from "next";
import { Avatar } from "@/ui/site/avatar";
import { PageFrame } from "@/ui/site/page-frame";

export const metadata: Metadata = { title: "About", description: "Why HeapHop was made, and the team behind it." };

const TEAM = [
  { name: "M. Saim", kind: "boy", background: "#bfe3ee", shirt: "#1f5f8b" },
  { name: "Yemna Khan", kind: "girl", background: "#f6d6de", shirt: "#b2456b" },
  { name: "Muhammad Musa", kind: "boy", background: "#c9ead8", shirt: "#2e7d5b" },
  { name: "Eeman Athar Malik", kind: "girl", background: "#e3d9f5", shirt: "#6a4fb3" },
  { name: "Syeda Nazalia Zehra", kind: "girl", background: "#f8e2c4", shirt: "#c0702a" },
] as const;

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
      <ul data-reveal-children className="mt-6 grid gap-4 sm:grid-cols-2">
        {TEAM.map(({ name, kind, background, shirt }) => (
          <li key={name} data-team-member className="flex items-center gap-4 rounded-xl border-2 border-card-border bg-card p-4">
            <Avatar kind={kind} background={background} shirt={shirt} />
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
