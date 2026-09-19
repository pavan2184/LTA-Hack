import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pino resolves its own worker entry points at runtime, which the bundler
  // cannot follow. Leaving it external keeps `require` working in the route.
  serverExternalPackages: ["pino"],
  // The engine package ships TypeScript source rather than a build artefact, so
  // the browser and the server compile the same files the tests run against.
  transpilePackages: ["@railplan/core", "@railplan/ps1"],
  async rewrites() {
    return [{ source: "/algorithm-lab", destination: "/algorithm-lab/index.html" }];
  },
  async headers() {
    return [{
      source: "/algorithm-lab/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
      ],
    }];
  },
};

export default nextConfig;
