import { headers } from "next/headers";
import { Building2, FileText, Globe2, Home, MessageSquare, ShieldCheck, Wrench } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { classifyHost } from "@/lib/runtime/host";
import { AUTH_SURFACE_COPY, authSurfaceFor, type AuthPromiseIcon } from "@/lib/auth/surface-copy";

const PROMISE_ICONS: Record<AuthPromiseIcon, typeof Building2> = {
  portfolio: Building2,
  shield: ShieldCheck,
  currency: Globe2,
  home: Home,
  maintenance: Wrench,
  message: MessageSquare,
  statement: FileText,
};

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Presentation context only. See @/lib/auth/surface-copy: the host picks the words, never the data.
  const copy = AUTH_SURFACE_COPY[authSurfaceFor(classifyHost((await headers()).get("host")))];

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
      <section className="relative hidden overflow-hidden bg-[#312e81] px-12 py-10 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="relative z-10 flex h-full flex-col">
          <Wordmark product={copy.product} className="text-white" />
          <div className="my-auto max-w-xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-indigo-200">{copy.eyebrow}</p>
            <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.04em]">{copy.headline}</h1>
            <div className="mt-10 space-y-5">
              {copy.promises.map(({ icon, text }) => {
                const Icon = PROMISE_ICONS[icon];
                return (
                  <div key={text} className="flex items-start gap-3 text-[15px] leading-6 text-indigo-100">
                    <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                    <span>{text}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="relative z-10 text-sm text-indigo-200">{copy.footnote}</p>
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">{children}</section>
    </main>
  );
}
