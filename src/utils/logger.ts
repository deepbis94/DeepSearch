type LogLevel = "info" | "warn" | "error" | "debug";

function format(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ?? {}),
  };
  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(format("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(format("warn", message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(format("error", message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== "production") {
      console.debug(format("debug", message, meta));
    }
  },
};
