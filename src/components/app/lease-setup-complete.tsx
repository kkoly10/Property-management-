"use client";
import Link from "next/link";
import { InviteResidentButton } from "@/app/app/residents/invite-resident-button";
import { Button } from "@/components/ui/button";
import type { LeaseActivationResult } from "@/lib/homeowner/lease-state";
import type { ResidentDirectoryRow } from "@/lib/data/leasing";
export function LeaseSetupComplete({ result, organizationId, unitId, residents = [] }: {
  result: LeaseActivationResult; organizationId: string; unitId: string; residents?: ResidentDirectoryRow[];
}) {
  const opening = new Intl.NumberFormat("en-US", { style: "currency", currency: result.currency }).format(result.openingBalanceMinor / 100);
  return <div className="space-y-7">
    <header><h1 className="text-3xl font-semibold tracking-tight">Your signed rental is set up</h1>
      <p className="mt-3 leading-7 text-muted-foreground">The agreement, renter records and rent schedule are saved together. No online payment was taken.</p></header>
    <dl className="grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-2">
      <div><dt className="text-sm text-muted-foreground">First rent charge managed in Crecy</dt><dd className="mt-2 font-semibold">{result.firstChargeDueDate}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Opening position recorded at setup</dt><dd className="mt-2 font-semibold">{opening}{result.openingBalanceMinor < 0 ? " credit" : result.openingBalanceMinor > 0 ? " owed" : " — nothing owed"}</dd></div>
    </dl>
    <section className="space-y-4"><h2 className="text-xl font-semibold">Invite your renters</h2>
      <p className="text-sm leading-6 text-muted-foreground">Invitations are separate from setup. An email problem never recreates the lease or its charges. After acceptance, the renter can access the selected agreement in Crecy Living.</p>
      {result.people.map(person => { const resident = residents.find(row => row.personId === person.personId);
        return <div key={person.personId} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
          <div className="min-w-0"><p className="break-words font-medium">{person.name}</p><p className="break-all text-sm text-muted-foreground">{person.email || "No email recorded"}</p></div>
          <InviteResidentButton personId={person.personId} organizationId={organizationId} email={person.email}
            invitationState={resident?.invitationState ?? "not_invited"} invitationDelivery={resident?.invitationDelivery ?? null} disabled={false} />
        </div>; })}
    </section>
    <div className="flex flex-wrap gap-3"><Button asChild><Link href={`/app/rentals/${unitId}`}>Return to my rental</Link></Button>
      <Button variant="outline" asChild><Link href="/app/payments">Manage payments</Link></Button>
      <Button variant="outline" asChild><Link href="/app/maintenance">Maintenance</Link></Button>
      <Button variant="outline" asChild><Link href="/app/messages">Messages</Link></Button></div>
  </div>;
}
