import type { NextConfig } from "next";

// D1: the website is plain static files. `next build` writes them to ./out,
// which any free static host can serve. There is no server.
const nextConfig: NextConfig = {
  output: "export",
  // No source maps in the shipped site; the source is on GitHub for anyone who wants it.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
};

export default nextConfig;
