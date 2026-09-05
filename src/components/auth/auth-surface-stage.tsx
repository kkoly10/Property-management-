import Image from "next/image";
import {
  ArrowRight,
  Building2,
  CircleCheckBig,
  FileCheck2,
  FileText,
  Landmark,
  MessageSquareText,
  ReceiptText,
  Wrench,
} from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { LivingCommunityIdentity } from "@/components/crecy/living-community-identity";
import { SurfaceTheme } from "@/components/crecy/surface-theme";
import type { AuthSurface, AuthSurfaceCopy } from "@/lib/auth/surface-copy";
import type { LivingCommunityPresentation } from "@/lib/data/living-community";

export function AuthSurfaceStage({
  surface,
  copy,
  community,
}: {
  surface: AuthSurface;
  copy: AuthSurfaceCopy;
  community?: LivingCommunityPresentation | null;
}) {
  if (surface === "resident") return <ResidentStage copy={copy} community={community} />;
  if (surface === "owner") return <OwnerStage copy={copy} />;
  return <OperatorStage copy={copy} />;
}

function OperatorStage({ copy }: { copy: AuthSurfaceCopy }) {
  return (
    <SurfaceTheme surface="os" className="h-full bg-[#151525] text-white">
      <div className="relative flex h-full min-h-[660px] flex-col overflow-hidden px-10 py-9 xl:px-14 xl:py-11">
        <div aria-hidden="true" className="absolute inset-y-0 right-0 w-px bg-white/10" />
        <div className="relative z-10">
          <Wordmark className="max-w-[9rem] text-white" />
        </div>

        <div className="relative z-10 my-auto max-w-xl py-12">
          <p className="text-sm font-medium text-white/58">Crecy OS</p>
          <h1 className="mt-4 text-[3.35rem] font-semibold leading-[1.02] tracking-[-0.05em] text-balance xl:text-[3.85rem]">
            {copy.headline}
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/68">
            Return to the operating system that keeps portfolio work, money, maintenance, and owner reporting connected.
          </p>

          <div className="mt-10 overflow-hidden rounded-[1rem] border border-white/12 bg-white/[0.035]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-xs font-semibold text-white/85">Today</span>
              <span className="text-[10px] text-white/45">Operator command center</span>
            </div>
            <div className="grid sm:grid-cols-[1fr_.8fr]">
              <div className="divide-y divide-white/10">
                {[
                  [Building2, "Portfolio", "Properties, residents, leases"],
                  [ReceiptText, "Money", "Payments and reconciliation"],
                  [Wrench, "Operations", "Maintenance and vendors"],
                ].map(([Icon, title, detail]) => {
                  const Glyph = Icon as typeof Building2;
                  return (
                    <div key={String(title)} className="flex items-start gap-3 px-4 py-4">
                      <Glyph aria-hidden="true" className="mt-0.5 h-4 w-4 text-[#8d8aff]" />
                      <div>
                        <p className="text-sm font-semibold">{String(title)}</p>
                        <p className="mt-1 text-xs text-white/48">{String(detail)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-white/10 bg-white/[0.025] px-4 py-4 sm:border-l sm:border-t-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">Attention</p>
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold">Owner approval</p>
                    <p className="mt-1 text-[10px] text-white/45">Decision waiting</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold">Payment exception</p>
                    <p className="mt-1 text-[10px] text-white/45">Needs reconciliation</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/42">{copy.footnote}</p>
      </div>
    </SurfaceTheme>
  );
}

function ResidentStage({
  copy,
  community,
}: {
  copy: AuthSurfaceCopy;
  community?: LivingCommunityPresentation | null;
}) {
  const communityTitle = community?.displayName ?? "Your home. Your community.";
  const communitySubtitle = community?.publicAddressText
    ?? (community ? "Your resident portal" : "Payments, requests, messages, and documents stay together.");

  return (
    <SurfaceTheme surface="living" className="h-full bg-[#eef8f3] text-foreground">
      <div className="flex h-full min-h-[660px] flex-col px-8 py-8 xl:px-12 xl:py-10">
        <Wordmark product="Living" className="max-w-[9rem]" />

        <div className="my-auto max-w-2xl py-8">
          <LivingCommunityIdentity
            className="min-h-[330px] shadow-[0_26px_70px_rgba(6,95,63,.17)] xl:min-h-[390px]"
            title={communityTitle}
            subtitle={communitySubtitle}
            media={community?.heroImageUrl ? (
              <Image
                src={community.heroImageUrl}
                alt=""
                fill
                priority
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="object-cover"
              />
            ) : undefined}
            badge={
              <span className="rounded-full border border-white/20 bg-black/15 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                Crecy Living
              </span>
            }
          />

          <div className="mt-6">
            <h1 className="text-[2rem] font-semibold leading-[1.05] tracking-[-0.045em] text-balance xl:text-[2.35rem]">
              {community?.headline ?? copy.headline}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              {community
                ? `Sign in to ${community.displayName} for payments, maintenance, messages, documents, and community updates.`
                : "Your resident portal keeps the home relationship simple: what you owe, what you requested, what your property team sent, and what changed."}
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              [ReceiptText, "Pay", "Balance & receipts"],
              [Wrench, "Request", "Maintenance"],
              [MessageSquareText, "Connect", "Property team"],
            ].map(([Icon, title, detail]) => {
              const Glyph = Icon as typeof ReceiptText;
              return (
                <div key={String(title)} className="border-t border-[#b8dfcf] pt-3">
                  <Glyph aria-hidden="true" className="h-4 w-4 text-[#067647]" />
                  <p className="mt-2 text-sm font-semibold">{String(title)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{String(detail)}</p>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{copy.footnote}</p>
      </div>
    </SurfaceTheme>
  );
}

function OwnerStage({ copy }: { copy: AuthSurfaceCopy }) {
  return (
    <SurfaceTheme surface="owner" className="h-full bg-[#f7f8fc] text-foreground">
      <div className="flex h-full min-h-[660px] flex-col border-r px-9 py-9 xl:px-13 xl:py-11">
        <Wordmark product="Owner" className="max-w-[9rem]" />

        <div className="my-auto max-w-xl py-10">
          <p className="text-sm font-medium text-primary">Crecy Owner</p>
          <h1 className="mt-4 text-[3.15rem] font-semibold leading-[1.03] tracking-[-0.05em] text-balance xl:text-[3.65rem]">
            {copy.headline}
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">
            Read finalized financial records, recorded distributions, and approval requests through the ownership relationship your operator assigned.
          </p>

          <div className="mt-10 border-y bg-card/55">
            {[
              [FileText, "Finalized statements", "Read, print, or export the immutable statement record."],
              [Landmark, "Recorded distributions", "See evidence-backed remittances recorded by your operator."],
              [FileCheck2, "Approvals", "Review work that requires your decision."],
            ].map(([Icon, title, detail], index) => {
              const Glyph = Icon as typeof FileText;
              return (
                <div key={String(title)} className={"grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-4 py-5 " + (index > 0 ? "border-t" : "")}>
                  <Glyph aria-hidden="true" className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">{String(title)}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{String(detail)}</p>
                  </div>
                  <ArrowRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                </div>
              );
            })}
          </div>

          <div className="mt-7 flex items-center gap-2 text-xs text-muted-foreground">
            <CircleCheckBig aria-hidden="true" className="h-4 w-4 text-[var(--finance-accent)]" />
            Financial views stay scoped to your owner entity and finalized records.
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{copy.footnote}</p>
      </div>
    </SurfaceTheme>
  );
}
