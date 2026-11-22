"use client";
import { useActionState } from "react";
import { requestReset, type FormState } from "@/server/actions/auth";
import { AuthCard, Banner, Field, Submit } from "@/ui/auth/form-bits";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestReset, {});
  return (
    <AuthCard title="Forgot your password?" intro={<>Remembered it? <a href="/login" className="font-semibold text-accent hover:underline">Log in</a></>}>
      {state.ok ? (
        <Banner kind="ok">{state.message}</Banner>
      ) : (
        <form action={action} noValidate data-forgot-form>
          {state.error && <Banner kind="error">{state.error}</Banner>}
          <p className="mb-4 text-sm text-muted-foreground">Enter the email you signed up with. We&apos;ll send a link to choose a new password.</p>
          <Field label="Email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} defaultValue={state.values?.email} error={state.fields?.email} />
          <Submit pending={pending}>Send the link</Submit>
        </form>
      )}
    </AuthCard>
  );
}
