export type IngestionErrorCode =
  | "payload_too_large"
  | "invalid_encoding"
  | "empty_transcript"
  | "invalid_request"
  | "model_refused"
  | "model_timeout"
  | "model_unavailable"
  | "invalid_model_output"
  | "invalid_evidence"
  | "no_proposals"
  | "rate_limited";
export class IngestionError extends Error {
  constructor(
    public code: IngestionErrorCode,
    public retryAfterSeconds?: number,
  ) {
    super(code);
  }
}
export const ingestionMessages: Record<IngestionErrorCode, string> = {
  payload_too_large: "Use a transcript of at most 64 KiB.",
  invalid_encoding: "Use valid UTF-8 text.",
  empty_transcript: "Enter a nonempty transcript.",
  invalid_request: "Send plain UTF-8 text.",
  model_refused: "The model declined extraction. Use the manual request form.",
  model_timeout:
    "Extraction timed out. Try again or use the manual request form.",
  model_unavailable:
    "Transcript extraction is unavailable. The manual request form remains available.",
  invalid_model_output:
    "The extraction response was invalid. No drafts were saved.",
  invalid_evidence:
    "The extraction evidence could not be verified. No drafts were saved.",
  no_proposals:
    "No supported request facts were found. Use the manual request form.",
  rate_limited: "Too many extraction attempts. Try again shortly.",
};
