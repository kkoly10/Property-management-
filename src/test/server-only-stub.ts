/**
 * Test-only stand-in for the `server-only` package.
 *
 * `server-only` exists to make the Next.js bundler fail if a server module is pulled into a client
 * bundle. Under Vitest there is no such bundle, and importing the real package throws — which left
 * every `import "server-only"` module (the whole data and notifications layer) untestable. Aliasing it
 * here restores that coverage; the production boundary is unaffected, because `next build` still
 * resolves the real package.
 */
export {};
