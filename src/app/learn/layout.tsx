import type { Metadata } from "next";
import { requireViewer } from "@/server/session";

export const metadata: Metadata = {
  title: "Learn",
  description: "Guided lessons on sorting, linked lists, stacks, queues, binary search trees, AVL trees, heaps and graphs, with questions that ask you to predict the next pointer.",
};

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  // An account is required. The proxy checks first; this checks again on the server.
  await requireViewer("/learn");
  return children;
}
