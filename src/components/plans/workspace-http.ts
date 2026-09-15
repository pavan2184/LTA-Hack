/** All outputs remain server-owned; a cancelled read may never replace a newer view. */
export async function plannerRequest<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal,
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      "Unable to reach RailPlan. Check your connection and try again.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.error?.message ?? "The request failed. Try again.");
  if (!data)
    throw new Error("RailPlan returned an incomplete response. Try again.");
  return data as T;
}
