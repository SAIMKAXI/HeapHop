// The site's pages, for the header and the footer.
export type SitePage = "home" | "learn" | "editor" | "faq" | "about" | "privacy" | "supported";

export const NAV_LINKS: { page: SitePage; href: string; label: string }[] = [
  { page: "learn", href: "/learn", label: "Learn" },
  { page: "editor", href: "/editor", label: "Editor" },
  { page: "about", href: "/about", label: "About" },
  { page: "faq", href: "/faq", label: "FAQ" },
];

/** HeapHop for VS Code on the Visual Studio Marketplace. */
export const EXTENSION_HREF = "https://marketplace.visualstudio.com/items?itemName=heaphop.heaphop";

export const FOOTER_LINKS: { page?: SitePage; href: string; label: string }[] = [
  ...NAV_LINKS,
  { page: "privacy", href: "/privacy", label: "Privacy" },
  { page: "supported", href: "/supported", label: "Supported C++" },
  { href: EXTENSION_HREF, label: "VS Code extension" },
];
