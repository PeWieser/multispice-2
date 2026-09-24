import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Pfad-Prefix falls nötig (z.B. bei /circuitlab/)
  // basePath: "/circuitlab",
  images: {
    unoptimized: true, // Cloudflare Pages hat kein Next.js Image Optimization
  },
};

export default nextConfig;
