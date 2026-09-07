export const MAX_TRANSCRIPT_BYTES = 64 * 1024;
export function decodeTranscriptBytes(
  bytes: Uint8Array,
  filename: string,
): string {
  if (!/\.txt$/i.test(filename)) throw new Error("Choose a UTF-8 .txt file.");
  if (bytes.byteLength > MAX_TRANSCRIPT_BYTES)
    throw new Error("Keep the transcript within 64 KB.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("The file must contain valid UTF-8 text.");
  }
}
