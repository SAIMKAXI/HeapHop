import type { Metadata } from "next";
import { requireViewer } from "@/server/session";
import { serverSupabase } from "@/server/supabase";
import { AccountForms } from "./account-forms";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const viewer = await requireViewer("/account");
  const { data: factors } = await (await serverSupabase()).auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  return (
    <AccountForms
      email={viewer.email}
      fullName={viewer.fullName}
      university={viewer.university}
      admin={viewer.role === "admin"}
      mfaFactorId={factor?.id ?? null}
    />
  );
}
