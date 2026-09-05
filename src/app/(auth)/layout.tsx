import { headers } from "next/headers";
import { AuthSurfaceStage } from "@/components/auth/auth-surface-stage";
import { SurfaceTheme, type CrecyVisualSurface } from "@/components/crecy/surface-theme";
import { classifyHost } from "@/lib/runtime/host";
import { AUTH_SURFACE_COPY, authSurfaceFor } from "@/lib/auth/surface-copy";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const classification = classifyHost((await headers()).get("host"));
  const surface = authSurfaceFor(classification);
  const copy = AUTH_SURFACE_COPY[surface];
  const visualSurface: CrecyVisualSurface = surface === "resident" ? "living" : surface === "owner" ? "owner" : "os";

  return (
    <SurfaceTheme surface={visualSurface} className="min-h-screen bg-[var(--surface-canvas)]">
      <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(430px,.95fr)]">
        <section className="hidden min-h-screen lg:block">
          <AuthSurfaceStage surface={surface} copy={copy} />
        </section>
        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:bg-card">
          {children}
        </section>
      </main>
    </SurfaceTheme>
  );
}
