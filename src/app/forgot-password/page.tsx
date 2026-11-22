import type { Metadata } from "next";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot your password", description: "Get a link to choose a new HeapHop password." };

export default function ForgotPasswordPage() {
  return <ForgotForm />;
}
