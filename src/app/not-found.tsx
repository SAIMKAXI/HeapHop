import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/ui/site/app-header";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center" data-not-found>
        <p className="font-mono text-sm text-accent">404 · null pointer</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">This page points nowhere.</h1>
        <p className="mt-3 max-w-md text-muted-foreground">The address doesn&apos;t lead to anything on HeapHop.</p>
        <Link href="/" className="mt-6 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">Back to the home page</Link>
      </main>
    </div>
  );
}
