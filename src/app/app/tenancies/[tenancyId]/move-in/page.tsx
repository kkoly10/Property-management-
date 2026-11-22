import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocumentUploadForm } from "@/app/app/documents/document-upload-form";
import { Button } from "@/components/ui/button";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
import { moveInState } from "@/lib/tenancies/move-in-state";
import { FileImportedAgreementForm } from "./imported-agreement-form";
import { MoveInForm } from "./move-in-form";

const stateLabels = { unplanned: "No handover recorded", planned: "Handover planned", no_show: "No-show recorded", handed_over: "Handover confirmed" };
const importedAgreement = z.object({
  unitId: z.uuid(),
  versionId: z.uuid().nullable(),
  choices: z.array(z.object({ versionId: z.uuid(), title: z.string(), filename: z.string(), version: z.number().int().positive() })),
});
const eventLabels = { plan: "Appointment set", no_show: "No-show recorded", handover: "Handover confirmed" };

export default async function MoveInPage({ params }: { params: Promise<{ tenancyId: string }> }) {
  const tenancyId = z.uuid().safeParse((await params).tenancyId);
  if (!tenancyId.success) notFound();
  const context = await getOrganizationContext();
  const back = "/app/tenancies/" + tenancyId.data + "/closeout";
  const title = <h1 className="text-3xl font-semibold tracking-tight">Move-in handover</h1>;
  const backButton = <Button asChild variant="ghost"><Link href={back}>Back to tenancy</Link></Button>;
  if (context.state !== "active") return <div className="space-y-4">{backButton}{title}<p>Open the tenancy workspace to plan keys and condition handover.</p></div>;

  const organizationId = context.active.organizationId;
  const supabase = await createClient();
  const scope = { p_organization_id: organizationId, p_tenancy_id: tenancyId.data };
  const [{ data, error }, imported] = await Promise.all([
    supabase.rpc("get_tenancy_move_in", scope),
    supabase.rpc("get_imported_tenancy_agreement", scope),
  ]);
  const importedFile = importedAgreement.safeParse(imported.data);
  if (error?.code === "P0002" || error?.code === "42501") notFound();
  const parsed = moveInState.safeParse(data);
  if (error || !parsed.success || parsed.data.tenancyId !== tenancyId.data) return <div className="space-y-4">{backButton}{title}<p role="alert">The move-in record could not be loaded.</p></div>;
  const moveIn = parsed.data;
  const mayEdit = moveIn.canManage && moveIn.state !== "handed_over";
  const references = moveIn.state === "handed_over" && moveIn.conditionReference;
  const planned = mayEdit && moveIn.status === "scheduled" && (!moveIn.endOn || moveIn.endOn >= moveIn.localToday);
  const noShow = mayEdit && moveIn.status === "scheduled" && moveIn.state === "planned" && moveIn.plannedOn && moveIn.plannedOn <= moveIn.localToday;
  const canHandover = mayEdit && (moveIn.status === "scheduled" || moveIn.status === "active") && moveIn.startOn <= moveIn.localToday;

  return <div className="mx-auto max-w-3xl space-y-5">
    {backButton}
    {title}
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="font-semibold">{stateLabels[moveIn.state]}</h2>
      {moveIn.plannedOn ? <p className="text-sm">Appointment {moveIn.plannedOn}</p> : null}
      {references ? <>
        <p className="text-sm">Actual handover {moveIn.handedOverOn}</p>
        <p className="text-sm">Keys or access devices transferred {moveIn.keysTransferred}</p>
        <p className="break-words text-sm">{moveIn.conditionReference}</p>
        {moveIn.status === "scheduled" ? <p className="text-sm text-muted-foreground">Confirmed. The eligible tenancy will start on the next scheduler run.</p> : null}
      </> : null}
    </section>
    {importedFile.success ? <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Signed agreement for this import</h2>
      {importedFile.data.versionId ? <p className="mt-2 text-sm">The exact signed PDF version is filed on this tenancy.</p>
        : <div className="mt-3 space-y-4">
          <p className="text-sm text-muted-foreground">{moveIn.status === "scheduled" ? "File the signed lease for the recorded household before this tenancy can start." : "File the signed lease for the recorded household."}</p>
          {importedFile.data.choices.length ? <FileImportedAgreementForm organizationId={organizationId} tenancyId={tenancyId.data} choices={importedFile.data.choices} /> : null}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer">Upload a signed lease PDF</summary>
            <div className="mt-3"><DocumentUploadForm organizationId={organizationId} properties={[]} signedLeaseUnitId={importedFile.data.unitId} disabled={false} /></div>
          </details>
        </div>}
    </section> : null}
    {planned ? <MoveInForm key={"plan-" + moveIn.version} mode="plan" moveIn={moveIn} organizationId={organizationId} operationId={crypto.randomUUID()} /> : null}
    {noShow ? <MoveInForm key={"no-show-" + moveIn.version} mode="no_show" moveIn={moveIn} organizationId={organizationId} operationId={crypto.randomUUID()} /> : null}
    {canHandover ? <MoveInForm key={"handover-" + moveIn.version} mode="handover" moveIn={moveIn} organizationId={organizationId} operationId={crypto.randomUUID()} /> : null}
    {moveIn.events.length ? <section className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Recent handover activity</h2>
      <ul className="divide-y">{moveIn.events.map((event) => <li className="py-2 text-sm" key={event.version}>{eventLabels[event.action]} · {event.date}</li>)}</ul>
    </section> : null}
  </div>;
}
