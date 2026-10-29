import path from "node:path";

import type { NextConfig } from "next";

/** The EmberKV SDK is consumed from source in the sibling ../emberkv checkout. */
const emberkvSdk = path.resolve(process.cwd(), "../emberkv/sdk/typescript");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  // The SDK ships TypeScript sources (zero build step), so Next.js compiles it.
  transpilePackages: ["@emberkv/client"],
  experimental: {
    // Follow the `file:` symlink into the SDK without widening the root to
    // the whole parent folder (which would make Turbopack watch Rust's target/).
    turbopackAdditionalRoots: { emberkv: { path: emberkvSdk } },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
