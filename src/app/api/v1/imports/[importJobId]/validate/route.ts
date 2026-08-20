import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateImportSchema } from "@/lib/validation/imports";

export async function POST(request: Request, context: { params: Promise<{ importJobId: string }> }) {
  const parsed = validateImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Map every required portfolio column." }, { status: 400 });
  const { importJobId } = await context.params;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in to validate imports." }, { status: 401 });
  const { data: job } = await supabase.from("import_jobs").select("import_type").eq("id", importJobId).maybeSingle();
  const rpc = job?.import_type === "leases" ? "validate_occupied_import" : "validate_portfolio_import";
  const result = await supabase.rpc(rpc, {
    p_import_job_id: importJobId,
    p_mapping: parsed.data.mapping,
    p_options: parsed.data.options,
  });
  if (result.error || !result.data) {
    const denied = result.error?.message.includes("DENIED");
    return NextResponse.json({ error: denied ? "Organization-wide property access is required." : "Validation could not complete." }, { status: denied ? 403 : 422 });
  }
  return NextResponse.json(result.data);
}
