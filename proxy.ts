import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";
import { NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  // Public recipient links must never require sign-in or refresh an anonymous session.
  if (request.nextUrl.pathname.startsWith("/e/")) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
