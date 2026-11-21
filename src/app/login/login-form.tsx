"use client";
import { useActionState } from "react";
import { logIn, type FormState } from "@/server/actions/auth";
import { AuthCard, Banner, Field, Submit } from "@/ui/auth/form-bits";

export function LoginForm({ next, notice, noticeKind }: { next: string; notice?: string; noticeKind: "ok" | "error" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(logIn, {});
  return (
    <AuthCard title="Log in" intro={<>New to HeapHop? <a href="/signup" className="font-semibold text-accent hover:underline">Create an account</a></>}>
      <form action={action} noValidate data-login-form>
        {notice && !state.error && <Banner kind={noticeKind}>{notice}</Banner>}
        {state.error && <Banner kind="error">{state.error}</Banner>}
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} defaultValue={state.values?.email} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" maxLength={200} />
        <Submit pending={pending}>Log in</Submit>
      </form>
    </AuthCard>
  );
}
