import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Rate limiting on /api/* (exclude webhooks — they authenticate via HMAC) ──
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/webhooks") &&
    !pathname.startsWith("/api/cron") &&
    !pathname.startsWith("/api/n8n")
  ) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const { allowed, remaining, reset } = await checkRateLimit(ip);

    if (!allowed) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Try again later." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": reset ?? "",
            "Retry-After": "60",
          },
        }
      );
    }

    // Pass remaining header downstream (informational)
    if (remaining >= 0) {
      const res = NextResponse.next({ request });
      res.headers.set("X-RateLimit-Remaining", String(remaining));
      // Continue — we still need auth checks below, so fall through
    }
  }

  // ── 2. Public routes — skip auth entirely ──
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/webhooks") ||  // n8n callbacks — HMAC-protected
    pathname.startsWith("/api/cron") ||       // Vercel cron — CRON_SECRET-protected
    pathname.startsWith("/api/n8n") ||        // n8n inbound routes — HMAC-protected
    pathname === "/favicon.ico";

  if (isPublic) return NextResponse.next({ request });

  // ── 3. Supabase session refresh ──
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // ── 4. Unauthenticated — redirect to /login (page routes) or 401 (API routes) ──
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 5. Role-based access control ──
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as string | undefined;

  const isInternalPage =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/audits") ||
    pathname.startsWith("/reviews") ||
    pathname.startsWith("/settings");

  if (isInternalPage && role !== "admin" && role !== "staff") {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  if (pathname.startsWith("/portal") && role !== "client") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
