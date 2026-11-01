type Level = "debug" | "info" | "warn" | "error" | "silent";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 50 };
const SENSITIVE = /(authorization|api[_-]?key|token|secret|password|image|bytes|content)/i;

export type Logger = ReturnType<typeof createLogger>;

/** JSON lines. Sensitive keys are dropped, so image data and model text cannot reach logs by accident. */
export function createLogger(level: Level, write: (line: string) => void = (line) => console.log(line)) {
  const log = (at: Exclude<Level, "silent">, event: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[at] < ORDER[level]) return;
    const safe = Object.fromEntries(Object.entries(fields).filter(([key]) => !SENSITIVE.test(key)));
    write(JSON.stringify({ time: new Date().toISOString(), level: at, event, ...safe }));
  };
  return {
    debug: (event: string, fields?: Record<string, unknown>) => log("debug", event, fields),
    info: (event: string, fields?: Record<string, unknown>) => log("info", event, fields),
    warn: (event: string, fields?: Record<string, unknown>) => log("warn", event, fields),
    error: (event: string, fields?: Record<string, unknown>) => log("error", event, fields),
  };
}
