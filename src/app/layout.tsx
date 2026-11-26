import type { Metadata } from "next";
import { headers } from "next/headers";
import { getViewer } from "@/server/session";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SAVED_THEME_SCRIPT } from "@/ui/theme-script";
import { REVEAL_READY_SCRIPT } from "@/ui/site/reveal-script";
import { NAV_START_SCRIPT } from "@/ui/site/nav-history";
import { WebsiteProvider } from "@/ui/site/website";
import { SITE_URL } from "./site";
import "./globals.css";

// Fonts are bundled with the site. Nothing is fetched from Google at
// build time or in the visitor's browser.

const DESCRIPTION = "Step through C++ linked-list and tree programs and watch the stack, the heap and every pointer change, one line at a time.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "HeapHop: see what your C++ does to memory", template: "%s · HeapHop" },
  description: DESCRIPTION,
  applicationName: "HeapHop",
  openGraph: { type: "website", siteName: "HeapHop", locale: "en", url: "/", title: "HeapHop: see what your C++ does to memory", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "HeapHop: see what your C++ does to memory", description: DESCRIPTION },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Every page is rendered per request: the CSP nonce changes each time, and the header shows who is signed in.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const viewer = await getViewer();
  const session = viewer && viewer.mfaDone ? { admin: viewer.role === "admin" } : null;
  return (
    // The saved theme and the scroll-reveal switch are applied by the script before the
    // first paint, so the attributes on <html> may differ from the pre-rendered ones.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SAVED_THEME_SCRIPT + REVEAL_READY_SCRIPT + NAV_START_SCRIPT }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <WebsiteProvider session={session}>{children}</WebsiteProvider>
      </body>
    </html>
  );
}
