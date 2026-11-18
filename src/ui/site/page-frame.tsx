// The frame of every page that is read rather than used: header, content, footer.
// With a title, the content is set as a single readable column under that heading.
import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { Logo } from "./logo";
import { FOOTER_LINKS, type SitePage } from "./links";

interface PageFrameProps {
  current: SitePage;
  title?: string;
  /** One paragraph under the title. */
  intro?: ReactNode;
  children: ReactNode;
}

export function PageFrame({ current, title, intro, children }: PageFrameProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader current={current} />
      <main className="flex-1">
        {title ? (
          <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            {intro && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{intro}</p>}
            <div className="mt-8">{children}</div>
          </article>
        ) : children}
      </main>
      <footer className="border-t-2 border-card-border bg-card px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Logo size={22} />
            <span><span className="font-bold text-foreground">HeapHop</span> · made by Cyber Security students at Air University</span>
          </p>
          <nav aria-label="More pages" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {FOOTER_LINKS.map((l) => (
              <a key={l.page} href={l.href} aria-current={current === l.page ? "page" : undefined} className="text-muted-foreground underline-offset-4 hover:text-accent hover:underline">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
