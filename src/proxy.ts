// Runs on the server before every page. It:
//  1. gives the response a fresh nonce and a strict Content-Security-Policy;
//  2. refreshes the Supabase session, keeping it in httpOnly, Secure, SameSite cookies;
//  3. sends visitors without an account (or with a disabled one, or who still owe an MFA code)
//     away from Learn, the editor, the account page and the admin page.
// Pages and the database check again; this is the first gate, not the only one.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, newNonce, SESSION_COOKIE } from "@/server/policy";
import { isProtected } from "@/server/validate";

export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const csp = contentSecurityPolicy(nonce, { dev: process.env.NODE_ENV === "development", https });
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers: forwarded } });
  const path = request.nextUrl.pathname;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const finish = (res: NextResponse) => {
    res.headers.set("content-security-policy", csp);
    if (isProtected(path) || path.startsWith("/login") || path.startsWith("/signup")) res.headers.set("cache-control", "private, no-store");
    return res;
  };
  if (!url || !key) return finish(isProtected(path) ? NextResponse.redirect(new URL("/login", request.url)) : response);

  const supabase = createServerClient(url, key, {
    cookieOptions: SESSION_COOKIE,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, extraHeaders) {
        for (const { name, value } of list) request.cookies.set(name, value);
        forwarded.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers: forwarded } });
        for (const { name, value, options } of list) response.cookies.set(name, value, { ...options, ...SESSION_COOKIE });
        for (const [k, v] of Object.entries(extraHeaders ?? {})) response.headers.set(k, v);
      },
    },
  });
  // Nothing may run between creating the client and this call (it refreshes the session).
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;

  const redirectTo = (to: string) => {
    const res = NextResponse.redirect(new URL(to, request.url));
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return finish(res);
  };
  const here = path + request.nextUrl.search;
  const isAdminPath = path === "/admin" || path.startsWith("/admin/");
  // The admin page does not admit it exists to anyone who isn't an admin: they get a plain 404.
  const notFound = () => {
    const res = NextResponse.rewrite(new URL("/__not-found", request.url), { status: 404, request: { headers: forwarded } });
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return finish(res);
  };

  if (isProtected(path)) {
    if (!sub) return isAdminPath ? notFound() : redirectTo(`/login?next=${encodeURIComponent(here)}`);
    const [{ data: profile }, { data: aal }] = await Promise.all([
      supabase.from("profiles").select("role, disabled").eq("id", sub).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (!profile || profile.disabled) {
      await supabase.auth.signOut();
      return redirectTo("/login?disabled=1");
    }
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") return redirectTo(`/login/mfa?next=${encodeURIComponent(here)}`);
    if (isAdminPath && profile.role !== "admin") return notFound();
  } else if (sub && (path === "/login" || path === "/signup")) {
    return redirectTo("/learn");
  }
  return finish(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|media/|favicon.ico|icon.svg).*)"],
};
