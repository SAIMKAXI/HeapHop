// Guards that keep data as data. They read the source and fail the build if anyone adds:
//   - dynamic SQL in a database function (EXECUTE, format(), string-built statements),
//   - a SECURITY DEFINER function without a locked search_path,
//   - a table column for text without a markup CHECK,
//   - raw HTML in the site (dangerouslySetInnerHTML, innerHTML, eval, new Function),
//   - a Supabase query whose table, function, columns or filter column is not a fixed string,
//     or a PostgREST filter string (.or / .filter / .textSearch) that text could be spliced into.
// docs/SECURITY.md ("Data stays data") lists what was tested against the live database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const walk = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, ext) : ext.test(n) ? [p] : [];
  });
const migrations = walk(join(root, "supabase", "migrations"), /\.sql$/).map((p) => ({ p: relative(root, p), sql: readFileSync(p, "utf8") }));
const sources = [...walk(join(root, "src"), /\.(ts|tsx)$/)].map((p) => ({ p: relative(root, p), code: readFileSync(p, "utf8") }));
/** SQL without comments and string literals, so only code is checked. */
const codeOf = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''");

test("database functions never build SQL from text: no EXECUTE, format() or quote_*()", () => {
  for (const { p, sql } of migrations) {
    const code = codeOf(sql).replace(/grant execute|revoke all on function|execute function/gi, "");
    assert.doesNotMatch(code, /\bexecute\b/i, `${p}: EXECUTE runs a string as SQL`);
    assert.doesNotMatch(code, /\bformat\s*\(|\bquote_(ident|literal|nullable)\s*\(/i, `${p}: SQL built from text`);
  }
});

test("every SECURITY DEFINER function locks its search_path, so nobody can slip objects in", () => {
  for (const { p, sql } of migrations) {
    const fns = codeOf(sql).split(/create or replace function|create function/i).slice(1);
    for (const fn of fns) {
      const head = fn.slice(0, fn.indexOf("$$"));
      if (/security definer/i.test(head)) assert.match(head, /set search_path = ''/, `${p}: ${fn.slice(0, 60).trim()}`);
    }
  }
});

test("every text column people can fill has a CHECK that refuses markup and control characters", () => {
  const all = migrations.map((m) => m.sql).join("\n");
  const markup = String.raw`!~ '[<>{}\\[\]` + "`" + String.raw`$\x00-\x1f\x7f]'`;
  for (const col of ["full_name", "university", "name", "array_to_string(aliases, ' ')"]) {
    assert.ok(all.includes(`${col} ${markup}`), `no markup CHECK on ${col}`);
  }
  assert.ok(all.includes(String.raw`email !~ '[<>"''` + "`" + String.raw`\\\x00-\x20\x7f]'`), "no markup CHECK on email");
});

test("the site never turns data into HTML or code", () => {
  for (const { p, code } of sources) {
    if (/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/.test(code)) assert.fail(`${p}: raw HTML or code from a string`);
    for (const r of code.matchAll(/dangerouslySetInnerHTML=\{\{\s*__html:\s*([^}]+?)\s*\}\}/g)) {
      assert.equal(p, "src/app/layout.tsx", `${p}: dangerouslySetInnerHTML`);
      assert.equal(r[1], "SAVED_THEME_SCRIPT + REVEAL_READY_SCRIPT + NAV_START_SCRIPT", "only the three fixed inline scripts");
    }
    if (/dangerouslySetInnerHTML/.test(code) && p !== "src/app/layout.tsx") assert.fail(`${p}: dangerouslySetInnerHTML`);
  }
});

test("Supabase queries name tables, functions and columns with fixed strings; values go as parameters", () => {
  const db = sources.filter(({ code }) => /supabase|Supabase\(\)/.test(code));
  for (const { p, code } of db) {
    assert.doesNotMatch(code, /\.(or|textSearch)\(/, `${p}: PostgREST filter string`);
    assert.doesNotMatch(code, /\.filter\(\s*["'`]/, `${p}: PostgREST .filter() with an operator string`);
    for (const m of code.matchAll(/\.(from|rpc|select|eq|order)\(\s*([^)]{0,1})/g)) {
      if (m[1] === "select" && m[2] === ")") continue; // .select() after an update
      assert.match(m[2], /["']/, `${p}: .${m[1]}( must start with a fixed string`);
    }
  }
});
