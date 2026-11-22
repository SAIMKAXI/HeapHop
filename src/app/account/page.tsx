import type { Metadata } from "next";
import { requireViewer } from "@/server/session";
import { serverSupabase } from "@/server/supabase";
import { listUniversities } from "@/server/universities";
import { AccountForms } from "./account-forms";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const viewer = await requireViewer("/account");
  const [{ data: factors }, universities] = await Promise.all([(await serverSupabase()).auth.mfa.listFactors(), listUniversities()]);
  const factor = factors?.totp.find((f) => f.status === "verified");
  return (
    <AccountForms
      email={viewer.email}
      fullName={viewer.fullName}
      university={viewer.university}
      universities={universities}
      admin={viewer.role === "admin"}
      mfaFactorId={factor?.id ?? null}
    />
  );
}
