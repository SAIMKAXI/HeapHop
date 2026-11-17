import type { NextConfig } from "next";

// D1: the website is plain static files. `next build` writes them to ./out,
// which any free static host can serve. There is no server.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
