import type { Metadata } from "next";
import { headers } from "next/headers";
import { DISABLED_HEADER } from "@/server/policy";
import { isReference, reviewIssueUrl } from "@/server/reference";
import { safeNext } from "@/server/validate";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in", description: "Log in to HeapHop." };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const notice = q.confirmed ? "Your email is confirmed. Log in to start." : undefined;
  // Set only by the proxy, once, right after it signed out an account that was just disabled
  // (never from the address: a link can't make this page say an account is disabled).
  const note = (await headers()).get(DISABLED_HEADER);
  const reference = isReference(note) ? note : null;
  const disabled = note ? { reference, reviewUrl: reviewIssueUrl(reference) } : undefined;
  return <LoginForm next={safeNext(q.next)} notice={notice} noticeKind="ok" disabled={disabled} />;
}
