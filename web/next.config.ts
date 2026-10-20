import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O harness de paridade sobe o next dev com NEXT_DIST_DIR próprio para não brigar com o dev server do desenvolvedor.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
