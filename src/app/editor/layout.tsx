import type { Metadata } from "next";
import { requireViewer } from "@/server/session";

export const metadata: Metadata = {
  title: "Editor",
  description: "Write your own C++ linked-list or tree program and step through it forwards and backwards.",
};

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  // An account is required. The proxy checks first; this checks again on the server.
  await requireViewer("/editor");
  return children;
}
