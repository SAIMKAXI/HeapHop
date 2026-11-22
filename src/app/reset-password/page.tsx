import type { Metadata } from "next";
import { requireViewer } from "@/server/session";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // Reached from the email link, which signs you in. If you set up MFA, the code comes first.
  await requireViewer("/reset-password");
  return <ResetForm />;
}
