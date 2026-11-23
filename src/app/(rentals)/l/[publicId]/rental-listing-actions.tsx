"use client";

import { CalendarPlus, FileText, MessageSquare } from "lucide-react";
import { Tabs } from "radix-ui";
import { RentalApplicationForm } from "./application-form";
import { RentalInquiryForm } from "./inquiry-form";
import { RentalTourForm } from "./tour-form";

const actions = [
  { value: "question", label: "Question", icon: MessageSquare },
  { value: "tour", label: "Tour", icon: CalendarPlus },
  { value: "application", label: "Apply", icon: FileText },
];

export function RentalListingActions({ publicId, timeZone, availableOn, latestMoveInOn, requirementsVersion }: {
  publicId: string;
  timeZone: string;
  availableOn: string;
  latestMoveInOn: string;
  requirementsVersion?: string;
}) {
  const panelClass = "mt-5 data-[state=inactive]:hidden focus-visible:outline-2 focus-visible:outline-ring";

  return (
    <section id="rental-actions" aria-labelledby="rental-actions-heading"
      className="scroll-mt-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <h2 id="rental-actions-heading" className="text-xl font-semibold tracking-tight">Contact the landlord</h2>
      <Tabs.Root defaultValue="question" className="mt-4">
        <Tabs.List aria-label="Rental actions" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
          {actions.map(({ value, label, icon: Icon }) => (
            <Tabs.Trigger key={value} value={value}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm">
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="question" forceMount className={panelClass}>
          <p className="mb-3 text-sm leading-5 text-muted-foreground">Verify your email to send your question.</p>
          <RentalInquiryForm publicId={publicId} />
        </Tabs.Content>
        <Tabs.Content value="tour" forceMount className={panelClass}>
          <p className="mb-4 text-sm leading-6 text-muted-foreground">Suggest up to three times. The landlord confirms a time after you verify your email.</p>
          <RentalTourForm publicId={publicId} timeZone={timeZone} />
        </Tabs.Content>
        <Tabs.Content value="application" forceMount className={panelClass}>
          <p className="mb-4 text-sm leading-6 text-muted-foreground">Verify your email to share an application with the landlord.</p>
          {requirementsVersion ? (
            <p className="mb-4 text-sm leading-6">
              <a href="#listing-application-requirements" className="font-semibold text-primary underline underline-offset-4">
                Review the landlord’s application requirements
              </a>
            </p>
          ) : null}
          <RentalApplicationForm publicId={publicId} availableOn={availableOn} latestMoveInOn={latestMoveInOn}
            requirementsVersion={requirementsVersion} />
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}
