import Image from "next/image";
import { headers } from "next/headers";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { Wordmark } from "@/components/brand/wordmark";
import { LivingCommunityIdentity } from "@/components/crecy/living-community-identity";
import { classifyHost } from "@/lib/runtime/host";
import { AUTH_SURFACE_COPY, authSurfaceFor } from "@/lib/auth/surface-copy";
import { getPublicLivingCommunityPresentation } from "@/lib/data/living-community";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const classification = classifyHost(requestHeaders.get("host"));
  const surface = authSurfaceFor(classification);
  const copy = AUTH_SURFACE_COPY[surface];
  const community = classification.kind === "living-community"
    ? await getPublicLivingCommunityPresentation(classification.community)
    : null;

  return (
    <div className="w-full max-w-[430px]">
      <div className="mb-6 lg:hidden">
        <Wordmark product={copy.product} className="max-w-[9rem]" />
      </div>

      {community ? (
        <LivingCommunityIdentity
          className="mb-7 min-h-[220px] rounded-[1rem] shadow-[0_18px_45px_rgba(6,95,63,.18)] lg:hidden"
          title={community.displayName}
          subtitle={community.publicAddressText ?? "Your resident portal"}
          media={community.heroImageUrl ? (
            <Image
              src={community.heroImageUrl}
              alt=""
              fill
              unoptimized
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : undefined}
          badge={
            <span className="rounded-full border border-white/20 bg-black/20 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
              {community.isDemo ? "Crecy Living · Demo" : "Crecy Living"}
            </span>
          }
        />
      ) : null}

      <div className="border-b pb-6">
        <p className="text-sm font-medium text-primary">
          {community ? "Welcome home." : "Welcome back"}
        </p>
        <h2 className="mt-2 text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] text-foreground">
          {community ? "Sign in to " + community.displayName : copy.title}
        </h2>
        <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          {community
            ? "Payments, maintenance, messages, documents, and community updates stay connected to your home."
            : copy.description}
        </p>
      </div>

      <div className="pt-7">
        <LoginForm next={params.next} emailLabel={copy.emailLabel} showTrialLink={copy.showTrialLink} />
      </div>

      <p className="mt-8 border-t pt-5 text-xs leading-5 text-muted-foreground lg:hidden">
        {copy.footnote}
      </p>
    </div>
  );
}
