import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ownerStatementDraftSchema } from "@/lib/validation/owner-statements";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = ownerStatementDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the statement period.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to calculate an owner statement.", 401);

  const statement = parsed.data;
  const { data, error } = await supabase.rpc("get_owner_statement_draft", {
    p_organization_id: statement.organizationId,
    p_accounting_book_id: statement.accountingBookId,
    p_owner_entity_id: statement.ownerEntityId,
    p_property_id: statement.propertyId,
    p_period_start: statement.periodStart,
    p_period_end: statement.periodEnd,
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("OWNER_STATEMENT_SCOPE_DENIED")) return errorResponse("You need owner and finance management access for this property.", 403);
    if (code.includes("OWNER_STATEMENT_PLAN_UNAVAILABLE")) return errorResponse("Owner statements require the Growth or Pro plan.", 403);
    if (code.includes("OWNER_INTEREST_NOT_EFFECTIVE")) return errorResponse("This owner has no effective interest during the selected period.", 422);
    if (code.includes("OWNERSHIP_ALLOCATION_INCOMPLETE")) return errorResponse("Ownership fractions are incomplete or overlap on a posted ledger date.", 422);
    if (code.includes("OWNER_STATEMENT_CONTEXT_NOT_FOUND")) return errorResponse("The owner, property, or accounting book was not found.", 404);
    return errorResponse("The owner statement could not be calculated.", 422);
  }
  return NextResponse.json(data, { status: 200 });
}
