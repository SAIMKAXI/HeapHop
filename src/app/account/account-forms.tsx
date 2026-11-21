"use client";
import { useActionState, useState, useTransition } from "react";
import type { FormState } from "@/server/actions/auth";
import { changePassword, confirmMfa, removeMfa, startMfa, updateProfile, type MfaSetup } from "@/server/actions/account";
import { AuthCard, Banner, Field, Submit } from "@/ui/auth/form-bits";
import { LIMITS } from "@/server/validate";

const h2 = "mt-8 border-t border-card-border pt-6 text-lg font-bold first:mt-0 first:border-0 first:pt-0";

export function AccountForms({ email, fullName, university, admin, mfaFactorId }: {
  email: string; fullName: string; university: string; admin: boolean; mfaFactorId: string | null;
}) {
  const [profile, saveProfile, savingProfile] = useActionState<FormState, FormData>(updateProfile, {});
  const [pw, savePw, savingPw] = useActionState<FormState, FormData>(changePassword, {});
  const [confirm, confirmCode, confirming] = useActionState<FormState, FormData>(confirmMfa, {});
  const [removal, remove, removing] = useActionState<FormState, FormData>(removeMfa, {});
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [starting, start] = useTransition();
  const mfaOn = (mfaFactorId && !removal.ok) || confirm.ok;
  return (
    <AuthCard wide title="Your account" intro={<>Signed in as <span className="font-semibold text-foreground">{email}</span>{admin && " · admin"}</>}>
      <section data-account-profile>
        <h2 className={h2}>Profile</h2>
        <form action={saveProfile} noValidate className="mt-4">
          {profile.error && <Banner kind="error">{profile.error}</Banner>}
          {profile.ok && <Banner kind="ok">{profile.message}</Banner>}
          <Field label="Full name" name="fullName" maxLength={LIMITS.name[1]} defaultValue={profile.values?.fullName ?? fullName} error={profile.fields?.fullName} />
          <Field label="University or college" name="university" maxLength={LIMITS.university[1]} defaultValue={profile.values?.university ?? university} error={profile.fields?.university} />
          <Submit pending={savingProfile}>Save profile</Submit>
        </form>
      </section>

      <section data-account-password>
        <h2 className={h2}>Password</h2>
        <form action={savePw} noValidate className="mt-4">
          {pw.error && <Banner kind="error">{pw.error}</Banner>}
          {pw.ok && <Banner kind="ok">{pw.message}</Banner>}
          <Field label="Current password" name="current" type="password" autoComplete="current-password" maxLength={200} error={pw.fields?.current} />
          <Field label="New password" name="password" type="password" autoComplete="new-password" maxLength={72} error={pw.fields?.password}
            hint="At least 10 characters, mixing three of: lowercase, uppercase, numbers, symbols." />
          <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" maxLength={72} error={pw.fields?.confirm} />
          <Submit pending={savingPw}>Change password</Submit>
        </form>
      </section>

      <section data-account-mfa>
        <h2 className={h2}>Two-factor authentication (MFA)</h2>
        {mfaOn ? (
          <div className="mt-4">
            <Banner kind="ok">{confirm.ok ? confirm.message : "MFA is on. You're asked for a code from your authenticator app when you log in."}</Banner>
            {mfaFactorId && (
              <form action={remove}>
                {removal.error && <Banner kind="error">{removal.error}</Banner>}
                <input type="hidden" name="factorId" value={mfaFactorId} />
                <button type="submit" disabled={removing} className="rounded-full border-2 border-card-border px-4 py-2 text-sm font-semibold hover:border-danger hover:text-danger">
                  Turn MFA off
                </button>
              </form>
            )}
          </div>
        ) : setup?.factorId ? (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…), then type the code it shows.</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: SVG made by Supabase */}
            <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="my-4 rounded-lg bg-white p-2" data-mfa-qr />
            <p className="mb-4 text-xs text-muted-foreground">Can&apos;t scan? Enter this key: <code className="break-all font-mono text-foreground">{setup.secret}</code></p>
            <form action={confirmCode} noValidate>
              {confirm.error && <Banner kind="error">{confirm.error}</Banner>}
              <input type="hidden" name="factorId" value={setup.factorId} />
              <Field label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={confirm.fields?.code} />
              <Submit pending={confirming}>Turn MFA on</Submit>
            </form>
          </div>
        ) : (
          <div className="mt-4">
            <p className="mb-3 text-sm text-muted-foreground">Add a second step to logging in: a code from an app on your phone. Someone who learns your password still can&apos;t get in.</p>
            {setup?.error && <Banner kind="error">{setup.error}</Banner>}
            <button type="button" disabled={starting} onClick={() => start(async () => setSetup(await startMfa()))}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90 disabled:opacity-60" data-mfa-start>
              {starting ? "Please wait…" : "Set up MFA"}
            </button>
          </div>
        )}
      </section>
    </AuthCard>
  );
}
