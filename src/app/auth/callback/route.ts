// The link in the sign-up email lands here. Supabase has already confirmed the email; we swap
// the one-time code for a session. The swap only works in the browser that signed up (PKCE),
// so a link someone else sends you cannot log you into their account.
import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/server/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const target = new URL("/login?confirmed=1", request.url);
  if (code && /^[\w-]{10,200}$/.test(code)) {
    try {
      const supabase = await serverSupabase();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL("/learn", request.url));
    } catch {
      // Fall through: the email is confirmed either way, so asking them to log in is right.
    }
  }
  return NextResponse.redirect(target);
}
