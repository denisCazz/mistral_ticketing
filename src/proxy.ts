import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { RAPPORTINI_ENABLED } from "@/lib/config";

type AuthUser = { role?: string; mustChangePassword?: boolean };

export default auth((req: NextRequest & { auth: { user?: AuthUser } | null }) => {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron") ||
    pathname === "/manifest.webmanifest"
  ) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated.
  // Auth.js can return a truthy session without `user` (stale/partial JWT).
  if (!req.auth?.user) {
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth.user?.mustChangePassword) {
    const allowed =
      pathname.startsWith("/cambio-password") ||
      pathname.startsWith("/api/account/password") ||
      pathname.startsWith("/api/auth");
    if (!allowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Cambio password obbligatorio" },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/cambio-password", req.url));
    }
  }

  // Rapportini disabilitati
  if (
    !RAPPORTINI_ENABLED &&
    (pathname.startsWith("/rapportini") || pathname.startsWith("/api/rapportini"))
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Rapportini disabilitati" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Protect admin routes
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/import") ||
    pathname.startsWith("/dipendenti") ||
    pathname.startsWith("/costi") ||
    pathname.startsWith("/configurazione") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/presenze") ||
    pathname.startsWith("/api/costi") ||
    pathname.startsWith("/api/configurazione")
  ) {
    if (req.auth.user?.role !== "ADMIN") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
