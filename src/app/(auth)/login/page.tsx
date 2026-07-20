import { LoginForm } from "@/app/(auth)/login/login-form";
import { Wordmark } from "@/components/brand/wordmark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 lg:hidden"><Wordmark /></div>
      <Card className="border-0 shadow-none sm:border sm:shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
        <CardHeader className="pb-4">
          <p className="mb-2 text-sm font-semibold text-primary">Welcome back</p>
          <CardTitle className="text-2xl">Sign in to Crecy</CardTitle>
          <CardDescription>Continue to your operator workspace.</CardDescription>
        </CardHeader>
        <CardContent><LoginForm next={params.next} /></CardContent>
      </Card>
    </div>
  );
}
