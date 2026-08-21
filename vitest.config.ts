import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // See the stub's own comment: this restores test coverage for server-only modules without
      // weakening the production boundary, which `next build` still enforces.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    // Unit/validation tests live under src as *.test.ts(x); Playwright e2e specs
    // (e2e/*.spec.ts) are driven by `npx playwright test`, not Vitest.
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    coverage: { provider: "v8", reporter: ["text", "json-summary"] },
  },
});
