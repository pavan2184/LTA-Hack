import { IngestionError } from "./errors";
export const TRANSCRIPT_MAX_BYTES = 65536;
export async function readTranscript(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !/^text\/plain(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(
      contentType,
    )
  )
    throw new IngestionError("invalid_request");
  if (Number(request.headers.get("content-length")) > TRANSCRIPT_MAX_BYTES)
    throw new IngestionError("payload_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new IngestionError("empty_transcript");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "",
    bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > TRANSCRIPT_MAX_BYTES) {
        await reader.cancel();
        throw new IngestionError("payload_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof IngestionError) throw error;
    throw new IngestionError("invalid_encoding");
  } finally {
    reader.releaseLock();
  }
  if (!text.trim()) throw new IngestionError("empty_transcript");
  if (text.includes("\u0000")) throw new IngestionError("invalid_encoding");
  return text;
}
