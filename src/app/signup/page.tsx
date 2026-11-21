import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up", description: "Create a HeapHop account." };

export default function SignupPage() {
  return <SignupForm />;
}
