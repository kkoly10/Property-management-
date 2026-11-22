import { describe, expect, it } from "vitest";
import { connectedSupabaseOrigin } from "./connected-target";

const hosted = "https://abcdefghijklmnopqrst.supabase.co";
const production = "https://tbivpbbejttacfcqeqia.supabase.co";
const local = "http://127.0.0.1:54321";

function authorize(target?: string, isolated?: string) {
  return connectedSupabaseOrigin({ NEXT_PUBLIC_SUPABASE_URL: target, CRECY_E2E_SUPABASE_ORIGIN: isolated });
}

describe("connected test target", () => {
  it("permits an explicitly declared isolated hosted or loopback origin", () => {
    expect(authorize(hosted + "/", hosted)).toBe(hosted);
    expect(authorize(local, local + "/")).toBe(local);
  });

  it("rejects Crecy production even when explicitly selected", () => {
    expect(() => authorize(production, production)).toThrow("Crecy production");
  });

  it("requires both origins and refuses mismatches", () => {
    for (const [target, isolated] of [[undefined, hosted], [hosted, undefined], [local, hosted]]) {
      expect(() => authorize(target, isolated)).toThrow("CRECY_E2E_SUPABASE_ORIGIN");
    }
  });

  it("refuses arbitrary domains, credentials, query parameters and path prefixes", () => {
    for (const url of ["https://data.example.com", "https://user@" + hosted.slice(8), hosted + "?secret=sensitive",
      hosted + "/rest/v1", hosted + ".example.com", "http://192.168.1.12:54321"]) {
      expect(() => authorize(url, url)).toThrow("isolated Supabase test origin");
    }
  });
});
