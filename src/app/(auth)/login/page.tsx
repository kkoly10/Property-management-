import { headers } from "next/headers";
import { LoginForm } from "@/app/(auth)/login/login-form";
import { Wordmark } from "@/components/brand/wordmark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { classifyHost } from "@/lib/runtime/host";
import { AUTH_SURFACE_COPY, authSurfaceFor } from "@/lib/auth/surface-copy";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  // Presentation context only. See @/lib/auth/surface-copy: the host picks the words, never the data.
  const copy = AUTH_SURFACE_COPY[authSurfaceFor(classifyHost((await headers()).get("host")))];

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 lg:hidden"><Wordmark product={copy.product} /></div>
      <Card className="border-0 shadow-none sm:border sm:shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
        <CardHeader className="pb-4">
          <p className="mb-2 text-sm font-semibold text-primary">Welcome back</p>
          <CardTitle className="text-2xl">{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={params.next} emailLabel={copy.emailLabel} showTrialLink={copy.showTrialLink} />
        </CardContent>
      </Card>
    </div>
  );
}
