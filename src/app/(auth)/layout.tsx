import Link from "next/link";
import { ArtPlate } from "@/components/art/plate";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-charcoal lg:block" aria-hidden="true">
        <ArtPlate theme="beauty" seed="auth" rounded={false} className="absolute inset-0 opacity-90" />
        <div className="absolute inset-x-12 bottom-14 text-white">
          <p className="cc-eyebrow text-white/60">CultureCrash</p>
          <p className="cc-display mt-4 max-w-md text-6xl">Understand people through culture.</p>
          <p className="mt-5 max-w-sm text-sm text-white/65">Evidence first. Interpretation labelled. Hypotheses tested.</p>
        </div>
      </aside>
      <main id="main" className="cc-atmosphere flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">{children}</div>
        <p className="text-center text-xs text-muted">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link> · <Link href="/terms" className="hover:text-ink">Terms</Link>
        </p>
      </main>
    </div>
  );
}
