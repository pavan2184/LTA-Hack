import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pino resolves its own worker entry points at runtime, which the bundler
  // cannot follow. Leaving it external keeps `require` working in the route.
  serverExternalPackages: ["pino"],
  // The engine package ships TypeScript source rather than a build artefact, so
  // the browser and the server compile the same files the tests run against.
  transpilePackages: ["@railplan/core", "@railplan/ps1"],
};

export default nextConfig;
