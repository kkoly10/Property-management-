import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const snapshotIdSchema = z.string().trim().regex(/^snap_[a-zA-Z0-9_-]{1,180}$/)
  .refine((value) => !value.includes("replace_"));
const signatureReceipt = z.object({
  dailyRevision: z.number().int().positive(),
  signaturePublishedAt: z.number().int().positive(),
});

export function pinnedVercelScannerSnapshot() {
  return snapshotIdSchema.safeParse(process.env.CRECY_VERCEL_SCAN_SNAPSHOT_ID).data ?? null;
}

export async function resolveVercelScannerSnapshot(supabase: SupabaseClient, signal?: AbortSignal) {
  const seed = pinnedVercelScannerSnapshot();
  if (process.env.CRECY_VERCEL_SCAN_AUTO_REFRESH !== "1") return seed;
  try {
    const request = supabase.rpc("get_current_vercel_scanner_snapshot");
    const { data } = await (signal ? request.abortSignal(signal) : request);
    return snapshotIdSchema.safeParse(data).data ?? seed;
  } catch {
    return seed;
  }
}

// The refresh VM handles only official definitions. The scan VMs still restore the resulting
// snapshot with deny-all networking and receive one file after launch.
const refreshDefinitions = String.raw`
set -Eeuo pipefail
root=/opt/crecy-scanner
test ! -e /vercel/sandbox/crecy-document.bin
test ! -e "$root/db-next"
scratch="$(mktemp -d -t crecy-signatures.XXXXXXXX)"
trap 'sudo rm -rf -- "$scratch"' EXIT
mkdir "$scratch/db"
for database in main daily bytecode; do
  for extension in cvd cld; do
    if [ -f "$root/db/$database.$extension" ]; then
      install -m 0600 "$root/db/$database.$extension" "$scratch/db/"
    fi
  done
done
cat > "$scratch/freshclam.conf" <<CONFIG
DatabaseDirectory $scratch/db
DatabaseOwner $(id -un)
DatabaseMirror database.clamav.net
DNSDatabaseInfo current.cvd.clamav.net
TestDatabases yes
ConnectTimeout 8
ReceiveTimeout 25
Foreground yes
CONFIG
LD_LIBRARY_PATH="$root/package/usr/local/lib" timeout 75 "$root/package/usr/local/bin/freshclam" \
  --config-file="$scratch/freshclam.conf" --stdout --quiet >&2
sudo install -d -m 0555 "$root/db-next"
for database in main daily bytecode; do
  set -- "$scratch/db/$database."*
  test "$#" -eq 1 && test -f "$1"
  sudo install -m 0444 "$1" "$root/db-next/"
done
sudo mv "$root/db" "$scratch/db-previous"
sudo mv "$root/db-next" "$root/db"
"$root/verify-and-scan" --check-definitions
`;

export async function refreshVercelScannerSnapshot(supabase: SupabaseClient) {
  if (process.env.CRECY_VERCEL_SCAN_AUTO_REFRESH !== "1") return { state: "disabled", failed: false };
  const seed = pinnedVercelScannerSnapshot();
  if (!seed) return { state: "seed-unavailable", failed: true };
  const claim = crypto.randomUUID();
  const claimSignal = AbortSignal.timeout(5_000);
  const { data, error } = await supabase.rpc("claim_vercel_scanner_snapshot_refresh", {
    p_claim_id: claim, p_seed_snapshot_id: seed,
  }).abortSignal(claimSignal);
  if (error) return { state: "claim-failed", failed: true };
  if (data === null) return { state: "current", failed: false };
  const source = snapshotIdSchema.safeParse(data);
  if (!source.success) return { state: "invalid-snapshot", failed: true };

  const signal = AbortSignal.timeout(125_000);
  let sandbox: import("@vercel/sandbox").Sandbox | undefined;
  try {
    const { Sandbox } = await import("@vercel/sandbox");
    sandbox = await Sandbox.create({
      source: { type: "snapshot", snapshotId: source.data },
      persistent: false, ports: [], resources: { vcpus: 2 }, timeout: 120_000,
      networkPolicy: { allow: ["database.clamav.net", "current.cvd.clamav.net"] }, signal,
    });
    const command = await sandbox.runCommand({ cmd: "bash", args: ["-c", refreshDefinitions], signal });
    if (command.exitCode !== 0) return { state: "definition-update-failed", failed: true };
    const stdout = (await command.stdout({ signal })).trim();
    if (stdout.length > 256) return { state: "invalid-definition-receipt", failed: true };
    const receipt = signatureReceipt.safeParse(JSON.parse(stdout));
    if (!receipt.success) return { state: "invalid-definition-receipt", failed: true };
    const age = Date.now() - receipt.data.signaturePublishedAt * 1000;
    if (age > 48 * 60 * 60 * 1_000 || age < -5 * 60 * 1_000) {
      return { state: "stale-definitions", failed: true };
    }
    await sandbox.updateNetworkPolicy("deny-all", { signal });
    const snapshot = await sandbox.snapshot({ expiration: 7 * 24 * 60 * 60 * 1_000, signal });
    if (!snapshotIdSchema.safeParse(snapshot.snapshotId).success || !snapshot.expiresAt) {
      return { state: "invalid-snapshot", failed: true };
    }
    const completed = await supabase.rpc("complete_vercel_scanner_snapshot_refresh", {
      p_claim_id: claim,
      p_snapshot_id: snapshot.snapshotId,
      p_signatures_published_at: new Date(receipt.data.signaturePublishedAt * 1_000).toISOString(),
      p_expires_at: snapshot.expiresAt.toISOString(),
    }).abortSignal(AbortSignal.timeout(5_000));
    return completed.data === true && !completed.error
      ? { state: "refreshed", failed: false }
      : { state: "publish-failed", failed: true };
  } catch {
    return { state: "refresh-unavailable", failed: true };
  } finally {
    await sandbox?.stop({ signal: AbortSignal.timeout(3_000) }).catch(() => undefined);
  }
}
