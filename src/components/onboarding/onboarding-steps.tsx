"use client";

import { Check } from "lucide-react";
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
    <ol className="mt-5 grid grid-cols-3 gap-2 lg:flex lg:flex-col lg:gap-3">
      {steps.map((step, index) => {
        const complete = index < activeIndex;
        const active = index === activeIndex;

        return (
          <li key={step.path} className="flex min-w-0 flex-col items-center gap-2 text-center lg:flex-row lg:gap-3 lg:text-left" aria-current={active ? "step" : undefined}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold lg:h-7 lg:w-7 ${active ? "border-primary bg-primary text-white" : complete ? "border-success bg-[#ecfdf3] text-success" : "bg-card text-muted-foreground"}`}>
              {complete ? <Check aria-hidden="true" className="h-4 w-4" /> : index + 1}
            </span>
            <span className={`text-xs font-medium leading-4 sm:text-sm ${active ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
