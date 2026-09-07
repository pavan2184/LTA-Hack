/** This guard runs before connecting or generating credentials. */
export function assertLocalAuthSeedTarget(url: string, mode?: string): void {
  if (mode === "production") throw new Error("Demo identity seeding is forbidden in production.");
  const target = new URL(url);
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) {
    throw new Error("Demo identity seeding requires a local loopback database URL.");
  }
}
