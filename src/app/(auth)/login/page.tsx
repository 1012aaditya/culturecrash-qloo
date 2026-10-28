import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <>
      <h1 className="cc-display text-5xl">Welcome back.</h1>
      <p className="mb-8 mt-3 text-sm text-muted">Sign in to your CultureCrash workspace.</p>
      {sp.error === "link" && <p role="alert" className="mb-4 rounded-cc-sm bg-danger/8 p-3 text-[13px] text-danger">That link is invalid or has expired. Request a new one.</p>}
      <SignInForm next={next} />
      <p className="mt-8 text-center text-sm text-muted">New to CultureCrash? <Link href="/signup" className="font-medium text-ink underline-offset-4 hover:underline">Create an account</Link></p>
    </>
  );
}
