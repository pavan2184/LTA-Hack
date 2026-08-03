import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pino resolves its own worker entry points at runtime, which the bundler
  // cannot follow. Leaving it external keeps `require` working in the route.
  serverExternalPackages: ["pino"],
};

export default nextConfig;
