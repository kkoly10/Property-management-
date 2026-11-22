import Link from "next/link";
import { cookies } from "next/headers";
import { ResetPasswordForm } from "../forgot-password/forms";
import { readPasswordRecovery } from "@/lib/auth/password-recovery";

export default async function ResetPasswordPage() {
  const challenge = readPasswordRecovery(await cookies());
  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      {challenge ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">Use at least 10 characters.</p>
          <ResetPasswordForm flowId={challenge.flowId} />
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">This reset link is unavailable. Open the email again or request another link.</p>
      )}
      <Link href="/forgot-password" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">Request a new reset link</Link>
    </div>
  );
}
