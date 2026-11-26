import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "./site";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : path === "/signup" || path === "/login" ? 0.5 : 0.7,
  }));
}
