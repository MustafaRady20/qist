import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "qist_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const PUBLIC_PATHS = ["/login"];

/**
 * Optimistic check only: no cookie → login page. The session itself is
 * verified in the Data Access Layer on every page, action and API call.
 */
export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!token && !isPublic) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  if (token) {
    // Slide the cookie with the server-side session renewal.
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }
  return res;
}

export const config = {
  // API routes authenticate themselves (and return 401 JSON instead of redirects).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|brand/).*)"],
};
