import type { Metadata } from "next";
import { listUniversities } from "@/server/universities";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up", description: "Create a HeapHop account." };

export default async function SignupPage() {
  return <SignupForm universities={await listUniversities()} />;
}
