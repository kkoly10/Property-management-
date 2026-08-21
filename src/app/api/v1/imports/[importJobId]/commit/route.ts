import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importCommandsFor } from "@/lib/imports/commands";
import { commitImportSchema } from "@/lib/validation/imports";

export async function POST(request: Request, context: { params: Promise<{ importJobId: string }> }) {
  const parsed = commitImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The validation receipt is invalid." }, { status: 400 });
  const { importJobId } = await context.params;
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in to commit imports." }, { status: 401 });
  const { data: job } = await supabase.from("import_jobs").select("import_type").eq("id", importJobId).maybeSingle();
  const commands = importCommandsFor(job?.import_type);
  if (!commands) return NextResponse.json({ error: "That import type cannot be committed." }, { status: 422 });
  const result = await supabase.rpc(commands.commit, {
    p_import_job_id: importJobId,
    p_expected_validation_hash: parsed.data.expectedValidationHash,
  });
  if (result.error || !result.data) {
    const changed = result.error?.message.includes("HASH_CONFLICT");
    return NextResponse.json({ error: changed ? "The validation changed. Validate the file again." : "The import could not be committed." }, { status: changed ? 409 : 422 });
  }
  const response = result.data as { status: string; error?: string };
  if (response.status === "failed") return NextResponse.json({ error: response.error ?? "The atomic import failed without committing rows." }, { status: 409 });
  return NextResponse.json(response);
}
