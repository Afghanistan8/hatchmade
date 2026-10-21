import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // The parent directories hold stray lockfiles; keep the root here.
    root: __dirname,
  },
};

export default nextConfig;
