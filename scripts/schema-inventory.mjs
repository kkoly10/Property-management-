/**
 * Dump a canonical inventory of the schema this repository's migrations produce.
 *
 * Why this exists: the live Supabase project can only be reached through an MCP tool that takes SQL as
 * a parameter, so applying 26 migrations means the SQL passes through an agent rather than a file
 * handle. A truncated or altered statement would usually raise a syntax error, but "usually" is not a
 * verification. This replays every migration into in-memory Postgres and prints the resulting object
 * inventory; running the SAME query against the live database and diffing the two proves the applies
 * were faithful, without needing to trust the transport.
 *
 * Usage:
 *   node scripts/schema-inventory.mjs           # inventory from replaying migrations locally
 *   node scripts/schema-inventory.mjs --sql     # print the query to run against the live database
 */
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = resolve(import.meta.dirname, "..");

/**
 * The inventory query.
 *
 * Deliberately signature-level rather than body-level: function bodies differ harmlessly between
 * PGlite and Postgres 17 in whitespace and in how `$$` bodies are echoed, but a missing function, a
 * missing column, a missing policy or a wrong argument list is exactly the damage a bad transcription
 * would do. Ordering is explicit so two runs are byte-comparable.
 */
const INVENTORY_SQL = `
select jsonb_pretty(jsonb_build_object(
  'tables', (
    select coalesce(jsonb_agg(t order by t), '[]'::jsonb) from (
      select c.table_schema || '.' || c.table_name || '(' ||
             string_agg(c.column_name || ' ' || c.data_type, ', ' order by c.ordinal_position) || ')' as t
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
      where c.table_schema in ('public','private','audit','reporting')
      group by c.table_schema, c.table_name
    ) s
  ),
  'functions', (
    select coalesce(jsonb_agg(f order by f), '[]'::jsonb) from (
      select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','private','audit','reporting')
    ) s
  ),
  'policies', (
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
      select schemaname || '.' || tablename || '.' || policyname || ':' || cmd as x
      from pg_policies where schemaname in ('public','private','audit','reporting')
    ) s
  ),
  'constraints', (
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
      select n.nspname || '.' || rel.relname || '.' || con.conname || ':' || con.contype::text as x
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where n.nspname in ('public','private','audit','reporting')
    ) s
  ),
  'indexes', (
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
      select schemaname || '.' || indexname as x
      from pg_indexes where schemaname in ('public','private','audit','reporting')
    ) s
  ),
  'triggers', (
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
      select n.nspname || '.' || rel.relname || '.' || tg.tgname as x
      from pg_trigger tg
      join pg_class rel on rel.oid = tg.tgrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where not tg.tgisinternal and n.nspname in ('public','private','audit','reporting')
    ) s
  )
)) as inventory
`;

if (process.argv.includes("--sql")) {
  process.stdout.write(INVENTORY_SQL);
  process.exit(0);
}

const db = new PGlite({ extensions: { citext, pgcrypto } });
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    email_confirmed_at timestamptz,
    created_at timestamptz not null default now(),
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create or replace function auth.jwt() returns jsonb language sql stable
  as $$ select jsonb_build_object(
    'sub',nullif(current_setting('request.jwt.claim.sub', true), ''),
    'aal',coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''),'aal1')
  ) $$;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id),
    name text not null, owner_id text,
    created_at timestamptz not null default now(),
    unique(bucket_id,name)
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select,insert,update,delete on storage.objects to authenticated;
`);

const dir = resolve(root, "supabase/migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  await db.exec(await readFile(resolve(dir, file), "utf8"));
}

const { rows } = await db.query(INVENTORY_SQL);
process.stdout.write(rows[0].inventory);
