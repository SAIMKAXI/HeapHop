import type { NextConfig } from "next";

// Accounts need a small server (sessions in httpOnly cookies), so the site runs as a Next.js app
// on Vercel rather than as plain static files.
const nextConfig: NextConfig = {
  // No source maps in the shipped site.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // The "Supported C++" page reads this file on the server at request time.
  outputFileTracingIncludes: { "/supported": ["./content/supported-cpp.md"] },
};

export default nextConfig;
