// A small stand-in for Supabase's Auth and REST APIs, for the browser tests. It speaks the same
// HTTP as the real service for the calls HeapHop makes (sign-up, password login, refresh, user,
// logout, TOTP MFA, profiles, the rate-limit and admin functions), so the tests exercise the real
// server code. The database rules themselves (RLS, grants, checks) are tested against the real
// project with SQL; here they are imitated just enough.
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const SECRET = "fake-supabase-jwt-secret-for-tests-only";
const b64url = (b) => Buffer.from(b).toString("base64url");

function sign(payload) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [h, b, s] = (token ?? "").split(".");
  if (!s || createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url") !== s) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  return p.exp > Date.now() / 1000 ? p : null;
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(s) {
  let bits = "";
  for (const c of s.replace(/=+$/, "")) bits += BASE32.indexOf(c).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2)));
}
/** The current 6-digit TOTP code for a base32 secret (RFC 6238). */
export function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export function startFakeSupabase() {
  const users = new Map(); // id -> user
  const profiles = new Map(); // id -> profile
  const refresh = new Map(); // refresh token -> { id, aal }
  const limits = new Map();
  const codes = new Map(); // one-time code from an email link -> { id, challenge, email }
  const log = [];

  const userJson = (u) => ({
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.confirmed ? u.created_at : null, confirmed_at: u.confirmed ? u.created_at : null,
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: u.meta,
    identities: [{ id: u.id, user_id: u.id, provider: "email", identity_id: u.id, identity_data: { sub: u.id, email: u.email } }],
    factors: u.factors.map((f) => ({ id: f.id, factor_type: "totp", status: f.status, friendly_name: f.name, created_at: u.created_at, updated_at: u.created_at })),
    created_at: u.created_at, updated_at: u.created_at,
  });
  const session = (u, aal = "aal1") => {
    const now = Math.floor(Date.now() / 1000);
    const access = sign({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", aal, amr: [{ method: aal === "aal2" ? "totp" : "password", timestamp: now }], session_id: randomUUID(), iat: now, exp: now + 3600 });
    const rt = randomBytes(16).toString("hex");
    refresh.set(rt, { id: u.id, aal });
    return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: rt, user: userJson(u) };
  };
  const addUser = ({ email, password, fullName, university, role = "student", confirmed = true }) => {
    const id = randomUUID();
    const u = { id, email: email.toLowerCase(), password, meta: { full_name: fullName, university }, confirmed, factors: [], created_at: new Date().toISOString() };
    users.set(id, u);
    profiles.set(id, { id, full_name: fullName, university, email: u.email, role, disabled: false, created_at: u.created_at });
    return u;
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    let body = "";
    for await (const chunk of req) body += chunk;
    const json = body ? JSON.parse(body) : {};
    const send = (status, data, extra = {}) => {
      res.writeHead(status, { "content-type": "application/json", "x-supabase-api-version": "2024-01-01", ...extra });
      res.end(data === undefined ? "" : JSON.stringify(data));
    };
    const fail = (status, code, msg) => send(status, { code: status, error_code: code, msg, message: msg });
    const bearer = verify((req.headers.authorization ?? "").replace(/^Bearer /, ""));
    const me = bearer ? users.get(bearer.sub) : null;
    log.push(`${req.method} ${url.pathname}`);
    const p = url.pathname;

    // ---- test controls
    if (p === "/__test/users" && req.method === "POST") return send(200, userJson(addUser(json)));
    if (p === "/__test/reset" && req.method === "POST") { limits.clear(); return send(200, {}); }
    if (p === "/__test/state") return send(200, { users: [...users.values()].map((u) => ({ email: u.email, confirmed: u.confirmed, factors: u.factors })), profiles: [...profiles.values()], log });
    if (p === "/__test/confirm" && req.method === "POST") {
      const u = [...users.values()].find((x) => x.email === json.email);
      if (u) u.confirmed = true;
      return send(200, {});
    }

    if (p === "/__test/link") {
      const hit = [...codes.entries()].reverse().find(([, v]) => v.email === url.searchParams.get("email"));
      return send(200, { code: hit?.[0] ?? null });
    }

    // ---- auth
    if (p === "/auth/v1/.well-known/jwks.json") return send(200, { keys: [] });
    if (p === "/auth/v1/recover" && req.method === "POST") {
      const u = [...users.values()].find((x) => x.email === String(json.email).toLowerCase());
      if (u) codes.set(randomBytes(12).toString("hex"), { id: u.id, challenge: json.code_challenge, email: u.email });
      return send(200, {}); // same answer either way
    }
    if (p === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
      const c = codes.get(json.auth_code);
      codes.delete(json.auth_code);
      const ok = c && createHash("sha256").update(json.code_verifier ?? "").digest("base64url") === c.challenge;
      if (!ok) return fail(400, "flow_state_not_found", "invalid flow state, no valid flow state found");
      return send(200, session(users.get(c.id)));
    }
    if (p === "/auth/v1/signup" && req.method === "POST") {
      const existing = [...users.values()].find((x) => x.email === String(json.email).toLowerCase());
      if (existing) return send(200, { ...userJson(existing), identities: [] }); // no enumeration
      const u = addUser({ email: json.email, password: json.password, fullName: json.data?.full_name, university: json.data?.university, confirmed: false });
      return send(200, userJson(u));
    }
    if (p === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const u = [...users.values()].find((x) => x.email === String(json.email).toLowerCase());
      if (!u || u.password !== json.password) return fail(400, "invalid_credentials", "Invalid login credentials");
      if (!u.confirmed) return fail(400, "email_not_confirmed", "Email not confirmed");
      if (u.banned) return fail(400, "user_banned", "User is banned");
      return send(200, session(u));
    }
    if (p === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      const r = refresh.get(json.refresh_token);
      const u = r && users.get(r.id);
      if (!u || u.banned) return fail(400, "refresh_token_not_found", "Invalid Refresh Token");
      refresh.delete(json.refresh_token);
      return send(200, session(u, r.aal));
    }
    if (p === "/auth/v1/user" && req.method === "GET") return me ? send(200, userJson(me)) : fail(401, "bad_jwt", "invalid JWT");
    if (p === "/auth/v1/user" && req.method === "PUT") {
      if (!me) return fail(401, "bad_jwt", "invalid JWT");
      if (me.factors.some((f) => f.status === "verified") && bearer.aal !== "aal2") return fail(401, "insufficient_aal", "AAL2 required");
      if (json.password) me.password = json.password;
      return send(200, userJson(me));
    }
    if (p === "/auth/v1/logout") return send(204);
    if (p === "/auth/v1/factors" && req.method === "POST") {
      if (!me) return fail(401, "bad_jwt", "invalid JWT");
      const secret = Array.from(randomBytes(20), (b) => BASE32[b % 32]).join("");
      const f = { id: randomUUID(), status: "unverified", name: json.friendly_name, secret };
      me.factors.push(f);
      return send(200, { id: f.id, type: "totp", friendly_name: f.name, totp: { qr_code: "data:image/svg+xml;utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>", secret, uri: `otpauth://totp/HeapHop?secret=${secret}` } });
    }
    const factorRoute = p.match(/^\/auth\/v1\/factors\/([\w-]+)(\/challenge|\/verify)?$/);
    if (factorRoute) {
      if (!me) return fail(401, "bad_jwt", "invalid JWT");
      const f = me.factors.find((x) => x.id === factorRoute[1]);
      if (!f) return fail(404, "mfa_factor_not_found", "Factor not found");
      if (factorRoute[2] === "/challenge") return send(200, { id: randomUUID(), type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
      if (factorRoute[2] === "/verify") {
        if (json.code !== totp(f.secret)) return fail(422, "mfa_verification_failed", "Invalid TOTP code entered");
        f.status = "verified";
        return send(200, session(me, "aal2"));
      }
      if (req.method === "DELETE") {
        if (f.status === "verified" && bearer.aal !== "aal2") return fail(401, "insufficient_aal", "AAL2 required");
        me.factors = me.factors.filter((x) => x !== f);
        return send(200, { id: f.id });
      }
    }

    // ---- REST (profiles and functions), imitating the RLS rules of the real project
    const isAdmin = me && profiles.get(me.id)?.role === "admin" && !profiles.get(me.id)?.disabled;
    if (p === "/rest/v1/profiles") {
      if (!me) return send(401, { code: "42501", message: "permission denied for table profiles" });
      const idEq = url.searchParams.get("id")?.replace(/^eq\./, "");
      if (req.method === "PATCH") {
        const row = profiles.get(idEq);
        if (row && idEq === me.id && !row.disabled) {
          const bad = Object.keys(json).filter((k) => !["full_name", "university"].includes(k));
          if (bad.length) return send(401, { code: "42501", message: "permission denied for table profiles" });
          Object.assign(row, json);
        }
        return send(204);
      }
      let rows = [...profiles.values()].filter((r) => isAdmin || r.id === me.id);
      if (idEq) rows = rows.filter((r) => r.id === idEq);
      if (url.searchParams.get("order") === "created_at.desc") rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      const cols = (url.searchParams.get("select") ?? "*").split(",").map((c) => c.trim());
      rows = rows.map((r) => (cols[0] === "*" ? r : Object.fromEntries(cols.map((c) => [c, r[c]]))));
      if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
        return rows.length === 1 ? send(200, rows[0]) : send(406, { code: "PGRST116", details: `The result contains ${rows.length} rows`, message: "JSON object requested, multiple (or no) rows returned" });
      }
      return send(200, rows);
    }
    if (p === "/rest/v1/rpc/rate_limit_hit") {
      const { p_key: key, p_max: max, p_window_seconds: win } = json;
      if (!/^[0-9a-f]{64}$/.test(key)) return send(400, { code: "22023", message: "bad rate limit request" });
      const e = limits.get(key);
      const now = Date.now();
      const next = !e || now - e.start > win * 1000 ? { start: now, hits: 1 } : { start: e.start, hits: e.hits + 1 };
      limits.set(key, next);
      return send(200, next.hits <= max);
    }
    if (p === "/rest/v1/rpc/admin_set_disabled") {
      if (!isAdmin) return send(403, { code: "42501", message: "not allowed" });
      const row = profiles.get(json.target);
      if (!row) return send(404, { code: "P0002", message: "no such user" });
      row.disabled = json.value;
      users.get(json.target).banned = json.value;
      return send(204);
    }
    if (p === "/rest/v1/rpc/admin_stats") {
      if (!isAdmin) return send(403, { code: "42501", message: "not allowed" });
      const all = [...profiles.values()];
      const by = {};
      for (const r of all) by[r.university] = (by[r.university] ?? 0) + 1;
      return send(200, {
        users: all.length, disabled: all.filter((r) => r.disabled).length, last_7_days: all.length,
        signups_by_day: [{ day: new Date().toISOString().slice(0, 10), count: all.length }],
        by_university: Object.entries(by).map(([university, count]) => ({ university, count })),
      });
    }
    return fail(404, "not_found", `fake supabase has no ${req.method} ${p}`);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      resolve({
        origin,
        addUser: (u) => fetch(`${origin}/__test/users`, { method: "POST", body: JSON.stringify(u) }).then((r) => r.json()),
        state: () => fetch(`${origin}/__test/state`).then((r) => r.json()),
        confirm: (email) => fetch(`${origin}/__test/confirm`, { method: "POST", body: JSON.stringify({ email }) }),
        linkCode: (email) => fetch(`${origin}/__test/link?email=${encodeURIComponent(email)}`).then((r) => r.json()).then((j) => j.code),
        resetLimits: () => fetch(`${origin}/__test/reset`, { method: "POST" }),
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

export const hash = (s) => createHash("sha256").update(s).digest("hex");
