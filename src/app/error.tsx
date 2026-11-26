"use client";
// Shown when a page fails while it is being shown. The header stays, so the visitor can go
// anywhere else; Try again renders the page once more. Nothing about the error is shown or sent.
import Link from "next/link";
import { AppHeader } from "@/ui/site/app-header";

export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center" data-page-error>
        <p className="font-mono text-sm text-accent">error · unexpected crash</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Something went wrong on this page.</h1>
        <p className="mt-3 max-w-md text-muted-foreground">It&apos;s our fault, not your code. Try again, or go back to the home page.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="inline-flex min-h-10 items-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" data-retry>
            Try again
          </button>
          <Link href="/" className="inline-flex min-h-10 items-center rounded-full border-2 border-card-border px-5 py-2 text-sm font-semibold hover:border-accent hover:text-accent">
            Home page
          </Link>
        </div>
      </main>
    </div>
  );
}
