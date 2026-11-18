import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageFrame } from "@/ui/site/page-frame";

export const metadata: Metadata = { title: "FAQ", description: "Questions about HeapHop: what it runs, where your code goes, and what the pictures mean." };

const link = "font-semibold text-accent underline-offset-4 hover:underline";

const QUESTIONS: { q: string; a: ReactNode }[] = [
  {
    q: "What is HeapHop?",
    a: "A tool that runs a C++ program one statement at a time and draws what happens in memory: the stack frames, every object created with new, and every pointer between them. It is made for the linked-list and tree programs of a first data-structures course.",
  },
  {
    q: "Should I start with Learn or with the Editor?",
    a: <>If the topic is new to you, start with <a href="/learn" className={link}>Learn</a>: the lessons pause at the important moments and ask you questions. If you already have a program, such as a lab task, open the <a href="/editor" className={link}>Editor</a>, paste it and press Run.</>,
  },
  {
    q: "Do I need to install anything or make an account?",
    a: "No. HeapHop runs in the browser, on a computer or a phone. There are no accounts.",
  },
  {
    q: "Is my code sent to a server?",
    a: <>No. Your program is run inside your own browser, in a background thread of the page. It is never uploaded. See the <a href="/privacy" className={link}>privacy policy</a>.</>,
  },
  {
    q: "Can it run any C++ program?",
    a: <>No. HeapHop does not compile C++; it runs a part of the language that covers structs, classes, pointers, new and delete, arrays, functions, loops, recursion and cin. Templates, the STL (vector, list, stack, queue) and inheritance are not supported. The full list is on <a href="/supported" className={link}>What C++ is supported</a>.</>,
  },
  {
    q: "My program stopped with “is not supported yet”. What now?",
    a: "The message names the line HeapHop could not run. Rewrite that line with the constructs on the supported list, for example a pointer and new instead of a vector. HeapHop stops rather than guess, so a picture is never drawn from code it did not understand.",
  },
  {
    q: "Does it print the same output as a real compiler?",
    a: "For supported programs, yes. The test programs, including real lab programs, print exactly what g++ prints. The one difference is on purpose: where real C++ would crash or behave unpredictably (a null pointer, a use after delete), HeapHop stops at that line and explains what went wrong.",
  },
  {
    q: "My program reads input with cin. How do I give it input?",
    a: "When the code contains cin, a Program input box appears under the editor. Type everything the program will read before you press Run, in order, separated by spaces or new lines. If the input runs out, HeapHop stops and tells you which line was waiting.",
  },
  {
    q: "What happens with an infinite loop?",
    a: "The run stops after 2000 steps, 500 rounds of one loop or 64 nested calls, and every step before that stays visible, so you can see where the loop went wrong.",
  },
  {
    q: "What is the little robot doing?",
    a: "When you step one line at a time, the robot acts out what that line did: it drags a pointer's arrow to its new node, brings a node created with new into place, carries a deleted node away, and follows pointers like cur from node to node. In trees it flies on rocket boots and returns to its corner after each move. During auto-play, or when you jump on the timeline, it waits in its corner. The robot button in the canvas toolbar switches it off, and it starts off on devices set to reduce motion.",
  },
  {
    q: "What do the colours and dashed boxes mean?",
    a: "A node with a red dashed border can no longer be reached from any pointer: it has leaked. A pointer marked dangling still holds the address of an object that was deleted. Orange arrows are next pointers and blue arrows are prev pointers; in a tree, the branches join each node to its children. The small labels above a node show which variables point at it.",
  },
  {
    q: "Where are my programs saved?",
    a: "In your browser's local storage on this device. They stay after you close the tab, but they are not copied to other devices, and clearing the site's data in your browser removes them.",
  },
  {
    q: "Who made HeapHop?",
    a: <>A team of Cyber Security students at Air University. See <a href="/about" className={link}>About</a>.</>,
  },
];

export default function FaqPage() {
  return (
    <PageFrame current="faq" title="Frequently asked questions">
      <div className="divide-y-2 divide-card-border border-y-2 border-card-border">
        {QUESTIONS.map(({ q, a }) => (
          <details key={q} data-faq className="group py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded py-4 font-semibold focus-visible:outline-2 focus-visible:outline-accent">
              {q}
              <span className="text-xl leading-none text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <div className="pb-5 leading-relaxed text-muted-foreground">{a}</div>
          </details>
        ))}
      </div>
    </PageFrame>
  );
}
