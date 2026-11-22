import Link from "next/link";
import { ForgotPasswordForm } from "./forms";

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-sm text-muted-foreground">Enter the email address you use for Crecy.</p>
      <ForgotPasswordForm />
      <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">Back to sign in</Link>
    </div>
  );
}
