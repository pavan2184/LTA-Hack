import pino from "pino";

/**
 * Structured logs to stdout, which is what every host this deploys to ingests.
 *
 * No transport is configured on purpose: pino's transports run in a worker
 * thread, which bundlers handle badly and a serverless function cannot keep
 * alive long enough to flush. Plain JSON on stdout has neither problem.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "railplan" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie"],
    remove: true,
  },
});

/** A child logger tagged with the request id echoed to the client. */
export function requestLogger(requestId: string, route: string) {
  return logger.child({ requestId, route });
}
