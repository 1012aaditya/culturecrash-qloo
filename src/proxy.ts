import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/projects", "/search", "/tasks", "/workspace", "/settings", "/help"];
const LOCAL_COOKIE = "cc_local_session";
/** Not a credential: tells static marketing pages whether to show "Dashboard" or "Sign in". */
const SIGNED_IN_HINT = "cc_signed_in";

/**
 * Optimistic route protection + Supabase session refresh. Real authorization happens
 * on the server next to the data (getCtx/withUser) and in Postgres RLS.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  let response = NextResponse.next({ request });
  let hasSession = false;

  if (process.env.AUTH_MODE === "local") {
    hasSession = Boolean(request.cookies.get(LOCAL_COOKIE)?.value);
  } else if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getClaims();
    hasSession = Boolean(data?.claims?.sub);
  }

  const hinted = request.cookies.get(SIGNED_IN_HINT)?.value === "1";
  if (hinted !== hasSession) {
    response.cookies.set(SIGNED_IN_HINT, hasSession ? "1" : "", { path: "/", sameSite: "lax", maxAge: hasSession ? 60 * 60 * 24 * 30 : 0 });
  }

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // API routes authenticate themselves (and can refresh the session); skipping the proxy saves a
  // session check on every poll.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
