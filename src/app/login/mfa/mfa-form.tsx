"use client";
import { useActionState } from "react";
import { verifyMfa, type FormState } from "@/server/actions/auth";
import { AuthCard, Banner, Field, Submit } from "@/ui/auth/form-bits";

export function MfaForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyMfa, {});
  return (
    <AuthCard title="Enter your code" intro="Open your authenticator app and type the 6-digit code for HeapHop.">
      <form action={action} noValidate data-mfa-form>
        {state.error && <Banner kind="error">{state.error}</Banner>}
        <input type="hidden" name="next" value={next} />
        <Field label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={state.fields?.code} />
        <Submit pending={pending}>Continue</Submit>
      </form>
    </AuthCard>
  );
}
