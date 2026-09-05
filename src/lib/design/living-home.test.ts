import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(resolve(__dirname, "../../app/home/page.tsx"), "utf8");
const navigation = readFileSync(resolve(__dirname, "../../components/living/living-navigation.tsx"), "utf8");
const shell = readFileSync(resolve(__dirname, "../../components/living/living-shell.tsx"), "utf8");

describe("Crecy Living home design contract", () => {
  it("is place-led and task-led rather than a generic resident card dashboard", () => {
    expect(home).toContain("<LivingCommunityIdentity");
    expect(home).toContain("Current balance");
    expect(home).toContain("Community updates");
    expect(home).not.toMatch(/from ["']@\/components\/ui\/card["']/);
    expect(home).not.toContain("#312e81");
  });

  it("keeps the resident mobile hierarchy with a central new-request action", () => {
    expect(navigation).toContain('href="/home"');
    expect(navigation).toContain('href="/payments/new"');
    expect(navigation).toContain('href="/maintenance/new"');
    expect(navigation).toContain('href="/messages"');
    expect(navigation).toContain('href="/more/preferences"');
    expect(navigation).toContain('aria-label="New maintenance request"');
  });

  it("forces the Living product theme in previews and uses the Living wordmark", () => {
    expect(shell).toContain('surface="living"');
    expect(shell).toContain('<Wordmark product="Living"');
  });
});
