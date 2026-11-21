// Who is visiting, worked out on the server for each request. Pages and actions use this to
// decide what to show; the database's RLS policies decide again what data they may touch.
import { redirect } from "next/navigation";
import { serverSupabase } from "./supabase";

export interface Viewer {
  id: string;
  email: string;
  fullName: string;
  university: string;
  role: "student" | "admin";
  /** True once the visitor has passed MFA in this session (or has no MFA set up). */
  mfaDone: boolean;
  hasMfa: boolean;
}

export async function getViewer(): Promise<Viewer | null> {
  let supabase;
  try {
    supabase = await serverSupabase();
  } catch {
    return null; // not configured (e.g. the VS Code build): nobody is signed in
  }
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  const [{ data: profile }, { data: aal }] = await Promise.all([
    supabase.from("profiles").select("email, full_name, university, role, disabled").eq("id", sub).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (!profile || profile.disabled) return null;
  return {
    id: sub,
    email: profile.email,
    fullName: profile.full_name,
    university: profile.university,
    role: profile.role,
    hasMfa: aal?.nextLevel === "aal2",
    mfaDone: aal?.nextLevel !== "aal2" || aal?.currentLevel === "aal2",
  };
}

/** For pages that need an account: the viewer, or a redirect to log in. */
export async function requireViewer(path: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!viewer.mfaDone) redirect(`/login/mfa?next=${encodeURIComponent(path)}`);
  return viewer;
}
