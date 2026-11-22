import type { Metadata } from "next";
import { isReference, reviewIssueUrl } from "@/server/reference";
import { safeNext } from "@/server/validate";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in", description: "Log in to HeapHop." };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const notice = q.confirmed ? "Your email is confirmed. Log in to start." : undefined;
  // ?disabled=1&ref=HH-XXXX-XXXX: the proxy ended the session of an account that was just disabled.
  const reference = isReference(q.ref) ? q.ref : null;
  const disabled = q.disabled ? { reference, reviewUrl: reviewIssueUrl(reference) } : undefined;
  return <LoginForm next={safeNext(q.next)} notice={notice} noticeKind="ok" disabled={disabled} />;
}
