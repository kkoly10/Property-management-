import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAXIMUM_SCANNABLE_BYTES,
  getCloudmersiveScanConfig,
  getDocumentScanRelayConfig,
  getDocumentScanner,
  readCloudmersiveVerdict,
  readScanVerdict,
  type DocumentObjectSource,
} from "./scanner";

const target = {
  documentScanJobId: "11111111-1111-4111-8111-111111111111",
  storageBucket: "private-documents",
  storagePath: "organizations/o/property/p/lease.pdf",
};

function sourceOf(bytes: Buffer | null, error: string | null = null): DocumentObjectSource {
  return { download: async () => ({ bytes, error }) };
}

function relayResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("getDocumentScanRelayConfig", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("refuses a placeholder, a non-https endpoint, and a short secret", () => {
    process.env.CRECY_DOCUMENT_SCAN_RELAY_URL = "https://replace_me.example.com/scan";
    process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET = "0123456789abcdef0123456789abcdef";
    expect(getDocumentScanRelayConfig()).toBeNull();

    process.env.CRECY_DOCUMENT_SCAN_RELAY_URL = "http://scanner.internal/scan";
    expect(getDocumentScanRelayConfig()).toBeNull();

    process.env.CRECY_DOCUMENT_SCAN_RELAY_URL = "https://scanner.example.com/scan";
    process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET = "tooshort";
    expect(getDocumentScanRelayConfig()).toBeNull();

    process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET = "0123456789abcdef0123456789abcdef";
    expect(getDocumentScanRelayConfig()).toEqual({
      url: "https://scanner.example.com/scan",
      secret: "0123456789abcdef0123456789abcdef",
    });
  });

  it("returns no scanner at all when nothing is configured, so the route can report 503", () => {
    delete process.env.CRECY_DOCUMENT_SCAN_RELAY_URL;
    delete process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET;
    delete process.env.CLOUDMERSIVE_API_KEY;
    expect(getDocumentScanner()).toBeNull();
  });

  it("accepts a real Cloudmersive key and refuses placeholders or short values", () => {
    process.env.CLOUDMERSIVE_API_KEY = "replace_me";
    expect(getCloudmersiveScanConfig()).toBeNull();
    process.env.CLOUDMERSIVE_API_KEY = "short";
    expect(getCloudmersiveScanConfig()).toBeNull();
    process.env.CLOUDMERSIVE_API_KEY = "cloudmersive-test-key-123456";
    expect(getCloudmersiveScanConfig()).toEqual({ apiKey: "cloudmersive-test-key-123456" });
  });
});

describe("readScanVerdict", () => {
  it("accepts only the two words that are actually verdicts", () => {
    expect(readScanVerdict({ verdict: "clean" })).toEqual({ verdict: "clean", reference: null });
    expect(readScanVerdict({ verdict: "infected", reference: " eicar-test " })).toEqual({
      verdict: "infected",
      reference: "eicar-test",
    });
  });

  it("treats anything ambiguous as NOT a verdict, so it can never release a document", () => {
    // Each of these would be a catastrophic "clean" if the reader were permissive.
    expect(readScanVerdict(null)).toBeNull();
    expect(readScanVerdict("clean")).toBeNull();
    expect(readScanVerdict({})).toBeNull();
    expect(readScanVerdict({ verdict: "CLEAN" })).toBeNull();
    expect(readScanVerdict({ verdict: "ok" })).toBeNull();
    expect(readScanVerdict({ verdict: true })).toBeNull();
    expect(readScanVerdict({ status: "clean" })).toBeNull();
  });

  it("bounds the provider reference", () => {
    expect(readScanVerdict({ verdict: "clean", reference: "x".repeat(500) })?.reference).toHaveLength(200);
  });
});

describe("readCloudmersiveVerdict", () => {
  it("maps a literal CleanResult to Crecy's two-state verdict contract", () => {
    expect(readCloudmersiveVerdict({ CleanResult: true, FoundViruses: [] })).toEqual({
      verdict: "clean",
      reference: null,
    });
    expect(readCloudmersiveVerdict({
      CleanResult: false,
      FoundViruses: [{ FileName: "eicar.com", VirusName: "EICAR-Test-File" }],
    })).toEqual({
      verdict: "infected",
      reference: "EICAR-Test-File",
    });
  });

  it("never invents a verdict from a malformed provider response", () => {
    expect(readCloudmersiveVerdict(null)).toBeNull();
    expect(readCloudmersiveVerdict({})).toBeNull();
    expect(readCloudmersiveVerdict({ CleanResult: "true" })).toBeNull();
  });
});

