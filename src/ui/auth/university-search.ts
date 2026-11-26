// How university names are compared, and how the sign-up picker searches them.
//
// A name is reduced to a key: words run together in camel case split ("AirUni" is "Air Uni"), lower case, "&" read as "and", every run of characters that is
// not a letter or digit dropped, and common spellings of "university" (uni, univ, ...) made
// the same. "Air University", "air  university" and "AirUni" all become "airuniversity".
// The short key also drops "university", "of", "the" and "and", so "Air" becomes "air".
//
// The database does the same in private.uni_key / private.uni_short_key (migration
// 20261122085049_universities.sql), and that is what decides which university a profile
// belongs to. The copy here only drives the search box, so the two must stay in step;
// tests/site/university-search.test.ts checks both.

export interface University { id: number; name: string; aliases: string[] }

const UNIVERSITY_SPELLINGS = new Set(["uni", "univ", "univeristy", "universty", "unversity", "universiti", "universitiy"]);
const FILLER = new Set(["university", "the", "of", "and"]);

export function uniTokens(text: string): string[] {
  return text.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replaceAll("&", " and ").split(/[^a-z0-9]+/)
    .filter(Boolean).map((w) => (UNIVERSITY_SPELLINGS.has(w) ? "university" : w));
}
export const uniKey = (text: string) => uniTokens(text).join("");
export const uniShortKey = (text: string) => uniTokens(text).filter((w) => !FILLER.has(w)).join("");

/**
 * Every key that names exactly one university, built like private.rebuild_university_keys:
 * full names and short forms first; then short keys and names without their ", City" ending.
 * A key two universities share at the same strength names neither.
 */
const keyMaps = new WeakMap<University[], Map<string, University>>();
function keyMap(list: University[]): Map<string, University> {
  const cached = keyMaps.get(list);
  if (cached) return cached;
  const best = new Map<string, { prio: number; unis: Set<University> }>();
  const add = (key: string, u: University, prio: number) => {
    if (!key) return;
    const b = best.get(key);
    if (!b || prio < b.prio) best.set(key, { prio, unis: new Set([u]) });
    else if (prio === b.prio) b.unis.add(u);
  };
  for (const u of list) {
    add(uniKey(u.name), u, 1);
    for (const a of u.aliases) add(uniKey(a), u, 1);
    add(uniShortKey(u.name), u, 2);
    for (const a of u.aliases) add(uniShortKey(a), u, 2);
    if (u.name.includes(",")) {
      const city = u.name.replace(/,[^,]*$/, "");
      add(uniKey(city), u, 2);
      add(uniShortKey(city), u, 2);
    }
  }
  const map = new Map<string, University>();
  for (const [k, b] of best) if (b.unis.size === 1) map.set(k, [...b.unis][0]);
  keyMaps.set(list, map);
  return map;
}

/** The university this text names exactly (as the database will match it), if any. */
export function exactUniversity(list: University[], text: string): University | undefined {
  const map = keyMap(list);
  return map.get(uniKey(text)) ?? map.get(uniShortKey(text));
}

/** Up to `limit` universities matching what has been typed so far, best first. */
export function searchUniversities(list: University[], query: string, limit = 8): University[] {
  const q = uniTokens(query);
  if (q.length === 0) return [];
  const qKey = q.join("");
  const qPhrase = q.join(" ");
  const scored: { u: University; score: number }[] = [];
  for (const u of list) {
    const nameTokens = uniTokens(u.name);
    const phrase = nameTokens.join(" ");
    const aliasKeys = u.aliases.map(uniKey);
    let score = -1;
    if (aliasKeys.includes(qKey) || uniKey(u.name) === qKey) score = 0;
    else if (phrase.startsWith(qPhrase)) score = 1;
    else if (aliasKeys.some((a) => a.startsWith(qKey))) score = 2;
    else if (q.every((t) => nameTokens.some((w) => w.startsWith(t)))) score = 3;
    else if (qKey.length >= 4 && nameTokens.join("").includes(qKey)) score = 4; // mid-word only for longer queries

    if (score >= 0) scored.push({ u, score });
  }
  scored.sort((a, b) => a.score - b.score || a.u.name.localeCompare(b.u.name));
  return scored.slice(0, limit).map((s) => s.u);
}
