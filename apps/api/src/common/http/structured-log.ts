type StructuredLogLevel = "debug" | "info" | "warn" | "error";

const levelRank: Record<StructuredLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function writeStructuredLog(
  level: StructuredLogLevel,
  context: string,
  message: Record<string, unknown>,
): void {
  const configuredLevel = process.env.LOG_LEVEL;
  const minimumLevel =
    configuredLevel && configuredLevel in levelRank
      ? (configuredLevel as StructuredLogLevel)
      : "info";
  if (levelRank[level] < levelRank[minimumLevel]) return;

  const line = JSON.stringify({
    context,
    level,
    message,
    pid: process.pid,
    timestamp: Date.now(),
  });

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
