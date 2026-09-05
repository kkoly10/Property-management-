import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(resolve(__dirname, "../../app/(auth)/layout.tsx"), "utf8");
const login = readFileSync(resolve(__dirname, "../../app/(auth)/login/page.tsx"), "utf8");
const stage = readFileSync(resolve(__dirname, "../../components/auth/auth-surface-stage.tsx"), "utf8");

describe("role-aware Crecy auth design", () => {
  it("does not return to the old generic indigo auth panel or sign-in card", () => {
    expect(layout).not.toContain("#312e81");
    expect(layout).toContain("<AuthSurfaceStage");
    expect(login).not.toMatch(/from ["']@\/components\/ui\/card["']/);
    expect(login).not.toContain("<Card");
  });

  it("gives operator, resident, and owner structurally different sign-in stages", () => {
    expect(stage).toContain("function OperatorStage");
    expect(stage).toContain("function ResidentStage");
    expect(stage).toContain("function OwnerStage");
    expect(stage).toContain("<LivingCommunityIdentity");
    expect(stage).toContain("Finalized statements");
    expect(stage).toContain("Operator command center");
  });

  it("keeps domain themes explicit for preview correctness", () => {
    expect(stage).toContain('surface="os"');
    expect(stage).toContain('surface="living"');
    expect(stage).toContain('surface="owner"');
  });
});
