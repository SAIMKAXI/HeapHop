"use client";
import { useActionState } from "react";
import { logIn, type FormState } from "@/server/actions/auth";
import { PasswordField } from "@/ui/auth/password-field";
import { AuthCard, Banner, Field, Submit } from "@/ui/auth/form-bits";
import { Captcha } from "@/ui/auth/captcha";
import { LoginAside } from "@/ui/auth/login-aside";
import { DisabledNotice } from "@/ui/auth/disabled-notice";

export function LoginForm({ next, notice, noticeKind, disabled, captchaSiteKey }: {
  next: string; notice?: string; noticeKind: "ok" | "error";
  /** The account was disabled while signed in (the proxy sent the visitor here). */
  disabled?: FormState["disabled"];
  captchaSiteKey?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(logIn, {});
  return (
    <AuthCard aside={<LoginAside />} title="Log in" intro={<>New to HeapHop? <a href="/signup" className="font-semibold text-accent hover:underline">Create an account</a></>}>
      <form action={action} noValidate data-login-form>
        {state.disabled ? <DisabledNotice {...state.disabled} />
          : state.error ? <Banner kind="error">{state.error}</Banner>
          : disabled ? <DisabledNotice {...disabled} />
          : notice ? <Banner kind={noticeKind}>{notice}</Banner> : null}
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} defaultValue={state.values?.email} />
        <PasswordField label="Password" name="password" autoComplete="current-password" maxLength={200} />
        <p className="-mt-2 mb-3 text-right text-xs"><a href="/forgot-password" className="inline-flex min-h-10 items-center text-muted-foreground hover:text-accent hover:underline lg:min-h-0" data-forgot-link>Forgot your password?</a></p>
        <Captcha siteKey={captchaSiteKey} resetSignal={state} />
        <Submit pending={pending}>Log in</Submit>
      </form>
    </AuthCard>
  );
}
