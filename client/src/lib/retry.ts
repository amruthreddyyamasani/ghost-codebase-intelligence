export type RateLimitData = { code?: string; retryAt?: number; retryAfterSeconds?: number };

export function getRetryDeadline(data?: RateLimitData) {
  if (data?.code !== "TOO_MANY_REQUESTS") return null;
  if (typeof data.retryAt === "number" && Number.isFinite(data.retryAt) && data.retryAt > 0) return data.retryAt;
  if (typeof data.retryAfterSeconds === "number" && Number.isFinite(data.retryAfterSeconds) && data.retryAfterSeconds >= 0) {
    return Date.now() + data.retryAfterSeconds * 1000;
  }
  return null;
}

export function rateLimitGuidance(data: RateLimitData | undefined, remainingMs: number) {
  if (data?.code !== "TOO_MANY_REQUESTS") return null;
  if (remainingMs > 0) {
    const seconds = Math.ceil(remainingMs / 1000);
    const retryAt = typeof data.retryAt === "number" && Number.isFinite(data.retryAt) && data.retryAt > 0
      ? ` at ${new Date(data.retryAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "";
    return `GitHub temporarily restricted requests. Retry in ${seconds}s${retryAt}.`;
  }
  if (typeof data.retryAt === "number" && Number.isFinite(data.retryAt) && data.retryAt > 0) {
    return `GitHub rate limit reset at ${new Date(data.retryAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. You can retry now.`;
  }
  if (typeof data.retryAfterSeconds === "number" && Number.isFinite(data.retryAfterSeconds) && data.retryAfterSeconds >= 0) {
    return "GitHub rate limit reset is due now. You can retry the scan.";
  }
  return "GitHub temporarily restricted requests. No reliable retry time was provided; try again later.";
}
