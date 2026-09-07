export const transcriptTitle: string;
export function controlledFetch(
  realFetch: typeof fetch,
  authOrigin: string,
): {
  counts: { anthropic: number; telegram: number; blocked: number };
  fetch: typeof fetch;
};
