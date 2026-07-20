import { describe, expect, it } from "vitest";
import { loginSchema, signupSchema } from "@/lib/validation/auth";

describe("authentication schemas", () => {
  it("requires a strong password for a new account", () => {
    expect(signupSchema.safeParse({ email: "operator@example.com", password: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ email: "operator@example.com", password: "long-enough-password" }).success).toBe(true);
  });

  it("allows an existing account to use its current password", () => {
    expect(loginSchema.safeParse({ email: "operator@example.com", password: "existing" }).success).toBe(true);
  });
});
