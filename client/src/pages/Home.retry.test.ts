import { describe, expect, it, vi } from "vitest";
import { getRetryDeadline, rateLimitGuidance } from "@/lib/retry";

describe("GHOST retry scan helpers", () => {
  it("uses the actual reset timestamp when present", () => {
    const retryAt = Date.now() + 12_000;
    expect(getRetryDeadline({ code: "TOO_MANY_REQUESTS", retryAt, retryAfterSeconds: 2 })).toBe(retryAt);
    expect(rateLimitGuidance({ code: "TOO_MANY_REQUESTS", retryAt }, 12_000)).toContain("Retry in 12s");
  });

  it("derives a deadline from valid retry-after seconds", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    expect(getRetryDeadline({ code: "TOO_MANY_REQUESTS", retryAfterSeconds: 5 })).toBe(6_000);
    expect(rateLimitGuidance({ code: "TOO_MANY_REQUESTS", retryAfterSeconds: 5 }, 0)).toContain("reset is due now");
    vi.restoreAllMocks();
  });

  it("does not invent a countdown when metadata is missing", () => {
    expect(getRetryDeadline({ code: "TOO_MANY_REQUESTS" })).toBeNull();
    expect(rateLimitGuidance({ code: "TOO_MANY_REQUESTS" }, 0)).toContain("No reliable retry time");
  });

  it("does not apply rate-limit guidance to other errors", () => {
    expect(rateLimitGuidance({ code: "NOT_FOUND" }, 0)).toBeNull();
  });
});
