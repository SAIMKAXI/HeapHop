import type { Metadata } from "next";
import { safeNext } from "@/server/validate";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in", description: "Log in to HeapHop." };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const notice = q.confirmed ? "Your email is confirmed. Log in to start." : q.disabled ? "This account has been disabled. Contact your instructor." : undefined;
  return <LoginForm next={safeNext(q.next)} notice={notice} noticeKind={q.disabled ? "error" : "ok"} />;
}
