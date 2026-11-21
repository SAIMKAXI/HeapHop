"use server";
// Admin actions. The page hides these from non-admins, but the real check is in the database:
// admin_set_disabled() refuses anyone who is not an admin, whatever request they send.
import { revalidatePath } from "next/cache";
import { requireViewer } from "../session";
import { serverSupabase } from "../supabase";
import { isUuid } from "../validate";
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
