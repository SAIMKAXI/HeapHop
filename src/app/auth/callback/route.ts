// The links in the sign-up and password-reset emails land here. Supabase has already confirmed the email; we swap
// the one-time code for a session. The swap only works in the browser that signed up (PKCE),
// so a link someone else sends you cannot log you into their account.
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { AFTER_AUTH_COOKIE } from "@/server/policy";
import { serverSupabase } from "@/server/supabase";
import { safeNext } from "@/server/validate";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const target = new URL("/login?confirmed=1", request.url);
  if (code && /^[\w-]{10,200}$/.test(code)) {
    try {
      const supabase = await serverSupabase();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      const store = await cookies();
      // A password-reset link continues to the new-password page; a sign-up link to Learn.
      const next = safeNext(store.get(AFTER_AUTH_COOKIE)?.value);
      store.delete(AFTER_AUTH_COOKIE);
      if (!error) return NextResponse.redirect(new URL(next, request.url));
    } catch {
      // Fall through: the email is confirmed either way, so asking them to log in is right.
    }
  }
  return NextResponse.redirect(target);
}
