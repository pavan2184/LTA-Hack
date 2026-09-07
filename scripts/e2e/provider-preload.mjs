import { controlledFetch } from "./provider-policy.mjs";

// Refuse accidental use as a production preload or on an exposed server.
if (
  process.env.RAILPLAN_E2E_PROVIDER_STUBS !== "controlled-local-only" ||
  JSON.stringify(process.argv.slice(2)) !==
    JSON.stringify(["start", "-H", "127.0.0.1", "-p", "3101"]) ||
  process.env.NEXT_PUBLIC_SUPABASE_URL !==
    "https://ufcdynfjfzbjvglsdaqp.supabase.co"
)
  throw new Error(
    "E2E preload requires the explicit isolated loopback harness",
  );
const fake = controlledFetch(
  globalThis.fetch.bind(globalThis),
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
globalThis.fetch = fake.fetch;
process.on("message", (message) => {
  if (message?.type === "e2e-provider-counts" && typeof message.id === "string")
    process.send?.({
      type: "e2e-provider-counts",
      id: message.id,
      counts: { ...fake.counts },
    });
});
