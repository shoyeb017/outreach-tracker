import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isUiTestMode } from "@/lib/config/ui-test-mode";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return isUiTestMode() ? response : NextResponse.json({ error: "The application is temporarily unavailable. Contact the administrator." }, { status: 503, headers: { "Cache-Control": "no-store" } });

  const supabase = createServerClient(url, key, {
    ...(request.nextUrl.pathname.startsWith("/admin") || request.nextUrl.pathname.startsWith("/api/admin/") ? { cookieOptions: { name: "outreach-admin-auth", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" } } : {}),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  // These routes enforce their own server authorization (admin has a separate HTTP-only session).
  const publicPath = path === "/" || path.startsWith("/login") || path.startsWith("/register") || path.startsWith("/forgot-password") || path.startsWith("/auth/") || path === "/api/auth/login" || path === "/help" || path.startsWith("/help/") || path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/") || path.startsWith("/api/microsoft/");
  if (!user && !publicPath) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  if (user && ["/login", "/register"].includes(path) && !(path === "/login" && request.nextUrl.searchParams.get("next") === "/admin")) {
    const dashboard = request.nextUrl.clone();
    dashboard.pathname = "/dashboard";
    dashboard.search = "";
    return NextResponse.redirect(dashboard);
  }
  return response;
}
