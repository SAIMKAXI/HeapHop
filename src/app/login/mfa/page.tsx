import type { Metadata } from "next";
import { safeNext } from "@/server/validate";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Enter your code" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <MfaForm next={safeNext((await searchParams).next)} />;
}
