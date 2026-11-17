import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Editor",
  description: "Write your own C++ linked-list or tree program and step through it forwards and backwards.",
};

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
