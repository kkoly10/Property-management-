import { Building2, Globe2, ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";

const promises = [
  { icon: Building2, text: "One clear system for properties, residents, money, and maintenance." },
  { icon: ShieldCheck, text: "Database-enforced access controls designed for every relationship." },
  { icon: Globe2, text: "Built for USD, CAD, and MXN books without mixing currencies." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
      <section className="relative hidden overflow-hidden bg-[#312e81] px-12 py-10 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="relative z-10 flex h-full flex-col">
          <Wordmark className="text-white" />
          <div className="my-auto max-w-xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-indigo-200">Rental operations, made clear</p>
            <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.04em]">Operate every rental relationship from one trusted system.</h1>
            <div className="mt-10 space-y-5">
              {promises.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3 text-[15px] leading-6 text-indigo-100">
                  <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="relative z-10 text-sm text-indigo-200">Crecy OS · Phase 1 foundation</p>
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">{children}</section>
    </main>
  );
}
