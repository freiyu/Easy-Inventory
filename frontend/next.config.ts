import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const base: NextConfig = {
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Build: a static export that the backend serves on one port with /api (PRD 0.2).
// `next dev`: static export cannot rewrite, so dev drops it and forwards /api to the backend on port 4000
// (backend/.env.example); set EZI_API_URL when the backend runs elsewhere.
export default function config(phase: string): NextConfig {
  if (phase !== PHASE_DEVELOPMENT_SERVER) return { ...base, output: "export" };
  const backend = process.env.EZI_API_URL ?? "http://127.0.0.1:4000";
  return { ...base, rewrites: async () => [{ source: "/api/:path*", destination: `${backend}/api/:path*` }] };
}
