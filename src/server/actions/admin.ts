"use server";
// Admin actions. The page hides these from non-admins, but the real check is in the database:
// admin_set_disabled(), admin_merge_university() and admin_add_university() refuse anyone
// who is not an admin, whatever request they send.
import { revalidatePath } from "next/cache";
import { requireViewer } from "../session";
import { serverSupabase } from "../supabase";
import { cleanUniversity, isUuid } from "../validate";
import type { FormState } from "./auth";

export async function setDisabled(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer("/admin");
  const target = form.get("userId");
  const value = form.get("disable") === "true";
  if (viewer.role !== "admin" || !isUuid(target)) return { error: "Not allowed." };
  if (target === viewer.id) return { error: "You can't disable your own account." };
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc("admin_set_disabled", { target, value });
  if (error) return { error: error.code === "42501" ? "Not allowed." : "Couldn't update that account." };
  revalidatePath("/admin");
  return { ok: true, message: value ? "Account disabled." : "Account enabled." };
}

const spellingOf = (raw: FormDataEntryValue | null) => (typeof raw === "string" && raw.trim().length >= 1 && raw.length <= 120 ? raw : null);

/** Admin: students' spelling `spelling` means the listed university `target`, now and from now on. */
export async function mergeUniversity(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer("/admin");
  const spelling = spellingOf(form.get("spelling"));
  const target = Number(form.get("target"));
  if (viewer.role !== "admin" || !spelling) return { error: "Not allowed." };
  if (!Number.isInteger(target) || target <= 0) return { error: "Pick a university from the list to merge into." };
  const { error } = await (await serverSupabase()).rpc("admin_merge_university", { spelling, target });
  if (error) return { error: error.code === "42501" ? "Not allowed." : "Couldn't merge that name." };
  revalidatePath("/admin");
  return { ok: true, message: `Merged “${spelling}”. Future sign-ups with it are matched too.` };
}

/** Admin: add a university to the list and match the spelling students used to it. */
export async function addUniversity(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await requireViewer("/admin");
  const spelling = spellingOf(form.get("spelling"));
  const name = cleanUniversity(form.get("name"));
  if (viewer.role !== "admin" || !spelling) return { error: "Not allowed." };
  if (name.error) return { error: name.error };
  const { error } = await (await serverSupabase()).rpc("admin_add_university", { spelling, name: name.value });
  if (error) {
    if (error.code === "42501") return { error: "Not allowed." };
    if (error.code === "23505") return { error: `“${name.value}” is already in the list. Merge into it instead.` };
    return { error: "Couldn't add that university." };
  }
  revalidatePath("/admin");
  return { ok: true, message: `Added “${name.value}” to the list.` };
}
