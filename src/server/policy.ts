// Security settings shared by the proxy and the server: the Content-Security-Policy and how
// session cookies are written. Pure, so the tests check exactly what is sent.

/** Session cookies: never readable by page scripts, only sent over HTTPS, not sent by other sites' forms. */
export const SESSION_COOKIE = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;

/**
 * The policy for one response. Scripts run only from this site, and an inline script only with
 * this response's nonce ('strict-dynamic' lets those scripts load their own chunks). The browser
 * never talks to Supabase: all auth requests go through our server, so connect-src stays 'self'.
 */
export function contentSecurityPolicy(nonce: string, { dev = false, https = true } = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // React writes style="" attributes; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function newNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
