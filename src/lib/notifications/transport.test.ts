import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyRelayStatus, getNotificationRelayConfig, getNotificationTransport } from "./transport";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("classifyRelayStatus", () => {
  it("treats OUR configuration problems as retryable, not as dead letters", () => {
    // A dead letter cannot be revived, so a wrong relay secret must never destroy the queue while
    // the operator is still fixing the setting.
    for (const status of [401, 403, 404, 407]) {
      expect(classifyRelayStatus(status).retryable).toBe(true);
    }
  });

  it("treats transient statuses and every 5xx as retryable", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(classifyRelayStatus(status).retryable).toBe(true);
    }
  });

  it("treats a rejection of THIS message as non-retryable", () => {
    for (const status of [400, 409, 413, 415, 422]) {
      expect(classifyRelayStatus(status).retryable).toBe(false);
    }
  });

  it("reports the status in the recorded error code", () => {
    expect(classifyRelayStatus(422).errorCode).toBe("RELAY_HTTP_422");
  });
});

describe("getNotificationRelayConfig", () => {
  it("requires an https URL and a non-placeholder secret of real length", () => {
    vi.stubEnv("CRECY_NOTIFICATION_RELAY_URL", "https://relay.example.com/send");
    vi.stubEnv("CRECY_NOTIFICATION_RELAY_SECRET", "a-sufficiently-long-secret");
    expect(getNotificationRelayConfig()).not.toBeNull();
  });

  it("refuses http, placeholders, and short secrets so the worker reports 'not configured'", () => {
    vi.stubEnv("CRECY_NOTIFICATION_RELAY_SECRET", "a-sufficiently-long-secret");
    vi.stubEnv("CRECY_NOTIFICATION_RELAY_URL", "http://relay.example.com/send");
    expect(getNotificationRelayConfig()).toBeNull();
    vi.stubEnv("CRECY_NOTIFICATION_RELAY_URL", "https://replace_me.example.com/send");
    expect(getNotificationRelayConfig()).toBeNull();
    vi.stubEnv("CRECY_NOTIFICATION_RELAY_URL", "https://relay.example.com/send");
    vi.stubEnv("CRECY_NOTIFICATION_RELAY_SECRET", "short");
    expect(getNotificationRelayConfig()).toBeNull();
  });

  it("yields no transport at all when unconfigured, so nothing pretends to deliver", () => {
    vi.stubEnv("CRECY_NOTIFICATION_RELAY_URL", "");
    vi.stubEnv("CRECY_NOTIFICATION_RELAY_SECRET", "");
    expect(getNotificationTransport()).toBeNull();
  });
});
