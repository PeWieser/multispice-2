import type { NextConfig } from "next";

/**
 * Two build modes:
 *
 *  `npm run build`          — standard server build (used for local preview)
 *  `npm run build:static`   — `NEXT_OUTPUT=export` produces a fully static
 *                             bundle in ./out for Cloudflare Pages, S3, GitHub
 *                             Pages or any web server. No Node runtime, no
 *                             database, no API routes required.
 */
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
      env: {
        // no backend in a static deployment
        NEXT_PUBLIC_CIRCUITBENCH_BACKEND: "local",
      },
    }
  : {};

export default nextConfig;
