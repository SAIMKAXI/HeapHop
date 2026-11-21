"use server";
// The account page: change name and university, change password, set up or remove MFA.
// Each action re-reads the session on the server; the database's RLS and column grants decide
// again what may change (only your own name and university).
import { revalidatePath } from "next/cache";
import { allow } from "../rate-limit";
import { requireViewer } from "../session";
import { bareSupabase, serverSupabase } from "../supabase";
import { cleanName, cleanUniversity, isTotpCode, isUuid, passwordProblem } from "../validate";
import type { FormState } from "./auth";

const BROKEN = "Something went wrong on our side. Please try again.";

export async function updateProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer("/account");
  const name = cleanName(form.get("fullName"));
  const uni = cleanUniversity(form.get("university"));
  const values = { fullName: name.value, university: uni.value };
  if (name.error || uni.error) return { fields: { fullName: name.error, university: uni.error }, values };
  const supabase = await serverSupabase();
  const { error } = await supabase.from("profiles").update({ full_name: name.value, university: uni.value }).eq("id", viewer.id);
  if (error) return { error: BROKEN, values };
  revalidatePath("/account");
  return { ok: true, message: "Saved.", values };
}

export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer("/account");
  const current = form.get("current");
  const password = form.get("password");
  if (typeof current !== "string" || !current) return { fields: { current: "Enter your current password." } };
  const problem = passwordProblem(password, viewer.email);
  if (problem) return { fields: { password: problem } };
  if (form.get("confirm") !== password) return { fields: { confirm: "The two passwords don't match." } };
  if (current === password) return { fields: { password: "Choose a password you haven't used here." } };
  if (!(await allow("passwordUser", viewer.id))) return { error: "Too many attempts. Wait a few minutes and try again." };
  // Check the current password with a separate client, so the visitor's session is not replaced.
  const { error: wrong } = await bareSupabase().auth.signInWithPassword({ email: viewer.email, password: current });
  if (wrong) return { fields: { current: "Your current password is wrong." } };
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.updateUser({ password: password as string });
  if (error) return { error: error.code === "insufficient_aal" ? "Enter an MFA code first (log out and in again)." : BROKEN };
  return { ok: true, message: "Password changed." };
}

export interface MfaSetup extends FormState {
  factorId?: string;
  qr?: string;
  secret?: string;
}

export async function startMfa(): Promise<MfaSetup> {
  await requireViewer("/account");
  const supabase = await serverSupabase();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // Clear half-finished set-ups first, so a new QR code always works.
  for (const f of factors?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `HeapHop ${Date.now()}` });
  if (error || !data) return { error: BROKEN };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmMfa(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer("/account");
  const factorId = form.get("factorId");
  const code = String(form.get("code") ?? "").trim();
  if (!isUuid(factorId)) return { error: BROKEN };
  if (!isTotpCode(code)) return { fields: { code: "Enter the 6-digit code from your authenticator app." } };
  if (!(await allow("mfaUser", viewer.id))) return { error: "Too many attempts. Wait a few minutes and try again." };
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { fields: { code: "That code didn't work. Check your phone's clock and try the newest code." } };
  revalidatePath("/account");
  return { ok: true, message: "MFA is on. You'll be asked for a code each time you log in." };
}

export async function removeMfa(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer("/account");
  const factorId = form.get("factorId");
  if (!isUuid(factorId) || !viewer.mfaDone) return { error: BROKEN };
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { error: BROKEN };
  revalidatePath("/account");
  return { ok: true, message: "MFA is off." };
}
