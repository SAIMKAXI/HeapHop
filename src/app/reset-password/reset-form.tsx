"use client";
import { useActionState } from "react";
import Link from "next/link";
import { setNewPassword, type FormState } from "@/server/actions/auth";
import { AuthCard, Banner, Field, Submit } from "@/ui/auth/form-bits";

export function ResetForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(setNewPassword, {});
  return (
    <AuthCard title="Choose a new password">
      {state.ok ? (
        <>
          <Banner kind="ok">{state.message}</Banner>
          <Link href="/learn" className="font-semibold text-accent hover:underline" data-continue>Continue to Learn →</Link>
        </>
      ) : (
        <form action={action} noValidate data-reset-form>
          {state.error && <Banner kind="error">{state.error}</Banner>}
          <Field label="New password" name="password" type="password" autoComplete="new-password" maxLength={72} error={state.fields?.password}
            hint="At least 10 characters, mixing three of: lowercase, uppercase, numbers, symbols." />
          <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" maxLength={72} error={state.fields?.confirm} />
          <Submit pending={pending}>Save new password</Submit>
        </form>
      )}
    </AuthCard>
  );
}
