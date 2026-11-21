// Supabase clients for the server only. The project URL and key live in server environment
// variables (no NEXT_PUBLIC_), so the browser never learns them and never talks to Supabase:
// every auth request goes through our own server, and the session lives in httpOnly cookies.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./policy";

export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY).");
  return { url, key };
}

/** The signed-in visitor's client, reading and writing the session cookies. */
export async function serverSupabase() {
  const store = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookieOptions: SESSION_COOKIE,
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, { ...options, ...SESSION_COOKIE });
        } catch {
          // Server components cannot write cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** A throwaway client with no session, for checking a password without touching the visitor's cookies. */
export function bareSupabase() {
  const { url, key } = supabaseEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
