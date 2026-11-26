// The frame of every page that is read rather than used: header, content, footer.
// With a title, the content is set as a single readable column under that heading. With a
// title and a scene, the page gets a full-width header (title on the left, a live 3D picture on
// the right) and the content below uses the full width. Either way each block fades in as it
// scrolls into view (see scroll-reveal.tsx).
import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { Logo } from "./logo";
import { ScrollReveal } from "./scroll-reveal";
import { FOOTER_LINKS, type SitePage } from "./links";

interface PageFrameProps {
  current: SitePage;
  title?: string;
  /** One paragraph under the title. */
  intro?: ReactNode;
  /** A live picture for the right of a full-width header (with a title). */
  scene?: ReactNode;
  children: ReactNode;
}

export function PageFrame({ current, title, intro, scene, children }: PageFrameProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader current={current} />
      <main className="flex-1">
        {title && scene ? (
          <>
            <header data-page-hero className="border-b-2 border-card-border bg-[radial-gradient(ellipse_at_80%_40%,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_60%)]">
              <div className="mx-auto grid max-w-6xl items-center gap-6 px-5 py-10 sm:py-12 lg:grid-cols-[1fr_minmax(0,32rem)]">
                <div data-reveal-children>
                  <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
                  {intro && <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">{intro}</p>}
                  <span className="mt-6 block h-1 w-16 rounded-full bg-accent" aria-hidden />
                </div>
                <div className="h-56 sm:h-72 lg:h-80" data-page-scene-box>{scene}</div>
              </div>
            </header>
            <div className="mx-auto max-w-6xl px-5 py-10 sm:py-12">{children}</div>
          </>
        ) : title ? (
          <article data-reveal-children className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            {intro && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{intro}</p>}
            <div data-reveal-children className="mt-8">{children}</div>
          </article>
        ) : children}
      </main>
      <footer className="border-t-2 border-card-border bg-card px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Logo size={22} />
            <span><span className="font-bold text-foreground">HeapHop</span> · made by Cyber Security students at Air University</span>
          </p>
          <nav aria-label="More pages" className="flex flex-wrap gap-x-5 gap-y-0 text-sm lg:gap-y-2">
            {FOOTER_LINKS.map((l) => (
              <a key={l.href} href={l.href} aria-current={l.page && current === l.page ? "page" : undefined} className="inline-flex min-h-10 min-w-10 items-center justify-center text-muted-foreground underline-offset-4 hover:text-accent hover:underline lg:min-h-0 lg:min-w-0">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
      <ScrollReveal />
    </div>
  );
}
