#!/usr/bin/env node
/**
 * Guards the property that makes "apply all pending migrations" a safe command: everything in
 * supabase/migrations/ is ADDITIVE, so running it in timestamp order can never break the deployed
 * application.
 *
 * A migration that takes a capability AWAY from a caller that is already live does not have that
 * property. Those belong in supabase/migrations-contract/, applied deliberately after the compatible
 * build is verified. A directory whose safe execution depends on someone remembering to stop halfway
 * through, deploy, and resume is not a safe directory — a fresh engineer doing the normal thing must
 * not be able to take the product down.
 *
 * What counts as taking a capability away, and what deliberately does not:
 *
 *   * `revoke execute ... from authenticated|anon|public` on a function this migration did NOT create
 *     — CONTRACTION. Some deployed caller may hold that grant today.
 *   * `revoke ... from public,anon` immediately after `create or replace function` — NOT a contraction.
 *     It is this codebase's standard way of locking a NEW function down before granting it, and it
 *     removes nothing anyone was using.
 *   * `drop function|table` where the same object is recreated in the same file — NOT a contraction.
 *     That is a signature or definition replacement, and the object still exists afterwards.
 *   * `alter table ... drop column` — CONTRACTION, always.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expandDir = resolve(root, "supabase/migrations");
const contractDir = resolve(root, "supabase/migrations-contract");

const BROWSER_ROLES = /\b(authenticated|anon|public)\b/i;

function objectsCreatedIn(sql) {
  const functions = new Set(
    [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z_0-9]+)/gi)].map((m) => m[1].toLowerCase()),
  );
  const tables = new Set(
    [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_]+\.[a-z_0-9]+)/gi)].map((m) => m[1].toLowerCase()),
  );
  return { functions, tables };
}

/** Statements in `sql` that remove a capability a live caller could already be holding. */
export function contractingStatements(sql) {
  const created = objectsCreatedIn(sql);
  const findings = [];

  for (const raw of sql.split(";")) {
    const statement = raw.trim().replace(/\s+/g, " ");
    if (!statement) continue;

    const revoke = /^revoke\s+(?:execute|all)\b.*?\bon\s+function\s+([a-z_]+\.[a-z_0-9]+)/i.exec(statement);
    if (revoke && BROWSER_ROLES.test(statement.slice(revoke[0].length))) {
      if (!created.functions.has(revoke[1].toLowerCase())) {
        findings.push(statement.slice(0, 140));
      }
      continue;
    }

    const dropped = /^drop\s+(function|table)\s+(?:if\s+exists\s+)?([a-z_]+\.[a-z_0-9]+)/i.exec(statement);
    if (dropped) {
      const kind = dropped[1].toLowerCase() === "function" ? created.functions : created.tables;
      if (!kind.has(dropped[2].toLowerCase())) findings.push(statement.slice(0, 140));
      continue;
    }

    if (/^alter\s+table\s+.*\bdrop\s+column\b/i.test(statement)) {
      findings.push(statement.slice(0, 140));
    }
  }
  return findings;
}

const expand = (await readdir(expandDir)).filter((name) => name.endsWith(".sql")).sort();
const contract = (await readdir(contractDir).catch(() => [])).filter((name) => name.endsWith(".sql")).sort();

const misplaced = [];
for (const name of expand) {
  const findings = contractingStatements(await readFile(resolve(expandDir, name), "utf8"));
  if (findings.length) misplaced.push({ name, findings });
}

if (misplaced.length) {
  console.error("These migrations remove a capability the deployed application may still be using, so applying");
  console.error("all pending migrations in timestamp order could take the product down. Move them to");
  console.error("supabase/migrations-contract/ and follow the release procedure in its README.\n");
  for (const entry of misplaced) {
    console.error(`  ${entry.name}`);
    for (const finding of entry.findings) console.error(`    ${finding}`);
  }
  process.exit(1);
}

for (const name of contract) {
  const findings = contractingStatements(await readFile(resolve(contractDir, name), "utf8"));
  if (findings.length === 0) {
    console.error(`${name} is in migrations-contract/ but removes nothing. Move it to supabase/migrations/.`);
    process.exit(1);
  }
}

console.log(JSON.stringify({ expandMigrations: expand.length, contractMigrations: contract.length }));
