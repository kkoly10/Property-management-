import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  FileText,
  MessageSquareText,
  ReceiptText,
  Wrench,
} from "lucide-react";
import { LivingCommunityIdentity } from "@/components/crecy/living-community-identity";
import { LivingCommunityGallery } from "@/components/living/living-community-gallery";
import { LivingShell } from "@/components/living/living-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRecipientAnnouncementWorkspace } from "@/lib/data/announcements";
import { getResidentBalance } from "@/lib/data/finance";
import { getResidentLivingCommunityPresentations } from "@/lib/data/living-community";
import { getResidentMaintenanceWorkspace } from "@/lib/data/maintenance";
import { getConversationWorkspace } from "@/lib/data/messaging";

export const dynamic = "force-dynamic";

const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency,
}).format(amount / 100);

const shortDate = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${value}T12:00:00.000Z`));

export default async function ResidentHomePage() {
  const [summary, announcements, maintenance, conversations, communities] = await Promise.all([
    getResidentBalance(),
    getRecipientAnnouncementWorkspace(),
    getResidentMaintenanceWorkspace(),
    getConversationWorkspace(),
    getResidentLivingCommunityPresentations(),
  ]);

  const home = summary.items[0];
  const community = home
    ? communities.items.find((item) => item.tenancyId === home.tenancyId)
    : undefined;
  const openMaintenance = maintenance.items.filter((item) => !["completed", "canceled"].includes(item.residentVisibleStatus)).length;
  const openConversations = conversations.items.filter((item) => item.status === "open").length;

  return (
    <LivingShell>
      <div className="space-y-6 sm:space-y-7">
        <header className="max-w-2xl">
          <h1 className="text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground sm:text-[2.35rem]">
            Welcome home.
          </h1>
          <p className="mt-2.5 text-sm leading-6 text-muted-foreground sm:text-[0.9375rem]">
            Payments, requests, messages, and community updates in one calm place.
          </p>
        </header>

        {summary.mode === "setup" ? (
          <Alert variant="info">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Resident preview</AlertTitle>
            <AlertDescription>This sample shows the resident experience until Supabase is connected.</AlertDescription>
          </Alert>
        ) : null}

        {summary.mode === "error" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>Home unavailable</AlertTitle>
            <AlertDescription>Refresh and try again. Request {summary.requestId}.</AlertDescription>
          </Alert>
        ) : null}

        {home ? (
          <>
            <LivingCommunityIdentity
              title={community?.displayName ?? home.propertyName}
              subtitle={[
                `Unit ${home.unitCode}`,
                community?.publicAddressText,
              ].filter(Boolean).join(" · ")}
              media={community?.heroImageUrl ? (
                <Image
                  src={community.heroImageUrl}
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 1024px) 1100px, 100vw"
                  className="object-cover"
                />
              ) : undefined}
              badge={<Badge className="border-white/20 bg-black/15 text-white backdrop-blur-sm">{community?.isDemo ? "Demo community" : "Your home"}</Badge>}
              action={
                <Button asChild variant="secondary" size="sm" className="bg-white text-[#05603e] hover:bg-white/90">
                  <Link href="/documents">Documents</Link>
                </Button>
              }
            />

            <section
              aria-labelledby="resident-balance-title"
              className="overflow-hidden rounded-[1.1rem] border bg-card shadow-[var(--shadow-panel)]"
            >
              <div className="grid md:grid-cols-[1.15fr_.85fr]">
                <div className="px-5 py-5 sm:px-6 sm:py-6">
                  <p id="resident-balance-title" className="text-sm font-medium text-muted-foreground">Current balance</p>
                  <p data-financial-value className="mt-2 text-[2.45rem] font-semibold leading-none tracking-[-0.05em] text-foreground">
                    {money(home.balanceMinor, home.currencyCode)}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                    <span>{home.currencyCode}</span>
                    <Link href="/payments/new" className="font-semibold text-primary hover:underline">View payment options</Link>
                  </div>
                </div>

                <div className="border-t bg-[var(--brand-subtle)] px-5 py-5 md:border-l md:border-t-0 sm:px-6 sm:py-6">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <CalendarDays aria-hidden="true" className="h-4 w-4 text-primary" />
                    Upcoming payment
                  </div>
                  <p data-financial-value className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
                    {home.nextDueAmountMinor !== null ? money(home.nextDueAmountMinor, home.currencyCode) : "No payment scheduled"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {home.nextDueDate ? `Due ${shortDate(home.nextDueDate)}` : "Your next charge has not been posted yet."}
                  </p>
                  <Button asChild className="mt-5 w-full sm:w-auto">
                    <Link href="/payments/new">
                      Make a payment <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </section>
          </>
        ) : (
          <Alert variant="warning">
            <CircleAlert aria-hidden="true" className="h-5 w-5" />
            <AlertTitle>No active home found</AlertTitle>
            <AlertDescription>Your property manager can confirm your invitation and tenancy status.</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,.95fr)]">
          <section aria-labelledby="resident-needs-title" className="overflow-hidden rounded-xl border bg-card">
            <header className="border-b px-5 py-4 sm:px-6">
              <h2 id="resident-needs-title" className="text-base font-semibold tracking-[-0.015em]">Your home</h2>
              <p className="mt-1 text-sm text-muted-foreground">The things residents come back for most.</p>
            </header>
            <div className="divide-y">
              <ResidentTaskRow
                href="/maintenance"
                icon={Wrench}
                title="Maintenance requests"
                detail={maintenance.mode === "error"
                  ? "Temporarily unavailable"
                  : openMaintenance
                    ? `${openMaintenance} open request${openMaintenance === 1 ? "" : "s"}`
                    : "No open requests"}
              />
              <ResidentTaskRow
                href="/messages"
                icon={MessageSquareText}
                title="Messages"
                detail={conversations.mode === "error"
                  ? "Temporarily unavailable"
                  : openConversations
                    ? `${openConversations} open conversation${openConversations === 1 ? "" : "s"}`
                    : "Contact your property team"}
              />
              <ResidentTaskRow
                href="/documents"
                icon={FileText}
                title="Documents"
                detail="Lease, notices, signatures, and records"
              />
            </div>
          </section>

          <section aria-labelledby="community-updates-title" className="overflow-hidden rounded-xl border bg-card">
            <header className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
              <div>
                <h2 id="community-updates-title" className="text-base font-semibold tracking-[-0.015em]">Community updates</h2>
                <p className="mt-1 text-sm text-muted-foreground">Notices from your property team.</p>
              </div>
              {announcements.items.length ? <Badge variant="default">{announcements.items.length}</Badge> : null}
            </header>

            {announcements.mode === "error" ? (
              <div className="px-5 py-7 sm:px-6">
                <p className="text-sm font-medium text-destructive">Updates are temporarily unavailable.</p>
                <p className="mt-1 text-xs text-muted-foreground">Request {announcements.requestId}.</p>
              </div>
            ) : announcements.items.length ? (
              <div className="divide-y">
                {announcements.items.slice(0, 3).map((item) => (
                  <article key={item.deliveryId} className="px-5 py-4 sm:px-6">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-primary">{item.propertyName ?? "Management"}</p>
                      <time className="text-[11px] text-muted-foreground">{new Date(item.publishedAt).toLocaleDateString()}</time>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold">{item.title}</h3>
                    <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.bodyText}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 sm:px-6">
                <p className="text-sm font-medium">Nothing new right now.</p>
                <p className="mt-1 text-sm text-muted-foreground">Community notices will appear here when your property team publishes them.</p>
              </div>
            )}
          </section>
        </div>

        {community ? <LivingCommunityGallery community={community} /> : null}

        <section aria-labelledby="recent-payments-title" className="overflow-hidden rounded-xl border bg-card">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
            <div>
              <h2 id="recent-payments-title" className="text-base font-semibold tracking-[-0.015em]">Recent payments</h2>
              <p className="mt-1 text-sm text-muted-foreground">Receipts appear only after a payment is confirmed and posted.</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link href="/payments/new">Payments</Link></Button>
          </header>

          {summary.payments.length ? (
            <div className="divide-y">
              {summary.payments.slice(0, 4).map((payment) => (
                <div key={payment.paymentId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <ReceiptText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p data-financial-value className="font-semibold">{money(payment.amountMinor, payment.currencyCode)}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {payment.receivedAt ? new Date(payment.receivedAt).toLocaleDateString() : "Awaiting provider confirmation"}
                        <span aria-hidden="true"> · </span>
                        {payment.publicReference}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:justify-end">
                    {payment.receiptDocumentId ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/receipts/${payment.receiptDocumentId}`}>
                          Receipt <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : payment.status === "failed" ? (
                      <>
                        <Badge variant="warning">Failed</Badge>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/payments/new?retry=${payment.paymentId}`}>Try again</Link>
                        </Button>
                      </>
                    ) : (
                      <Badge variant="warning">{payment.status.replaceAll("_", " ")}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-sm text-muted-foreground sm:px-6">No payments yet.</div>
          )}
        </section>
      </div>
    </LivingShell>
  );
}

function ResidentTaskRow({
  href,
  icon: Icon,
  title,
  detail,
}: {
  href: string;
  icon: typeof Wrench;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="group grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 transition-colors hover:bg-[var(--brand-subtle)] sm:px-6"
    >
      <Icon aria-hidden="true" className="h-5 w-5 text-primary" />
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-[-0.01em]">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <ArrowRight aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
