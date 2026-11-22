// The university list for the picker on sign-up, Account settings and the admin page.
// Read with the public key: the list is public (RLS lets anyone read it, nobody write it).
// If it can't be read, the picker still works as a plain text field and the database still
// matches what was typed.
import { cache } from "react";
import type { University } from "@/ui/auth/university-search";
import { bareSupabase } from "./supabase";

export const listUniversities = cache(async (): Promise<University[]> => {
  const { data, error } = await bareSupabase().from("universities").select("id, name, aliases").order("name").limit(2000);
  if (error || !data) return [];
  return data
    .filter((u) => typeof u.id === "number" && typeof u.name === "string" && Array.isArray(u.aliases))
    .map((u) => ({ id: u.id as number, name: u.name as string, aliases: (u.aliases as unknown[]).filter((a): a is string => typeof a === "string") }));
});
