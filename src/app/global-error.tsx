"use client";
// Shown only if the site's own frame fails, so it brings its own <html> and styles and uses
// nothing else from the site. Nothing about the error is shown or sent.
import "./globals.css";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 text-center text-foreground antialiased" data-global-error>
        <p className="font-mono text-sm text-accent">HeapHop</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Something went wrong.</h1>
        <p className="mt-3 max-w-md text-muted-foreground">HeapHop couldn&apos;t load. Try again in a moment.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="inline-flex min-h-10 items-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90">
            Try again
          </button>
          {/* A full page load, on purpose: the app around this page is what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="inline-flex min-h-10 items-center rounded-full border-2 border-card-border px-5 py-2 text-sm font-semibold hover:border-accent">
            Home page
          </a>
        </div>
      </body>
    </html>
  );
}
