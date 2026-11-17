// The site's pages, for the header and the footer.
export type SitePage = "home" | "learn" | "editor" | "faq" | "about" | "privacy" | "supported";

export const NAV_LINKS: { page: SitePage; href: string; label: string }[] = [
  { page: "learn", href: "/learn", label: "Learn" },
  { page: "editor", href: "/editor", label: "Editor" },
  { page: "faq", href: "/faq", label: "FAQ" },
  { page: "about", href: "/about", label: "About" },
];

export const FOOTER_LINKS = [
  ...NAV_LINKS,
  { page: "privacy", href: "/privacy", label: "Privacy" },
  { page: "supported", href: "/supported", label: "Supported C++" },
] satisfies typeof NAV_LINKS;
