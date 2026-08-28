import { afterEach, describe, expect, it } from "vitest";
import {
  carriesCredentialInUrl,
  hasValidCronCredential,
  hasValidWorkerCredential,
  isUsableSecret,
  matchesSecret,
} from "./worker-auth";

const SECRET = "0123456789abcdef0123456789abcdef";
const CRON = "fedcba9876543210fedcba9876543210";

function requestWith(authorization: string | null, url = "https://app.crecy.example/api/internal/cron/notifications") {
  return new Request(url, { headers: authorization ? { authorization } : {} });
}

describe("isUsableSecret", () => {
  it("refuses unset, placeholder, and too-short values", () => {
    expect(isUsableSecret(undefined)).toBe(false);
    expect(isUsableSecret("")).toBe(false);
    expect(isUsableSecret("replace_with_a_long_random_worker_secret")).toBe(false);
    expect(isUsableSecret("short")).toBe(false);
    expect(isUsableSecret(SECRET)).toBe(true);
  });
});

describe("matchesSecret", () => {
  it("never authenticates against an unconfigured secret", () => {
    // The decisive property: an unconfigured worker route is CLOSED, not open. Presenting the empty
    // string, or the placeholder itself, must not get in.
    expect(matchesSecret("", undefined)).toBe(false);
    expect(matchesSecret("anything", undefined)).toBe(false);
    expect(matchesSecret("replace_with_a_long_random_worker_secret", "replace_with_a_long_random_worker_secret")).toBe(false);
  });

  it("rejects a prefix, a suffix, and a near miss", () => {
    expect(matchesSecret(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(matchesSecret(`${SECRET}x`, SECRET)).toBe(false);
    expect(matchesSecret(`${SECRET.slice(0, -1)}0`, SECRET)).toBe(false);
    expect(matchesSecret(SECRET, SECRET)).toBe(true);
  });
});

describe("carriesCredentialInUrl", () => {
  it("flags a credential passed through the query string", () => {
    for (const name of ["secret", "token", "key", "apikey", "api_key", "password", "cron_secret"]) {
      expect(carriesCredentialInUrl(`https://app.crecy.example/api/internal/cron/notifications?${name}=x`)).toBe(true);
    }
  });

  it("leaves ordinary query parameters alone", () => {
    expect(carriesCredentialInUrl("https://app.crecy.example/api/internal/cron/notifications")).toBe(false);
    expect(carriesCredentialInUrl("https://app.crecy.example/api/internal/cron/notifications?limit=25")).toBe(false);
  });
});

describe("hasValidWorkerCredential / hasValidCronCredential", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("fails closed when nothing is configured", () => {
    delete process.env.CRECY_INTERNAL_WORKER_SECRET;
    delete process.env.CRON_SECRET;
    expect(hasValidWorkerCredential(requestWith(`Bearer ${SECRET}`))).toBe(false);
    expect(hasValidCronCredential(requestWith(`Bearer ${CRON}`))).toBe(false);
    expect(hasValidCronCredential(requestWith(null))).toBe(false);
  });

  it("accepts the internal worker secret on both surfaces, and CRON_SECRET only on the scheduler", () => {
    process.env.CRECY_INTERNAL_WORKER_SECRET = SECRET;
    process.env.CRON_SECRET = CRON;
    expect(hasValidWorkerCredential(requestWith(`Bearer ${SECRET}`))).toBe(true);
    expect(hasValidCronCredential(requestWith(`Bearer ${SECRET}`))).toBe(true);
    expect(hasValidCronCredential(requestWith(`Bearer ${CRON}`))).toBe(true);
    // A cron credential is not an operator credential.
    expect(hasValidWorkerCredential(requestWith(`Bearer ${CRON}`))).toBe(false);
  });

  it("accepts the scheme case-insensitively but requires the Bearer form", () => {
    process.env.CRON_SECRET = CRON;
    expect(hasValidCronCredential(requestWith(`bearer ${CRON}`))).toBe(true);
    expect(hasValidCronCredential(requestWith(CRON))).toBe(false);
    expect(hasValidCronCredential(requestWith(`Basic ${CRON}`))).toBe(false);
  });

  it("refuses a request that carries a credential in the URL even when the header is correct", () => {
    // The URL secret is already in every access log along the path, so the request is burned.
    process.env.CRON_SECRET = CRON;
    const url = `https://app.crecy.example/api/internal/cron/notifications?cron_secret=${CRON}`;
    expect(hasValidCronCredential(requestWith(`Bearer ${CRON}`, url))).toBe(false);
  });
});
