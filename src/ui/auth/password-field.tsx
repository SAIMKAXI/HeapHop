"use client";
// A password field with a show / hide button inside it (login and sign-up). It looks and
// behaves like Field in form-bits.tsx. The password is hidden again when the form is sent, so
// password managers still see a password field and offer to save it.
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField({
  label, name, error, autoComplete, hint, maxLength,
}: { label: string; name: string; error?: string; autoComplete?: string; hint?: string; maxLength?: number }) {
  const id = `f-${name}`;
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const hide = () => setShown(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}</label>
      <div className="relative">
        <input
          ref={input} id={id} name={name} type={shown ? "text" : "password"} autoComplete={autoComplete} maxLength={maxLength}
          spellCheck={false} autoCapitalize="none" autoCorrect="off"
          required aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className="w-full rounded-lg border-2 border-card-border bg-background py-2.5 pl-3 pr-12 text-base outline-none sm:text-sm lg:py-2 transition-colors focus:border-accent aria-invalid:border-danger"
        />
        <button
          type="button" onClick={() => setShown((s) => !s)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={shown} aria-controls={id}
          title={shown ? "Hide password" : "Show password"} data-password-toggle={name}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      </div>
      {error ? <p id={`${id}-err`} className="mt-1 text-xs text-danger" data-field-error={name}>{error}</p>
        : hint ? <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
