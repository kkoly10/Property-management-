import { describe, expect, it } from "vitest";
import { classifyScannerStatus } from "./scanner-failure";
import { classifyRelayStatus } from "@/lib/notifications/transport";

describe("scanner failure recovery", () => {
  it("retries a scan quota failure within its normal attempt budget", () => {
    expect(classifyScannerStatus(402)).toEqual({ ok: false, errorCode: "SCANNER_HTTP_402", retryable: true });
    expect(classifyRelayStatus(402).retryable).toBe(false);
  });
});
