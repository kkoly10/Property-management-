"use client";

import { Check, Circle } from "lucide-react";
import { usePathname } from "next/navigation";

const steps = [
  { label: "Workspace", path: "/onboarding/organization" },
  { label: "Entity & book", path: "/onboarding/entity" },
  { label: "First property", path: "/onboarding/property" },
] as const;

export function OnboardingSteps() {
  const pathname = usePathname();
  const matchedIndex = steps.findIndex(({ path }) => pathname.startsWith(path));
  const activeIndex = matchedIndex < 0 ? 0 : matchedIndex;

  return (
    <ol className="mt-5 flex gap-3 lg:flex-col">
      {steps.map((step, index) => {
        const complete = index < activeIndex;
        const active = index === activeIndex;

        return (
          <li key={step.path} className="flex min-w-0 items-center gap-3" aria-current={active ? "step" : undefined}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${active ? "border-primary bg-primary text-white" : complete ? "border-success bg-[#ecfdf3] text-success" : "bg-card text-muted-foreground"}`}>
              {complete ? <Check aria-hidden="true" className="h-4 w-4" /> : index + 1}
            </span>
            <span className="hidden truncate text-sm font-medium lg:block">{step.label}</span>
            {index < steps.length - 1 ? <Circle aria-hidden="true" className="h-1 w-1 fill-border text-border lg:hidden" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
