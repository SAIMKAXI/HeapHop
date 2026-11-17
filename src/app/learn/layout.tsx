import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn",
  description: "Guided lessons on linked lists and binary trees, with questions that ask you to predict the next pointer.",
};

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return children;
}
