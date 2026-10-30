import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

// No session lookup here: marketing pages stay static (served from the CDN). The nav reads a
// non-secret sign-in hint cookie in the browser to choose between "Dashboard" and "Sign in".
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <div className="cc-scroll-progress" aria-hidden="true" />
      <SiteNav />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
