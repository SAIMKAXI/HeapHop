"use client";
import { useActionState } from "react";
import { signUp, type FormState } from "@/server/actions/auth";
import { PasswordField } from "@/ui/auth/password-field";
import { AuthCard, Banner, Field, Submit } from "@/ui/auth/form-bits";
import { SignupAside } from "@/ui/auth/signup-aside";
import { UniversityPicker } from "@/ui/auth/university-picker";
import type { University } from "@/ui/auth/university-search";
import { LIMITS } from "@/server/validate";

export function SignupForm({ universities }: { universities: University[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, {});
  if (state.ok) {
    return (
      <AuthCard title="Check your email">
        <Banner kind="ok">{state.message}</Banner>
        <p className="text-sm text-muted-foreground">The link opens HeapHop and signs you in. It can take a minute to arrive; check spam too.</p>
      </AuthCard>
    );
  }
  const v = state.values ?? {};
  return (
    <AuthCard aside={<SignupAside />} title="Create your account" intro={<>Already have one? <a href="/login" className="font-semibold text-accent hover:underline">Log in</a></>}>
      <form action={action} noValidate data-signup-form>
        {state.error && <Banner kind="error">{state.error}</Banner>}
        <Field label="Full name" name="fullName" autoComplete="name" maxLength={LIMITS.name[1]} defaultValue={v.fullName} error={state.fields?.fullName} />
        <Field label="Email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={LIMITS.email} defaultValue={v.email} error={state.fields?.email} />
        <UniversityPicker universities={universities} label="University or college" name="university" maxLength={LIMITS.university[1]} defaultValue={v.university} error={state.fields?.university} />
        <PasswordField label="Password" name="password" autoComplete="new-password" maxLength={72} error={state.fields?.password}
          hint="At least 10 characters, mixing three of: lowercase, uppercase, numbers, symbols." />
        <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" maxLength={72} error={state.fields?.confirm} />
        <Submit pending={pending}>Create account</Submit>
      </form>
    </AuthCard>
  );
}
