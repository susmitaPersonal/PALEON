import type { MiddlewareHandler } from "hono";
import { AppError } from "../errors";

/** Per-client fixed window, in memory. Enough for one process; multiple instances would need a shared store. */
export function rateLimit(limitPerMinute: number, clientKey: (header: (name: string) => string | undefined) => string,
  now: () => number = Date.now): MiddlewareHandler {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return async (c, next) => {
    const key = clientKey((name) => c.req.header(name));
    const time = now();
    if (windows.size > 10_000) {
      for (const [entry, window] of windows) if (time - window.startedAt >= 60_000) windows.delete(entry);
    }
    const current = windows.get(key);
    const window = current && time - current.startedAt < 60_000 ? current : { startedAt: time, count: 0 };
    window.count += 1;
    windows.set(key, window);
    if (window.count > limitPerMinute) {
      throw new AppError("rate_limited", "Too many analyses. Wait a minute and try again.",
        Math.ceil((60_000 - (time - window.startedAt)) / 1000));
    }
    await next();
  };
}
