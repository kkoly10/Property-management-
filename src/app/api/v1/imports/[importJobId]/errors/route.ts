import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, context: { params: Promise<{ importJobId: string }> }) {
  const { importJobId } = await context.params;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in to download import errors." }, { status: 401 });
  const detail = await supabase.rpc("get_import_job_detail", { p_import_job_id: importJobId });
  if (detail.error || !detail.data) return NextResponse.json({ error: "Import errors are unavailable." }, { status: 404 });
  const summary = (detail.data as { summary?: { errors?: Array<{ row: number; field?: string; code: string; message: string }> } }).summary;
  const rows = summary?.errors ?? [];
  const csv = ["row,field,code,message", ...rows.map((error) => [error.row, error.field, error.code, error.message].map(csvCell).join(","))].join("\r\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="import-${importJobId}-errors.csv"` } });
}
