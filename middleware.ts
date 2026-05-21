// ============================================================
// Middleware - refreshes the Supabase auth session on every
// request and gates every dashboard route behind login.
// No mock-mode bypass: credentials are always required.
// ============================================================

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const PROTECTED = [
  "/dashboard", "/workorders", "/feed", "/scheduling", "/approvals",
  "/projects", "/amc", "/repair", "/inventory", "/logistics",
  "/customers", "/team", "/reports", "/admin",
  "/notifications", "/organizations", "/admins",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED.some(p => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Redirect bare `/` to `/dashboard` (middleware will then enforce auth on it)
  if (req.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // If Supabase isn't configured we can't authenticate anyone - force protected
  // routes to /login so the situation is visible instead of silently open.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    if (isProtectedPath(req.nextUrl.pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("config", "missing");
      return NextResponse.redirect(url);
    }
    return res;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { res.cookies.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { res.cookies.set({ name, value: "", ...options }); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const isProtected = isProtectedPath(req.nextUrl.pathname);

  if (isProtected && !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (req.nextUrl.pathname === "/login" && user) {
    const next = req.nextUrl.searchParams.get("next");
    return NextResponse.redirect(new URL(next || "/dashboard", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
