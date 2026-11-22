const KNOWN_PRODUCTION_HOST = "tbivpbbejttacfcqeqia.supabase.co";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function parseOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    const local = LOOPBACK_HOSTS.has(url.hostname) && url.protocol === "http:" && Boolean(url.port);
    const hosted = /^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) && url.protocol === "https:" && !url.port;
    return local || hosted ? url : null;
  } catch {
    return null;
  }
}

export function connectedSupabaseOrigin(env: Readonly<Record<string, string | undefined>>): string {
  const target = parseOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
  const isolated = parseOrigin(env.CRECY_E2E_SUPABASE_ORIGIN);
  if (target?.hostname === KNOWN_PRODUCTION_HOST || isolated?.hostname === KNOWN_PRODUCTION_HOST) {
    throw new Error("Connected test writes are disabled for the Crecy production Supabase project.");
  }
  if (!target || !isolated || target.origin !== isolated.origin) {
    throw new Error("Set CRECY_E2E_SUPABASE_ORIGIN to the exact isolated Supabase test origin in NEXT_PUBLIC_SUPABASE_URL. Use a dedicated synthetic hosted project or a loopback Supabase instance.");
  }
  return target.origin;
}
