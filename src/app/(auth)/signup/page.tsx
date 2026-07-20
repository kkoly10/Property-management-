import { CheckCircle2 } from "lucide-react";
import { SignupForm } from "@/app/(auth)/signup/signup-form";
import { Wordmark } from "@/components/brand/wordmark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ check_email?: string; auth_error?: string }> }) {
  const params = await searchParams;
  return (
    <div className="w-full max-w-md">
      <div className="mb-8 lg:hidden"><Wordmark /></div>
      <Card className="border-0 shadow-none sm:border sm:shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
        <CardHeader className="pb-4">
          <p className="mb-2 text-sm font-semibold text-primary">Start your Growth trial</p>
          <CardTitle className="text-2xl">Create your Crecy account</CardTitle>
          <CardDescription>No payment method is required for the initial workspace setup.</CardDescription>
        </CardHeader>
        <CardContent>
          {params.check_email ? (
            <Alert className="mb-5 border-[#abefc6] bg-[#ecfdf3] text-success">
              <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>Use the secure link to confirm your account and continue setup.</AlertDescription>
            </Alert>
          ) : null}
          {params.auth_error ? <Alert variant="destructive" className="mb-5"><CheckCircle2 aria-hidden="true" className="h-5 w-5" /><AlertTitle>That link could not be verified</AlertTitle><AlertDescription>Request a new sign-in link and try again.</AlertDescription></Alert> : null}
          <SignupForm />
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">By continuing, you agree to Crecy&apos;s Terms and acknowledge the Privacy Notice.</p>
    </div>
  );
}
