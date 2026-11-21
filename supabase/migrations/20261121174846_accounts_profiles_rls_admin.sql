-- HeapHop accounts. Every rule here is enforced by the database, not the site.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('student', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null
    constraint full_name_ok check (char_length(btrim(full_name)) between 2 and 80 and full_name = btrim(full_name) and full_name !~ '[<>{}\\[\]`$\x00-\x1f\x7f]'),
  university text not null
    constraint university_ok check (char_length(btrim(university)) between 2 and 120 and university = btrim(university) and university !~ '[<>{}\\[\]`$\x00-\x1f\x7f]'),
  email text not null constraint email_ok check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.app_role not null default 'student',
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Clients may read; they may change only their own name and university. Nobody can insert,
-- delete, or touch role / disabled / email directly.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, university) on public.profiles to authenticated;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and not p.disabled);
$$;
revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create policy "read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "admins read all profiles" on public.profiles for select to authenticated
  using ((select private.is_admin()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid()) and not disabled)
  with check (id = (select auth.uid()));

-- A profile is created from the sign-up form's data. Bad data fails the checks above,
-- which makes the whole sign-up fail.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, university, email)
  values (new.id, btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), btrim(coalesce(new.raw_user_meta_data ->> 'university', '')), lower(new.email));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function private.handle_email_change();

-- Admin: block or unblock an account. Blocks future logins and token refreshes too.
create or replace function public.admin_set_disabled(target uuid, value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if target = auth.uid() then raise exception 'admins cannot disable themselves' using errcode = '22023'; end if;
  update public.profiles set disabled = value where id = target;
  if not found then raise exception 'no such user' using errcode = 'P0002'; end if;
  update auth.users set banned_until = case when value then 'infinity'::timestamptz else null end where id = target;
  if value then delete from auth.sessions where user_id = target; end if;
end;
$$;
revoke all on function public.admin_set_disabled(uuid, boolean) from public, anon;
grant execute on function public.admin_set_disabled(uuid, boolean) to authenticated;

-- Admin: usage counts (replaced in the next migration).
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'disabled', (select count(*) from public.profiles where disabled),
    'signups_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d)
      from (select date_trunc('day', created_at)::date d, count(*) c from public.profiles
            where created_at > now() - interval '30 days' group by 1) t), '[]'::jsonb),
    'by_university', coalesce((select jsonb_agg(jsonb_build_object('university', u, 'count', c) order by c desc, u)
      from (select university u, count(*) c from public.profiles group by 1 order by 2 desc limit 50) t), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- Rate limiting for sign-up / login. Keys are HMACs made on the server with a secret,
-- so nobody can fill another person's bucket by calling this directly.
create table private.rate_limits (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits int not null
);
create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r private.rate_limits;
begin
  if p_key !~ '^[0-9a-f]{64}$' or p_max not between 1 and 100 or p_window_seconds not between 10 and 86400 then
    raise exception 'bad rate limit request' using errcode = '22023';
  end if;
  delete from private.rate_limits where window_start < now() - interval '1 day';
  insert into private.rate_limits as t (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when t.window_start < now() - make_interval(secs => p_window_seconds) then 1 else t.hits + 1 end,
    window_start = case when t.window_start < now() - make_interval(secs => p_window_seconds) then now() else t.window_start end
  returning * into r;
  return r.hits <= p_max;
end;
$$;
revoke all on function public.rate_limit_hit(text, int, int) from public;
grant execute on function public.rate_limit_hit(text, int, int) to anon, authenticated;
