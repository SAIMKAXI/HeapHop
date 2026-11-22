// The reference code shown to a student whose account is disabled, and the pre-written GitHub
// request to have it reviewed. GitHub issues are public, so the request carries this code, never
// the email: the code is an HMAC of the email with a server-only secret (HH-XXXX-XXXX), and the
// admin page shows the same code next to each disabled account. Web Crypto only, so it also runs
// in the proxy.

const REPO_ISSUES = "https://github.com/SAIMKAXI/HeapHop/issues/new";
const PATTERN = /^HH-[0-9A-F]{4}-[0-9A-F]{4}$/;

export async function accountReference(secret: string, email: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`account-reference\u0000${email.trim().toLowerCase()}`)));
  const hex = [...mac.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `HH-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/** The reference code for an email, or null when the server has no secret to make one. */
export async function referenceFor(email: string | null | undefined): Promise<string | null> {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret || !email) return null;
  return accountReference(secret, email);
}

export const isReference = (v: unknown): v is string => typeof v === "string" && PATTERN.test(v);

/** GitHub's new-issue form with a polite, pre-written request to review a disabled account. */
export function reviewIssueUrl(reference: string | null): string {
  const title = reference ? `Account review request (${reference})` : "Account review request";
  const body = [
    "Hello HeapHop team,",
    "",
    "My HeapHop account has been disabled, and I believe this may be a mistake. I would be grateful if you could review it.",
    "",
    ...(reference ? [`Reference code: ${reference}`, ""] : []),
    "Anything you would like us to know (optional):",
    "",
    "",
    "---",
    "This issue is public. Please do not add your email address, password or any other personal details.",
  ].join("\n");
  return `${REPO_ISSUES}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
