// Logging out is a POST from the header's form. A request from another site is refused: its
// Origin won't match, and the SameSite cookie isn't sent with it anyway (CSRF).
import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/server/supabase";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return new NextResponse("Forbidden", { status: 403 });
  try {
    await (await serverSupabase()).auth.signOut();
  } catch {
    // Already signed out.
  }
  return NextResponse.redirect(new URL("/", request.url), 303);
}
