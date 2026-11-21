import type { NextConfig } from "next";

// D1 changed in 8.10: accounts need a small server (sessions in httpOnly cookies), so the site
// now runs as a Next.js app on Vercel instead of plain static files.
const nextConfig: NextConfig = {
  // No source maps in the shipped site; the source is on GitHub for anyone who wants it.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // The "Supported C++" page reads this file on the server at request time.
  outputFileTracingIncludes: { "/supported": ["./docs/SUBSET.md"] },
};

export default nextConfig;
