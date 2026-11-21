// Rate limits for sign-up, login, MFA codes and password changes, counted in the database.
// The bucket key is an HMAC of (what, who) made with a server-only secret, so the database
// never stores IP addresses or emails, and nobody can fill another person's bucket.
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { bareSupabase } from "./supabase";

export const RULES = {
  signupIp: { max: 5, seconds: 3600 },
  loginIp: { max: 20, seconds: 600 },
  loginEmail: { max: 8, seconds: 600 },
  mfaUser: { max: 10, seconds: 600 },
  passwordUser: { max: 5, seconds: 600 },
} as const;

export function bucketKey(secret: string, rule: string, who: string): string {
  return createHmac("sha256", secret).update(`${rule}\u0000${who}`).digest("hex");
}

/** The visitor's IP as Vercel reports it (the first x-forwarded-for entry). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

/** True if this attempt is allowed. Fails closed: if the limiter cannot be reached, the attempt is refused. */
export async function allow(rule: keyof typeof RULES, who: string): Promise<boolean> {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new Error("RATE_LIMIT_SECRET is not configured.");
  const { max, seconds } = RULES[rule];
  const { data, error } = await bareSupabase().rpc("rate_limit_hit", { p_key: bucketKey(secret, rule, who), p_max: max, p_window_seconds: seconds });
  if (error) return false;
  return data === true;
}
