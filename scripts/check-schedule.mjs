#!/usr/bin/env node
/**
 * Keeps vercel.json and the repository-defined schedule in lockstep, and proves every scheduled path
 * actually resolves to a shipped GET route. A cron entry pointing at a route that does not exist is a
 * silently dead job — the exact failure mode that let workers sit uninvoked in the first place.
 *
 * `--write` regenerates vercel.json; without it the script only verifies, so `npm run check` fails
 * when the two drift.
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");

// The schedule is authored in TypeScript for the app; parse the literal here so this script stays
// dependency-free and runnable before any build step.
const source = await readFile(resolve(root, "src/lib/runtime/schedule.ts"), "utf8");
const entries = [...source.matchAll(/path:\s*"([^"]+)"[\s\S]*?schedule:\s*"([^"]+)"/g)]
  .map(([, path, schedule]) => ({ path, schedule }));

if (entries.length === 0) {
  console.error("No scheduled jobs were parsed from src/lib/runtime/schedule.ts.");
  process.exit(1);
}

const cronPattern = /^(\S+\s+){4}\S+$/;
for (const entry of entries) {
  if (!entry.path.startsWith("/")) {
    console.error(`Scheduled path must start with '/': ${entry.path}`);
    process.exit(1);
  }
  if (!cronPattern.test(entry.schedule)) {
    console.error(`Not a 5-field cron expression for ${entry.path}: "${entry.schedule}"`);
    process.exit(1);
  }
  const routeFile = resolve(root, "src/app", `${entry.path.replace(/^\//, "")}/route.ts`);
  try {
    await access(routeFile);
  } catch {
    console.error(`Scheduled path ${entry.path} has no route at src/app${entry.path}/route.ts.`);
    process.exit(1);
  }
  const handler = await readFile(routeFile, "utf8");
  if (!/export\s+(async\s+)?function\s+GET\s*\(/.test(handler)) {
    console.error(`Scheduled path ${entry.path} exists but exports no GET handler; Vercel Cron only issues GET.`);
    process.exit(1);
  }
  if (!/hasValidCronCredential/.test(handler)) {
    console.error(`Scheduled path ${entry.path} does not fail closed on a scheduler credential.`);
    process.exit(1);
  }
}

const expected = `${JSON.stringify({ $schema: "https://openapi.vercel.sh/vercel.json", crons: entries }, null, 2)}\n`;
const configPath = resolve(root, "vercel.json");

if (write) {
  await writeFile(configPath, expected);
  console.log(JSON.stringify({ scheduledJobs: entries.length, wrote: "vercel.json" }));
} else {
  const actual = await readFile(configPath, "utf8").catch(() => null);
  if (actual !== expected) {
    console.error("vercel.json is out of date with src/lib/runtime/schedule.ts. Run: npm run schedule:write");
    process.exit(1);
  }
  console.log(JSON.stringify({ scheduledJobs: entries.length, vercelConfig: "in sync" }));
}
