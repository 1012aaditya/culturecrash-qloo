import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { getSessionUser } from "@/lib/auth/session";

export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  return (
    <>
      <SiteNav signedIn={Boolean(user)} />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