describe("getDocumentScanner().scan", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.CRECY_DOCUMENT_SCAN_RELAY_URL = "https://scanner.example.com/scan";
    process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET = "0123456789abcdef0123456789abcdef";
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
  });

  it("computes the observed digest from the bytes it actually downloaded", async () => {
    const bytes = Buffer.from("a signed lease");
    vi.stubGlobal("fetch", vi.fn(async () => relayResponse(200, { verdict: "clean", reference: "scan-1" })));
    const result = await getDocumentScanner()!.scan(target, sourceOf(bytes));
    expect(result).toEqual({
      ok: true,
      verdict: "clean",
      observedSha256Hex: createHash("sha256").update(bytes).digest("hex"),
      providerCode: "relay",
      providerReference: "scan-1",
    });
  });

  it("sends the object under the job's own idempotency key and never leaks the secret into the body", async () => {
    const fetchMock = vi.fn(async () => relayResponse(200, { verdict: "infected" }));
    vi.stubGlobal("fetch", fetchMock);
    await getDocumentScanner()!.scan(target, sourceOf(Buffer.from("x")));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://scanner.example.com/scan");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe(target.documentScanJobId);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer 0123456789abcdef0123456789abcdef");
    expect(String(init.body)).not.toContain("0123456789abcdef");
  });

  it("reports an unreadable object as a retryable failure rather than a verdict", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(await getDocumentScanner()!.scan(target, sourceOf(null, "not found"))).toEqual({
      ok: false,
      errorCode: "OBJECT_UNREADABLE",
      retryable: true,
    });
  });

  it("refuses an object too large to stream, non-retryably", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const huge = Buffer.alloc(MAXIMUM_SCANNABLE_BYTES + 1);
    expect(await getDocumentScanner()!.scan(target, sourceOf(huge))).toEqual({
      ok: false,
      errorCode: "OBJECT_TOO_LARGE_TO_SCAN",
      retryable: false,
    });
  });

  it("treats an unreadable relay body as a failed attempt, never as clean", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => relayResponse(200, { status: "no threats" })));
    expect(await getDocumentScanner()!.scan(target, sourceOf(Buffer.from("x")))).toEqual({
      ok: false,
      errorCode: "UNREADABLE_SCAN_VERDICT",
      retryable: true,
    });
  });

  it("keeps our own misconfiguration retryable so one bad secret cannot dead-letter the queue", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => relayResponse(401, null)));
    expect(await getDocumentScanner()!.scan(target, sourceOf(Buffer.from("x")))).toEqual({
      ok: false,
      errorCode: "RELAY_HTTP_401",
      retryable: true,
    });
  });

  it("does not retry a relay rejection of this specific object", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => relayResponse(413, null)));
    expect(await getDocumentScanner()!.scan(target, sourceOf(Buffer.from("x")))).toEqual({
      ok: false,
      errorCode: "RELAY_HTTP_413",
      retryable: false,
    });
  });

  it("reports a timeout and an unreachable scanner as retryable, not as clean", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw abort; }));
    expect(await getDocumentScanner()!.scan(target, sourceOf(Buffer.from("x")))).toEqual({
      ok: false,
      errorCode: "SCANNER_TIMEOUT",
      retryable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    expect(await getDocumentScanner()!.scan(target, sourceOf(Buffer.from("x")))).toEqual({
      ok: false,
      errorCode: "SCANNER_UNREACHABLE",
      retryable: true,
    });
  });
});


describe("Cloudmersive document scanning", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.CRECY_DOCUMENT_SCAN_RELAY_URL;
    delete process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET;
    process.env.CLOUDMERSIVE_API_KEY = "cloudmersive-test-key-123456";
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
  });

  it("uses Cloudmersive when no custom relay is configured and binds the verdict to the bytes read", async () => {
    const bytes = Buffer.from("a signed lease");
    const fetchMock = vi.fn(async () => relayResponse(200, { CleanResult: true, FoundViruses: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getDocumentScanner()!.scan(target, sourceOf(bytes));
    expect(result).toEqual({
      ok: true,
      verdict: "clean",
      observedSha256Hex: createHash("sha256").update(bytes).digest("hex"),
      providerCode: "cloudmersive",
      providerReference: null,
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloudmersive.com/virus/scan/file");
    expect((init.headers as Record<string, string>).Apikey).toBe("cloudmersive-test-key-123456");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("records an infected verdict and a bounded provider reference", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => relayResponse(200, {
      CleanResult: false,
      FoundViruses: [{ VirusName: "X".repeat(500) }],
    })));
    const result = await getDocumentScanner()!.scan(target, sourceOf(Buffer.from("eicar")));
    expect(result).toMatchObject({
      ok: true,
      verdict: "infected",
      providerCode: "cloudmersive",
    });
    if (result.ok) expect(result.providerReference).toHaveLength(200);
  });

  it("keeps provider credential, quota, and outage failures retryable", async () => {
    for (const status of [401, 402, 403, 429, 500]) {
      vi.stubGlobal("fetch", vi.fn(async () => relayResponse(status, null)));
      expect(await getDocumentScanner()!.scan(target, sourceOf(Buffer.from("x"))), String(status)).toEqual({
        ok: false,
        errorCode: "SCANNER_HTTP_" + status,
        retryable: true,
      });
    }
  });

  it("does not release a document on an unreadable Cloudmersive response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => relayResponse(200, { Successful: true })));
    expect(await getDocumentScanner()!.scan(target, sourceOf(Buffer.from("x")))).toEqual({
      ok: false,
      errorCode: "UNREADABLE_SCAN_VERDICT",
      retryable: true,
    });
  });

  it("treats a file-specific provider rejection as non-retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => relayResponse(413, null)));
    expect(await getDocumentScanner()!.scan(target, sourceOf(Buffer.from("x")))).toEqual({
      ok: false,
      errorCode: "SCANNER_HTTP_413",
      retryable: false,
    });
  });

  it("keeps the custom relay as the explicit override when both providers are configured", async () => {
    process.env.CRECY_DOCUMENT_SCAN_RELAY_URL = "https://scanner.example.com/scan";
    process.env.CRECY_DOCUMENT_SCAN_RELAY_SECRET = "0123456789abcdef0123456789abcdef";
    const fetchMock = vi.fn(async () => relayResponse(200, { verdict: "clean", reference: "relay-wins" }));
    vi.stubGlobal("fetch", fetchMock);

    const scanner = getDocumentScanner();
    expect(scanner?.providerCode).toBe("relay");
    await scanner!.scan(target, sourceOf(Buffer.from("x")));
    expect(fetchMock.mock.calls[0][0]).toBe("https://scanner.example.com/scan");
  });
});
