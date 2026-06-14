import type { NextConfig } from "next";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@jobpilot/shared"],
  // Proxy /api/* to the Fastify API so the session cookie is first-party to :3000.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_BASE_URL}/api/:path*` }];
  },
  // Resolve ESM ".js" specifiers in workspace TS source (e.g. @jobpilot/shared) to ".ts".
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
