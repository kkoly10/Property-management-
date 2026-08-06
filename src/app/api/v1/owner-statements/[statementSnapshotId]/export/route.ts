import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerStatementDetail } from "@/lib/data/owner-statements";
import { ownerStatementCsvFilename, ownerStatementToCsv } from "@/lib/owner-statements/csv";

export async function GET(_request: Request, { params }: { params: Promise<{ statementSnapshotId: string }> }) {
  const { statementSnapshotId } = await params;

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in to download this statement." }, { status: 401 });

  // The RPC behind this fetcher is RLS-scoped to the statement's owner and authorized operators,
  // so an unauthorized caller gets no item (404) — no separate authorization is needed here.
  const detail = await getOwnerStatementDetail(statementSnapshotId);
  if (detail.mode === "error") return NextResponse.json({ error: "The statement export could not be prepared." }, { status: 502 });
  if (!detail.item) return NextResponse.json({ error: "That statement was not found." }, { status: 404 });

  const csv = ownerStatementToCsv(detail.item);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${ownerStatementCsvFilename(detail.item)}"`,
      "cache-control": "no-store",
    },
  });
}
