import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getCtx } from "@/lib/data/workspace";
import { searchWorkspace } from "@/lib/data/search";

export async function GET(request: NextRequest) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ctx = await getCtx();
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const hits = await searchWorkspace(ctx, q);
  return NextResponse.json({ hits });
}
