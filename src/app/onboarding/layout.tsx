import { Wordmark } from "@/components/brand/wordmark";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <header className="border-b bg-card"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5"><Wordmark /><span className="text-sm text-muted-foreground">Secure setup</span></div></header>
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[240px_minmax(0,680px)] lg:py-14">
        <aside>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Setup progress</p>
          <OnboardingSteps />
        </aside>
        <section>{children}</section>
      </div>
    </main>
  );
}
