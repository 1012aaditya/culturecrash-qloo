import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="cc-display text-5xl">Start a campaign.</h1>
      <p className="mb-8 mt-3 text-sm text-muted">Create your account and private workspace. No card required during the pilot.</p>
      <SignUpForm />
      <p className="mt-8 text-center text-sm text-muted">Already have an account? <Link href="/login" className="font-medium text-ink underline-offset-4 hover:underline">Sign in</Link></p>
    </>
  );
}
