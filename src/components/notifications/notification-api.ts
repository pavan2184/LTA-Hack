export async function notificationRequest<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      ...(body === undefined
        ? {}
        : {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch {
    throw new Error(
      "Unable to reach notification services. Your entries are still here; try again.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fields = Object.values(data?.error?.fieldErrors ?? {})
      .filter((value) => typeof value === "string")
      .join(" ");
    throw new Error(
      `${data?.error?.message ?? "The notification request failed."}${fields ? ` ${fields}` : ""}`,
    );
  }
  if (!data)
    throw new Error(
      "The server returned an incomplete notification response. Refresh to check its status.",
    );
  return data as T;
}
