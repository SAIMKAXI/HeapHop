"use server";
// Sign-up, login, the MFA step and logout. These run only on the server. Next.js checks that
// every server action call comes from this site's own pages (Origin must match Host), and the
// session cookie is SameSite, so another site cannot submit these forms for a visitor (CSRF).
// Errors are logged by code only: never an email, a password or a token.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { referenceFor, reviewIssueUrl } from "../reference";
import { allow, clientIp } from "../rate-limit";
import { serverSupabase } from "../supabase";
import { cleanEmail, isTotpCode, passwordProblem, safeNext, validateSignup, type FieldErrors } from "../validate";
import { AFTER_AUTH_COOKIE, SESSION_COOKIE } from "../policy";
import { requireViewer } from "../session";

export interface FormState {
  ok?: boolean;
  message?: string;
  error?: string;
  fields?: FieldErrors;
  /** What the visitor typed (never the password), to put back in the form. */
  values?: Record<string, string>;
  /** Set when the account is disabled (shown only after the right password). */
  disabled?: { reference: string | null; reviewUrl: string };
}

const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";
const BROKEN = "Something went wrong on our side. Please try again.";

async function siteOrigin(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

function logCode(where: string, error: { code?: string; status?: number } | null | undefined) {
  if (error) console.warn(`[auth] ${where}: ${error.code ?? "error"} (${error.status ?? "-"})`);
}

export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const { input, errors } = validateSignup(form);
  const values = { fullName: input.fullName, email: input.email, university: input.university };
  if (Object.keys(errors).length) return { fields: errors, values };
  try {
    if (!(await allow("signupIp", await clientIp()))) return { error: TOO_MANY, values };
    const supabase = await serverSupabase();
    const { error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName, university: input.university },
        emailRedirectTo: `${await siteOrigin()}/auth/callback`,
      },
    });
    if (error) {
      logCode("signup", error);
      if (error.code === "weak_password") return { fields: { password: "Choose a stronger password." }, values };
      if (error.code === "over_email_send_rate_limit" || error.status === 429) return { error: "We can't send more emails right now. Try again in an hour.", values };
      return { error: BROKEN, values };
    }
  } catch (e) {
    console.warn(`[auth] signup: ${(e as Error).name}`);
    return { error: BROKEN, values };
  }
  // The same answer whether or not the email already has an account, so nobody can use this form
  // to find out who has signed up.
  return { ok: true, message: `If ${input.email} can be used, we've sent a link to it. Open it to finish signing up.` };
}

const DISABLED = "Your account has been disabled.";

export async function logIn(_prev: FormState, form: FormData): Promise<FormState> {
  const email = cleanEmail(form.get("email"));
  const password = form.get("password");
  const next = safeNext(form.get("next"));
  const values = { email: email.value };
  if (email.error || typeof password !== "string" || !password) return { error: "Enter your email and password.", values };
  if (password.length > 200) return { error: "Email or password is wrong.", values };
  let mfa = false;
  try {
    if (!(await allow("loginIp", await clientIp())) || !(await allow("loginEmail", email.value))) return { error: TOO_MANY, values };
    const supabase = await serverSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.value, password });
    if (error || !data.user) {
      logCode("login", error);
      if (error?.code === "email_not_confirmed") return { error: "Confirm your email first: open the link we sent you.", values };
      // Accounts are no longer banned inside Supabase (see admin_set_disabled), so a "banned" answer
      // can't prove the password was right: say nothing more than for a wrong password.
      if (error?.status === 429) return { error: TOO_MANY, values };
      return { error: "Email or password is wrong.", values };
    }
    // The password was right. A disabled account is signed straight out and told why, with a way
    // to ask for a review; nobody without the password ever learns the account is disabled.
    const { data: profile } = await supabase.from("profiles").select("disabled").eq("id", data.user.id).maybeSingle();
    if (!profile || profile.disabled) {
      await supabase.auth.signOut();
      const reference = await referenceFor(data.user.email ?? email.value);
      return { error: DISABLED, values, disabled: { reference, reviewUrl: reviewIssueUrl(reference) } };
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    mfa = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
  } catch (e) {
    console.warn(`[auth] login: ${(e as Error).name}`);
    return { error: BROKEN, values };
  }
  redirect(mfa ? `/login/mfa?next=${encodeURIComponent(next)}` : next);
}

export async function verifyMfa(_prev: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "").trim();
  const next = safeNext(form.get("next"));
  if (!isTotpCode(code)) return { fields: { code: "Enter the 6-digit code from your authenticator app." } };
  try {
    const supabase = await serverSupabase();
    const { data: claims } = await supabase.auth.getClaims();
    const sub = claims?.claims?.sub;
    if (!sub) redirect("/login");
    if (!(await allow("mfaUser", sub))) return { error: TOO_MANY };
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === "verified");
    if (!factor) redirect(next);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) {
      logCode("mfa", error);
      return { fields: { code: "That code didn't work. Codes change every 30 seconds." } };
    }
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    console.warn(`[auth] mfa: ${(e as Error).name}`);
    return { error: BROKEN };
  }
  redirect(next);
}

export async function logOut(): Promise<void> {
  try {
    const supabase = await serverSupabase();
    await supabase.auth.signOut();
  } catch {
    // Signing out of a session that is already gone is fine.
  }
  redirect("/");
}


export async function requestReset(_prev: FormState, form: FormData): Promise<FormState> {
  const email = cleanEmail(form.get("email"));
  if (email.error) return { fields: { email: email.error }, values: { email: email.value } };
  const sent = { ok: true, message: `If ${email.value} has a HeapHop account, we've sent it a link to choose a new password. Open it on this device.` };
  try {
    if (!(await allow("resetIp", await clientIp())) || !(await allow("resetEmail", email.value))) return { error: TOO_MANY, values: { email: email.value } };
    (await cookies()).set(AFTER_AUTH_COOKIE, "/reset-password", { ...SESSION_COOKIE, maxAge: 60 * 30 });
    const supabase = await serverSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email.value, { redirectTo: `${await siteOrigin()}/auth/callback` });
    if (error) {
      logCode("reset", error);
      if (error.status === 429) return { error: "We can't send more emails right now. Try again in an hour.", values: { email: email.value } };
    }
  } catch (e) {
    console.warn(`[auth] reset: ${(e as Error).name}`);
    return { error: BROKEN, values: { email: email.value } };
  }
  // The same answer whether or not the email has an account.
  return sent;
}

export async function setNewPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer("/reset-password");
  const password = form.get("password");
  const problem = passwordProblem(password, viewer.email);
  if (problem) return { fields: { password: problem } };
  if (form.get("confirm") !== password) return { fields: { confirm: "The two passwords don't match." } };
  if (!(await allow("passwordUser", viewer.id))) return { error: TOO_MANY };
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.updateUser({ password: password as string });
  if (error) {
    logCode("new-password", error);
    if (error.code === "same_password") return { fields: { password: "Choose a password you haven't used here." } };
    return { error: BROKEN };
  }
  return { ok: true, message: "Your password has been changed." };
}
