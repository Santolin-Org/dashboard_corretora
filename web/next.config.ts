import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O harness de paridade sobe o next dev com NEXT_DIST_DIR próprio para não brigar com o dev server do desenvolvedor.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // tsconfig próprio no harness: o next dev reescreve o tsconfig que usa, e não queremos mexer no principal.
  ...(process.env.NEXT_TSCONFIG ? { typescript: { tsconfigPath: process.env.NEXT_TSCONFIG } } : {}),
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
