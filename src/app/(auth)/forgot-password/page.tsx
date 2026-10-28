import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="cc-display text-5xl">Reset your password.</h1>
      <p className="mb-8 mt-3 text-sm text-muted">We will email you a secure link to choose a new password.</p>
      <ForgotPasswordForm />
      <p className="mt-8 text-center text-sm text-muted"><Link href="/login" className="font-medium text-ink hover:underline">Back to sign in</Link></p>
    </>
  );
}
