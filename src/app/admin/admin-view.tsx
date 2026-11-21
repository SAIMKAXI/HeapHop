"use client";
import { useActionState } from "react";
import type { FormState } from "@/server/actions/auth";
import { setDisabled } from "@/server/actions/admin";
import { AppHeader } from "@/ui/site/app-header";
import { Banner } from "@/ui/auth/form-bits";

export interface AdminUser { id: string; full_name: string; email: string; university: string; role: string; disabled: boolean; created_at: string }
export interface AdminStats { users: number; disabled: number; last_7_days: number; signups_by_day: { day: string; count: number }[]; by_university: { university: string; count: number }[] }

const card = "rounded-xl border-2 border-card-border bg-card p-5";

export function AdminView({ me, users, stats }: { me: string; users: AdminUser[]; stats: AdminStats }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setDisabled, {});
  const peak = Math.max(1, ...stats.signups_by_day.map((d) => d.count));
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <section className="mt-6 grid gap-4 sm:grid-cols-3" data-admin-stats>
          <div className={card}><p className="text-sm text-muted-foreground">Users</p><p className="mt-1 text-3xl font-bold">{stats.users}</p></div>
          <div className={card}><p className="text-sm text-muted-foreground">Sign-ups, last 7 days</p><p className="mt-1 text-3xl font-bold">{stats.last_7_days}</p></div>
          <div className={card}><p className="text-sm text-muted-foreground">Disabled</p><p className="mt-1 text-3xl font-bold">{stats.disabled}</p></div>
        </section>
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <h2 className="font-bold">Sign-ups per day (30 days)</h2>
            <div className="mt-4 flex h-28 items-end gap-1" aria-label="Sign-ups per day">
              {stats.signups_by_day.length === 0 && <p className="text-sm text-muted-foreground">No sign-ups yet.</p>}
              {stats.signups_by_day.map((d) => (
                <div key={d.day} title={`${d.day}: ${d.count}`} className="min-w-2 flex-1 rounded-t bg-accent" style={{ height: `${(d.count / peak) * 100}%` }} />
              ))}
            </div>
          </div>
          <div className={card}>
            <h2 className="font-bold">Users per university</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {stats.by_university.slice(0, 8).map((u) => (
                <li key={u.university} className="flex justify-between gap-3"><span className="truncate">{u.university}</span><span className="font-semibold">{u.count}</span></li>
              ))}
            </ul>
          </div>
        </section>
        <section className={`${card} mt-4 overflow-x-auto`} data-admin-users>
          <h2 className="font-bold">Users</h2>
          {state.error && <div className="mt-3"><Banner kind="error">{state.error}</Banner></div>}
          {state.ok && <div className="mt-3"><Banner kind="ok">{state.message}</Banner></div>}
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-muted-foreground"><tr><th className="py-2 pr-3">Name</th><th className="pr-3">Email</th><th className="pr-3">University</th><th className="pr-3">Joined</th><th className="pr-3">Status</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-card-border" data-user-row={u.email}>
                  <td className="py-2 pr-3 font-medium">{u.full_name}{u.role === "admin" && <span className="ml-2 rounded bg-accent/15 px-1.5 text-xs text-accent">admin</span>}</td>
                  <td className="pr-3">{u.email}</td>
                  <td className="pr-3">{u.university}</td>
                  <td className="pr-3 whitespace-nowrap">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className={`pr-3 ${u.disabled ? "text-danger" : "text-success"}`}>{u.disabled ? "Disabled" : "Active"}</td>
                  <td>
                    {u.id !== me && (
                      <form action={action}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="disable" value={String(!u.disabled)} />
                        <button type="submit" disabled={pending} className="rounded-full border border-card-border px-3 py-1 text-xs font-semibold hover:border-accent">
                          {u.disabled ? "Enable" : "Disable"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
