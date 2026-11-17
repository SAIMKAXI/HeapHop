import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SAVED_THEME_SCRIPT } from "@/ui/theme-script";
import "./globals.css";

// Fonts are bundled with the site. Nothing is fetched from Google at
// build time or in the visitor's browser.

export const metadata: Metadata = {
  title: "HeapHop",
  description: "Step through C++ linked-list programs and watch the stack, the heap and every pointer change.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The saved theme is applied by the script before the first paint, so the class on
    // <html> may differ from the pre-rendered one.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SAVED_THEME_SCRIPT }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
