import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output anywhere, not just at the root: agent worktrees under .claude/ carry their own
    // .next/ directory, and linting compiled chunks reports errors in generated code that no one can
    // fix — which would fail `npm run check` for a reason unrelated to the source.
    "**/.next/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
