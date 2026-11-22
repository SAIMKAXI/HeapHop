import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireViewer } from "@/server/session";
import { serverSupabase } from "@/server/supabase";
import { listUniversities } from "@/server/universities";
import { AdminView, type AdminStats, type AdminUser } from "./admin-view";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const viewer = await requireViewer("/admin");
  if (viewer.role !== "admin") notFound();
  const supabase = await serverSupabase();
  // RLS lets only admins read every profile, and admin_stats() refuses anyone else.
  const [{ data: users }, { data: stats }, universities] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, university, role, disabled, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.rpc("admin_stats"),
    listUniversities(),
  ]);
  const s = (stats ?? { users: 0, disabled: 0, last_7_days: 0, signups_by_day: [], by_university: [], to_review: [] }) as AdminStats;
  return <AdminView me={viewer.id} users={(users ?? []) as AdminUser[]} stats={{ ...s, to_review: s.to_review ?? [] }} universities={universities} />;
}
