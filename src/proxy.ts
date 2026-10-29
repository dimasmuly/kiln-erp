import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: no session cookie means "go to /login" before any
 * rendering work happens. Real validation (EmberKV lookup, user active,
 * permissions) runs in the Data Access Layer on every page and action.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("kiln_session")) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = next === "/" || next === "/dashboard" ? "" : `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|unavailable|api/health|_next/static|_next/image|favicon.ico).*)"],
};
