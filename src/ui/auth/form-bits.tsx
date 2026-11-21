// Pieces shared by the sign-up, login and account forms. Plain UI: no server code here.
import type { ReactNode } from "react";
import { AppHeader } from "@/ui/site/app-header";

export function AuthCard({ title, intro, children, wide = false }: { title: string; intro?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader />
      <main className="flex flex-1 items-start justify-center px-5 py-10 sm:py-16">
        <div className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} rounded-2xl border-2 border-card-border bg-card p-6 sm:p-8`}>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {intro && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function Field({
  label, name, type = "text", error, defaultValue, autoComplete, hint, maxLength, inputMode,
}: {
  label: string; name: string; type?: string; error?: string; defaultValue?: string; autoComplete?: string; hint?: string; maxLength?: number;
  inputMode?: "numeric" | "email" | "text";
}) {
  const id = `f-${name}`;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}</label>
      <input
        id={id} name={name} type={type} defaultValue={defaultValue} autoComplete={autoComplete} maxLength={maxLength} inputMode={inputMode}
        required aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className="w-full rounded-lg border-2 border-card-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-accent aria-invalid:border-danger"
      />
      {error ? <p id={`${id}-err`} className="mt-1 text-xs text-danger" data-field-error={name}>{error}</p>
        : hint ? <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Banner({ kind, children }: { kind: "error" | "ok"; children: ReactNode }) {
  return (
    <p role={kind === "error" ? "alert" : "status"} data-banner={kind}
      className={`mb-4 rounded-lg border px-3 py-2 text-sm ${kind === "error" ? "border-danger/40 bg-danger-dim text-danger" : "border-success/40 bg-success-dim text-success"}`}>
      {children}
    </p>
  );
}

export function Submit({ children, pending }: { children: ReactNode; pending: boolean }) {
  return (
    <button type="submit" disabled={pending}
      className="mt-2 w-full rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {pending ? "Please wait…" : children}
    </button>
  );
}
