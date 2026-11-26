import { test } from "node:test";
import assert from "node:assert/strict";
import { exactUniversity, searchUniversities, uniKey, uniShortKey, type University } from "../../src/ui/auth/university-search";

const LIST: University[] = [
  { id: 1, name: "Air University", aliases: ["AU", "Air Uni"] },
  { id: 2, name: "National University of Sciences & Technology", aliases: ["NUST"] },
  { id: 3, name: "National University of Computer & Emerging Sciences", aliases: ["FAST", "NUCES", "FAST NUCES"] },
  { id: 4, name: "University of the Punjab", aliases: ["PU", "Punjab University"] },
  { id: 5, name: "Bahria University", aliases: [] },
  { id: 6, name: "Al-Hamd Islamic University", aliases: [] },
  { id: 7, name: "Lahore University of Management Sciences", aliases: ["LUMS"] },
  { id: 8, name: "Preston University, Karachi", aliases: [] },
  { id: 9, name: "Preston University, Kohat", aliases: [] },
];

test("keys ignore capitals, spaces, punctuation and common spellings of 'university'", () => {
  for (const s of ["Air University", "air  university", "AIR-UNIVERSITY.", "AirUni", "air univ", "Air Univeristy"]) assert.equal(uniKey(s), "airuniversity", s);
  assert.equal(uniKey("Sciences & Technology"), uniKey("sciences and technology"));
  assert.equal(uniKey("   "), "");
});

test("short keys drop 'university', 'of', 'the' and 'and', so a bare name still matches", () => {
  assert.equal(uniShortKey("Air University"), "air");
  assert.equal(uniShortKey("Air"), "air");
  assert.equal(uniShortKey("The University of the Punjab"), "punjab");
  assert.equal(uniShortKey("University"), "");
});

test("search finds a university by its start, a short form, or words anywhere, best first", () => {
  assert.equal(searchUniversities(LIST, "air")[0].name, "Air University");
  assert.equal(searchUniversities(LIST, "nust")[0].id, 2);
  assert.equal(searchUniversities(LIST, "FAST")[0].id, 3);
  assert.equal(searchUniversities(LIST, "fast nu")[0].id, 3);
  assert.equal(searchUniversities(LIST, "punjab uni")[0].id, 4);
  assert.equal(searchUniversities(LIST, "management")[0].id, 7);
  assert.equal(searchUniversities(LIST, "alhamd")[0].id, 6);
  assert.deepEqual(searchUniversities(LIST, "national").map((u) => u.id), [3, 2], "ties in name order");
  assert.equal(searchUniversities(LIST, "university", 3).length, 3, "limit");
  assert.deepEqual(searchUniversities(LIST, ""), []);
  assert.deepEqual(searchUniversities(LIST, "zzz"), []);
});

test("an exact match is recognised as the database will match it, and a shared name matches nothing", () => {
  assert.equal(exactUniversity(LIST, "air university")?.id, 1);
  assert.equal(exactUniversity(LIST, "Air")?.id, 1);
  assert.equal(exactUniversity(LIST, "nust")?.id, 2);
  assert.equal(exactUniversity(LIST, "Air University Islamabad"), undefined);
  assert.equal(exactUniversity(LIST, "punjab")?.id, 4);
  assert.equal(exactUniversity(LIST, "Preston University Kohat")?.id, 9);
  assert.equal(exactUniversity(LIST, "preston"), undefined, "a name two universities share matches neither");
});

test("on the full HEC list, the picker's matches agree with what the database returned for the same text", async () => {
  const { default: raw } = await import("../e2e/universities.json", { with: { type: "json" } });
  const full: University[] = (raw as { name: string; aliases: string[] }[]).map((u, i) => ({ id: i + 1, ...u }));
  // What the same lookups return from the real database.
  const expected: Record<string, string | undefined> = {
    "Air": "Air University", "air university": "Air University", "AirUni": "Air University", "AU": "Air University",
    "air university islamabad": "Air University", "nust": "National University of Sciences & Technology",
    "fast-nuces": "National University of Computer & Emerging Sciences", "punjab": "University of the Punjab",
    "UET": undefined, "UET Lahore": "University of Engineering & Technology, Lahore", "preston": undefined,
    "Preston University Karachi": "Preston University, Karachi", "agriculture": undefined, "GCU": undefined,
    "GCU Lahore": "Government College University, Lahore", "gcuf": "Government College University, Faisalabad",
    "Quaid e Azam University": "Quaid-i-Azam University", "Harvard": undefined,
  };
  for (const [text, name] of Object.entries(expected)) assert.equal(exactUniversity(full, text)?.name, name, text);
  assert.equal(new Set(full.map((u) => uniKey(u.name))).size, full.length, "no two listed names share a key");
  const air = searchUniversities(full, "air").map((u) => u.name);
  assert.equal(air[0], "Air University");
  assert.ok(!air.some((n) => /Benazir|Kinnaird|Khair/.test(n)), `short queries match whole words only: ${air}`);
});

test("the fake Supabase used by the browser tests reduces names exactly like the picker", async () => {
  const fake = await import("../e2e/fake-supabase.mjs");
  for (const s of ["Air University", "AirUni", "air univ", "Sciences & Technology", "The University of the Punjab", "FAST-NUCES", "Quaid-i-Azam", "  "]) {
    assert.equal(fake.uniKey(s), uniKey(s), s);
    assert.equal(fake.uniShortKey(s), uniShortKey(s), s);
  }
});
