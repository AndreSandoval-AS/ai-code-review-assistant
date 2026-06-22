/**
 * Tiny level-aware logger. `info` is the default; `debug` (LOG_LEVEL=debug)
 * additionally surfaces retrieval/trace internals. Kept dependency-free on
 * purpose — structured JSONL traces are handled separately in trace.ts.
 */
const LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();
const DEBUG = LEVEL === "debug";

export const logger = {
  debug(...args: unknown[]): void {
    if (DEBUG) console.error("[debug]", ...args);
  },
  info(...args: unknown[]): void {
    console.error("[info]", ...args);
  },
  warn(...args: unknown[]): void {
    console.error("[warn]", ...args);
  },
  error(...args: unknown[]): void {
    console.error("[error]", ...args);
  },
  isDebug: DEBUG,
};
