import { NextResponse } from "next/server";
import { verifyToken, TOKEN_COOKIE } from "@/lib/jwt";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.set(TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  }
  if (pathname.startsWith("/admin") && user.rol !== "admin") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
