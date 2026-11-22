import type { Metadata } from "next";
import { headers } from "next/headers";
import { getViewer } from "@/server/session";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SAVED_THEME_SCRIPT } from "@/ui/theme-script";
import { WebsiteProvider } from "@/ui/site/website";
import "./globals.css";

// Fonts are bundled with the site. Nothing is fetched from Google at
// build time or in the visitor's browser.

export const metadata: Metadata = {
  title: { default: "HeapHop: see what your C++ does to memory", template: "%s · HeapHop" },
  description: "Step through C++ linked-list programs and watch the stack, the heap and every pointer change.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Every page is rendered per request: the CSP nonce changes each time, and the header shows who is signed in.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const viewer = await getViewer();
  const session = viewer && viewer.mfaDone ? { admin: viewer.role === "admin" } : null;
  return (
    // The saved theme is applied by the script before the first paint, so the class on
    // <html> may differ from the pre-rendered one.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SAVED_THEME_SCRIPT }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <WebsiteProvider session={session}>{children}</WebsiteProvider>
      </body>
    </html>
  );
}
