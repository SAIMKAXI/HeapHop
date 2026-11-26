import type { MetadataRoute } from "next";
import { SITE_URL } from "./site";

// Search engines may list the public pages. Pages behind the login, and the account and admin
// pages, are left out: they only redirect a crawler to the login form.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/learn", "/editor", "/account", "/admin", "/login/mfa", "/reset-password", "/forgot-password"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
