// Checks for everything a visitor types into the account forms. Pure functions, used by the
// server actions (the real gate) and by the forms (for early, friendly messages). The same
// limits are enforced a third time by the database's CHECK constraints.

/** Characters that never belong in a name: markup, template and shell syntax, control codes. */
const UNSAFE = /[<>{}[\]`$\\\u0000-\u001f\u007f]/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LIMITS = { name: [2, 80], university: [2, 120], email: 254, password: [10, 72] } as const;

/** Pages that need an account. Everything else stays open. */
export const PROTECTED = ["/learn", "/editor", "/account", "/admin"] as const;

export type FieldErrors = Partial<Record<"fullName" | "email" | "university" | "password" | "confirm" | "current" | "code", string>>;

const squash = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

function text(raw: unknown, [min, max]: readonly [number, number], what: string): { value: string; error?: string } {
  const value = typeof raw === "string" ? squash(raw) : "";
  if (value.length < min) return { value, error: `Enter your ${what}.` };
  if (value.length > max) return { value, error: `Keep your ${what} under ${max} characters.` };
  if (UNSAFE.test(value)) return { value, error: `Your ${what} can't contain < > { } [ ] \` $ or \\.` };
  return { value };
}

export function cleanName(raw: unknown) { return text(raw, LIMITS.name, "full name"); }
export function cleanUniversity(raw: unknown) { return text(raw, LIMITS.university, "university or college"); }

export function cleanEmail(raw: unknown): { value: string; error?: string } {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return { value, error: "Enter your email." };
  if (value.length > LIMITS.email || !EMAIL.test(value)) return { value, error: "Enter a valid email address." };
  return { value };
}

const COMMON = ["password", "12345678", "qwerty", "heaphop", "letmein", "welcome", "iloveyou", "admin", "abc123"];

/** At least 10 characters, three of four kinds (lower, upper, digit, symbol), not built from the email. */
export function passwordProblem(password: unknown, email = ""): string | undefined {
  if (typeof password !== "string" || password.length < LIMITS.password[0]) return `Use at least ${LIMITS.password[0]} characters.`;
  if (new TextEncoder().encode(password).length > LIMITS.password[1]) return `Keep it under ${LIMITS.password[1]} bytes.`;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (kinds < 3) return "Mix at least three of: lowercase, uppercase, numbers, symbols.";
  const lower = password.toLowerCase();
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 3 && lower.includes(local)) return "Don't build your password from your email.";
  if (COMMON.some((w) => lower.includes(w))) return "That password is too easy to guess.";
  if (/^(.)\1+$/.test(password)) return "That password is too easy to guess.";
  return undefined;
}

export interface SignupInput { fullName: string; email: string; university: string; password: string }

export function validateSignup(form: { get(name: string): unknown }): { input: SignupInput; errors: FieldErrors } {
  const fullName = cleanName(form.get("fullName"));
  const email = cleanEmail(form.get("email"));
  const university = cleanUniversity(form.get("university"));
  const password = typeof form.get("password") === "string" ? (form.get("password") as string) : "";
  const errors: FieldErrors = {};
  if (fullName.error) errors.fullName = fullName.error;
  if (email.error) errors.email = email.error;
  if (university.error) errors.university = university.error;
  const pw = passwordProblem(password, email.value);
  if (pw) errors.password = pw;
  if (form.get("confirm") !== password) errors.confirm = "The two passwords don't match.";
  return { input: { fullName: fullName.value, email: email.value, university: university.value, password }, errors };
}

/** Where to go after logging in: only a path on this site, never another site (open redirect). */
export function safeNext(raw: unknown, fallback = "/learn"): string {
  if (typeof raw !== "string" || raw.length > 300) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || /[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, "https://heaphop.invalid");
    if (url.origin !== "https://heaphop.invalid") return fallback;
    if (url.pathname.startsWith("/login") || url.pathname.startsWith("/signup") || url.pathname.startsWith("/auth/")) return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}

export const isProtected = (path: string) => PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const isTotpCode = (v: unknown): v is string => typeof v === "string" && /^\d{6}$/.test(v.trim());
