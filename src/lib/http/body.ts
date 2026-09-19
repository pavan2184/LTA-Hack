import { MAX_BODY_BYTES } from "./schemas";
export class BodyError extends Error {
  constructor(public readonly code: "payload_too_large" | "malformed_request") { super(code); }
}
/** Bound bytes while reading; Content-Length is only an early rejection hint. */
export async function readBoundedJson(request: Request, maxBytes = MAX_BODY_BYTES, timeoutMs?: number): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new BodyError("payload_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new BodyError("malformed_request");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let bytes = 0;
  let timedOut = false;
  const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, timeoutMs);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new BodyError("payload_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
    if (timedOut) throw new BodyError("malformed_request");
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error instanceof BodyError) throw error;
    throw new BodyError("malformed_request");
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
