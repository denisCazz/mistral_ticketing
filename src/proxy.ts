import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { RAPPORTINI_ENABLED } from "@/lib/config";

export default auth((req: NextRequest & { auth: { user?: { role?: string } } | null }) => {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)"],
};
