import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // A second dev server (e.g. a local-auth server for e2e tests) must not share `.next`: NEXT_PUBLIC_* values
  // are inlined into cached chunks, and a shared cache sent the main server into a reload loop.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Server-only packages that must not be bundled.
  serverExternalPackages: ["postgres", "@react-pdf/renderer", "mammoth", "unpdf"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  agentRules: false,
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
