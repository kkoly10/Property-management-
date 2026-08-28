"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  CUSTOM_AGREEMENT_UNITS,
  ENTITLEMENTS,
  GROWTH_TRIAL_COPY,
  PLAN_LABELS,
  PLAN_ORDER,
  PRICE_BOOKS,
  annualSavingLabel,
  formatPrice,
  type BillingPeriod,
  type PlanCode,
  type PriceBook,
} from "@/lib/marketing/pricing";

const BOOKS: PriceBook[] = ["US", "CA", "MX"];

/** What each plan is for. Positioning only — every number comes from the price book. */
const PLAN_SUMMARY: Record<PlanCode, string> = {
  free: "One unit, to see the whole system with your own data before you commit.",
  starter: "A small portfolio run properly: rent, payments, maintenance and documents.",
  growth: "Multiple properties, a team, owners to report to, and a portfolio to migrate.",
  pro: "A larger book of business with metered units, deeper controls and implementation help.",
};

/**
 * The pricing explorer.
 *
 * Client-side only because of two controls — billing period and country price book. It reads
 * PRICE_BOOKS, which a test pins to file 11's own tables, so no price on this page can be edited here
 * without failing that test. That is deliberate: file 11 §7 exists because generated marketing images
 * showed prices that were never real, and someone who remembers those images must not be able to
 * "correct" this page toward them.
 */
export function PricingExplorer() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [book, setBook] = useState<PriceBook>("US");
  const country = PRICE_BOOKS[book];

  return (
    <div>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Billing period" className="inline-flex rounded-lg border bg-card p-1">
            {(["monthly", "annual"] as BillingPeriod[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                aria-pressed={period === value}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  period === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {value === "monthly" ? "Monthly" : "Annual"}
              </button>
          ))}
        </div>

        <div role="group" aria-label="Country price book" className="inline-flex rounded-lg border bg-card p-1">
            {BOOKS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setBook(value)}
                aria-pressed={book === value}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  book === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {PRICE_BOOKS[value].label}
              </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Prices are shown in {country.currency} from the {country.label} price book. Crecy uses localized
        price books rather than converting one currency at checkout.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((plan) => {
          const price = country.plans[plan];
          const minor = period === "monthly" ? price.monthlyMinor : price.annualMinor;
          const saving = period === "annual" ? annualSavingLabel(price) : null;
          const featured = plan === "growth";
          return (
            <div
              key={plan}
              className={`flex flex-col rounded-xl border bg-card p-6 ${featured ? "border-primary/60 ring-1 ring-primary/25" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{PLAN_LABELS[plan]}</h3>
                {featured ? (
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Most complete</span>
                ) : null}
              </div>

              <p className="mt-4">
                <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight">{formatPrice(country, minor)}</span>
                <span className="ml-1.5 text-sm text-muted-foreground">{period === "monthly" ? "/month" : "/year"}</span>
              </p>
              <p className="mt-1 h-5 text-xs text-muted-foreground">{saving}</p>

              <p className="mt-3 text-sm font-medium">
                {price.includedUnits} active unit{price.includedUnits === 1 ? "" : "s"} included
              </p>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{PLAN_SUMMARY[plan]}</p>

              <Button asChild className="mt-6 w-full" variant={featured ? "default" : "outline"}>
                <Link href="/signup">{plan === "free" ? "Start free" : `Start with ${PLAN_LABELS[plan]}`}</Link>
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-3 text-sm leading-6 text-muted-foreground sm:grid-cols-3">
        <p className="rounded-lg border bg-card px-4 py-3">
          <span className="font-medium text-foreground">Above the Pro allowance:</span>{" "}
          {formatPrice(country, country.overageMinor)} per additional active unit per month.
        </p>
        <p className="rounded-lg border bg-card px-4 py-3">
          <span className="font-medium text-foreground">{CUSTOM_AGREEMENT_UNITS}+ units:</span>{" "}
          custom agreement rather than a listed plan.
        </p>
        <p className="rounded-lg border bg-card px-4 py-3">
          <span className="font-medium text-foreground">Trial:</span> {GROWTH_TRIAL_COPY}.
        </p>
      </div>

      <h2 id="compare" className="mt-20 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
        What each plan includes
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Entitlements are enforced on the server. Hiding a button is not the same as withholding a
        capability, so a plan limit is a limit wherever the request comes from.
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">Feature comparison across the Free, Starter, Growth and Pro plans</caption>
          <thead>
            <tr className="bg-muted/50 text-left">
              <th scope="col" className="px-4 py-3 font-semibold">Capability</th>
              {PLAN_ORDER.map((plan) => (
                <th key={plan} scope="col" className="px-4 py-3 font-semibold">{PLAN_LABELS[plan]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ENTITLEMENTS.map((row) => (
              <tr key={row.capability} className="border-t">
                <th scope="row" className="px-4 py-3 text-left font-medium">{row.capability}</th>
                {PLAN_ORDER.map((plan) => (
                  <td key={plan} className="px-4 py-3 text-muted-foreground">{row.values[plan]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
