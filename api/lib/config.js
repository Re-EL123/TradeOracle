/* Environment configuration with validation. Secrets stay server-side only. */
export function config() {
  return {
    env: process.env.APP_ENV || "development",
    mongoUri: process.env.MONGODB_URI || "",
    mongoDb: process.env.MONGODB_DATABASE || "tradeoracle",
    sessionSecret: process.env.SESSION_SECRET || "",
    workerToken: process.env.ENGINE_WORKER_TOKEN || "",
    corsOrigins: (process.env.CORS_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 120),
  };
}

export function validateStartup() {
  const c = config();
  const missing = [];
  if (!c.mongoUri) missing.push("MONGODB_URI");
  if (!c.sessionSecret) missing.push("SESSION_SECRET");
  return missing;
}
