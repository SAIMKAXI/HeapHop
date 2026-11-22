"use client";
import { useActionState } from "react";
import type { FormState } from "@/server/actions/auth";
import { addUniversity, mergeUniversity, setDisabled } from "@/server/actions/admin";
import { AppHeader } from "@/ui/site/app-header";
import { Banner } from "@/ui/auth/form-bits";
import { UniversityPicker } from "@/ui/auth/university-picker";
import type { University } from "@/ui/auth/university-search";

export interface AdminUser { id: string; full_name: string; email: string; university: string; role: string; disabled: boolean; created_at: string }
export interface AdminStats { users: number; disabled: number; last_7_days: number; signups_by_day: { day: string; count: number }[]; by_university: { university: string; count: number; listed?: boolean }[]; to_review: { spelling: string; count: number }[] }

const card = "rounded-xl border-2 border-card-border bg-card p-5";

const button = "rounded-full border border-card-border px-3 py-1 text-xs font-semibold hover:border-accent disabled:opacity-50";

/** Spellings that matched no listed university: merge each into one, or add it as new. */
function ReviewNames({ items, universities }: { items: AdminStats["to_review"]; universities: University[] }) {
  const [merged, merge, merging] = useActionState<FormState, FormData>(mergeUniversity, {});
  const [added, add, adding] = useActionState<FormState, FormData>(addUniversity, {});
  const last = [merged, added].find((s) => s.error || s.ok);
  return (
    <section className={`${card} mt-4`} data-admin-review>
      <h2 className="font-bold">University names to review</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What students typed that matched no listed university. Merging or adding also matches anyone who types it later.
      </p>
      {last?.error && <div className="mt-3"><Banner kind="error">{last.error}</Banner></div>}
      {last?.ok && <div className="mt-3"><Banner kind="ok">{last.message}</Banner></div>}
      {items.length === 0 ? <p className="mt-3 text-sm text-muted-foreground" data-review-empty>Nothing to review. Every account is matched to a listed university.</p> : (
        <ul className="mt-3 divide-y divide-card-border">
          {items.map((r) => (
            <li key={r.spelling} className="grid gap-3 py-3 md:grid-cols-[1fr_1.4fr_1.2fr] md:items-start" data-review-row={r.spelling}>
              <p className="pt-2 text-sm"><span className="font-semibold">{r.spelling}</span> <span className="text-muted-foreground">· {r.count} {r.count === 1 ? "account" : "accounts"}</span></p>
              <form action={merge} className="flex items-start gap-2" data-merge-form>
                <input type="hidden" name="spelling" value={r.spelling} />
                <div className="flex-1"><UniversityPicker universities={universities} label={`Merge “${r.spelling}” into`} name="targetName" idName="target" allowUnlisted={false} compact /></div>
                <button type="submit" disabled={merging} className={`${button} mt-2`}>Merge</button>
              </form>
              <form action={add} className="flex items-start gap-2" data-add-form>
                <input type="hidden" name="spelling" value={r.spelling} />
                <label className="sr-only" htmlFor={`add-${r.spelling}`}>Name to add for “{r.spelling}”</label>
                <input id={`add-${r.spelling}`} name="name" defaultValue={r.spelling} maxLength={120} required
                  className="w-full flex-1 rounded-lg border-2 border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
                <button type="submit" disabled={adding} className={`${button} mt-2 whitespace-nowrap`}>Add as new</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminView({ me, users, stats, universities }: { me: string; users: AdminUser[]; stats: AdminStats; universities: University[] }) {
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
                <li key={u.university} className="flex justify-between gap-3" data-university-count={u.university}>
                  <span className="truncate">{u.university}{u.listed === false && <span className="ml-2 text-xs text-muted">not listed</span>}</span>
                  <span className="font-semibold">{u.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <ReviewNames items={stats.to_review} universities={universities} />
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
