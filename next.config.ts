import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["mongoose", "sharp"],
  turbopack: {
    // Pin the workspace root; a stray lockfile in a parent directory otherwise confuses detection.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
