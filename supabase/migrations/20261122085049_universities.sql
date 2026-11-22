-- One name per university (task 8.13).
--
-- public.universities is the list students pick from (HEC-recognised universities, loaded by
-- the next migration, plus any the admin adds). Every profile's university is matched to it by
-- a key that ignores capitals, spaces, punctuation and common spellings of "university"
-- ("Air University", "air university", "AirUni" are one key; "Air" matches through the short
-- key, which also drops "university", "of", "the" and "and"). A match replaces the typed text
-- with the canonical name and sets university_id. Text that matches nothing is kept as typed
-- and shown to the admin, who can merge it into a listed university or add it as a new one;
-- either way the spelling is remembered, so later sign-ups with it are matched too.
--
-- src/ui/auth/university-search.ts does the same reduction for the search box.

create table public.universities (
  id int generated always as identity primary key,
  name text not null unique
    constraint university_name_ok check (char_length(name) between 2 and 120 and name = btrim(name) and name !~ '[<>{}\\[\]`$\x00-\x1f\x7f]'),
  aliases text[] not null default '{}'
    constraint aliases_ok check (cardinality(aliases) <= 12),
  created_at timestamptz not null default now()
);
alter table public.universities enable row level security;
alter table public.universities force row level security;
revoke all on public.universities from anon, authenticated;
grant select (id, name, aliases) on public.universities to anon, authenticated;
create policy "anyone reads the university list" on public.universities for select to anon, authenticated using (true);

alter table public.profiles add column university_id int references public.universities (id) on delete set null;
create index profiles_university_id on public.profiles (university_id);

-- The words of a name, lower case, with "&" read as "and" and camel case split.
create or replace function private.uni_tokens(t text) returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(case when w = any (array['uni','univ','univeristy','universty','unversity','universiti','universitiy']) then 'university' else w end order by n), '{}')
  from regexp_split_to_table(lower(replace(regexp_replace(coalesce(t, ''), '([a-z])([A-Z])', '\1 \2', 'g'), '&', ' and ')), '[^a-z0-9]+') with ordinality as x (w, n)
  where w <> '';
$$;
create or replace function private.uni_key(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select array_to_string(private.uni_tokens(t), '');
$$;
create or replace function private.uni_short_key(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(string_agg(w, '' order by n), '')
  from unnest(private.uni_tokens(t)) with ordinality as x (w, n)
  where w <> all (array['university','the','of','and']);
$$;

-- Every key that names a university. source: 'admin' (a spelling the admin merged or added;
-- always wins and is never rebuilt), 'name' (full name or listed short form), 'derived'
-- (short key, or the name without its ", City" ending). A key two universities could claim
-- at the same strength is dropped, so nobody is matched to the wrong one.
create table private.university_keys (
  key text primary key check (key <> '' and char_length(key) <= 160),
  university_id int not null references public.universities (id) on delete cascade,
  source text not null check (source in ('admin', 'name', 'derived'))
);

create or replace function private.rebuild_university_keys() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.university_keys where source <> 'admin';
  insert into private.university_keys (key, university_id, source)
  select key, min(id), case when min(prio) = 1 then 'name' else 'derived' end
  from (
    select c.key, c.id, c.prio, min(c.prio) over (partition by c.key) as best
    from (
      select private.uni_key(u.name) as key, u.id, 1 as prio from public.universities u
      union select private.uni_key(a), u.id, 1 from public.universities u, unnest(u.aliases) a
      union select private.uni_short_key(u.name), u.id, 2 from public.universities u
      union select private.uni_short_key(a), u.id, 2 from public.universities u, unnest(u.aliases) a
      union select private.uni_key(regexp_replace(u.name, ',[^,]*$', '')), u.id, 2 from public.universities u where u.name like '%,%'
      union select private.uni_short_key(regexp_replace(u.name, ',[^,]*$', '')), u.id, 2 from public.universities u where u.name like '%,%'
    ) c
    where c.key <> ''
  ) ranked
  where prio = best
    and not exists (select 1 from private.university_keys k where k.key = ranked.key)
  group by key
  having count(distinct id) = 1;
end;
$$;

-- Match a profile's university on every insert (sign-up) and change (Account settings).
create or replace function private.resolve_university() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  full_key text := private.uni_key(new.university);
  short_key text := private.uni_short_key(new.university);
  hit record;
begin
  select u.id, u.name into hit
  from private.university_keys k join public.universities u on u.id = k.university_id
  where k.key in (full_key, short_key)
  order by (k.key = full_key) desc
  limit 1;
  if found then
    new.university_id := hit.id;
    new.university := hit.name;
  else
    new.university_id := null;
  end if;
  return new;
end;
$$;
create trigger profiles_resolve_university before insert or update of university on public.profiles
  for each row execute function private.resolve_university();

-- Re-match every profile that has no university yet (after the list or the keys change).
create or replace function private.rematch_unlisted() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set university = university where university_id is null;
$$;

revoke all on function private.uni_tokens(text), private.uni_key(text), private.uni_short_key(text),
  private.rebuild_university_keys(), private.resolve_university(), private.rematch_unlisted() from public, anon, authenticated;

-- Admin: the spelling `spelling` means university `target` (now and for future sign-ups).
create or replace function public.admin_merge_university(spelling text, target int) returns void
language plpgsql security definer set search_path = '' as $$
declare k text := private.uni_key(spelling);
begin
  if not private.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if k = '' or char_length(k) > 160 then raise exception 'bad spelling' using errcode = '22023'; end if;
  if not exists (select 1 from public.universities where id = target) then raise exception 'no such university' using errcode = 'P0002'; end if;
  insert into private.university_keys (key, university_id, source) values (k, target, 'admin')
  on conflict (key) do update set university_id = excluded.university_id, source = 'admin';
  update public.profiles set university = university where university_id is null and private.uni_key(university) = k;
end;
$$;

-- Admin: add `name` to the list, and match `spelling` (what students typed) to it.
create or replace function public.admin_add_university(spelling text, name text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  clean text := btrim(regexp_replace(coalesce(name, ''), '\s+', ' ', 'g'));
  k text := private.uni_key(spelling);
  new_id int;
begin
  if not private.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if char_length(clean) not between 2 and 120 or clean ~ '[<>{}\\[\]`$\x00-\x1f\x7f]' then
    raise exception 'bad university name' using errcode = '22023';
  end if;
  if exists (select 1 from public.universities u where private.uni_key(u.name) = private.uni_key(clean)) then
    raise exception 'that university is already listed' using errcode = '23505';
  end if;
  insert into public.universities (name) values (clean) returning id into new_id;
  perform private.rebuild_university_keys();
  if k <> '' and char_length(k) <= 160 then
    insert into private.university_keys (key, university_id, source) values (k, new_id, 'admin')
    on conflict (key) do update set university_id = excluded.university_id, source = 'admin';
  end if;
  perform private.rematch_unlisted();
  return new_id;
end;
$$;

revoke all on function public.admin_merge_university(text, int), public.admin_add_university(text, text) from public, anon;
grant execute on function public.admin_merge_university(text, int), public.admin_add_university(text, text) to authenticated;

-- Admin usage counts: universities grouped by the matched university, and the spellings
-- that matched nothing (grouped by key, shown as their most common spelling) for review.
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'disabled', (select count(*) from public.profiles where disabled),
    'last_7_days', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'signups_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d)
      from (select date_trunc('day', created_at)::date d, count(*) c from public.profiles
            where created_at > now() - interval '30 days' group by 1) t), '[]'::jsonb),
    'by_university', coalesce((select jsonb_agg(jsonb_build_object('university', n, 'count', c, 'listed', l) order by c desc, n)
      from (select coalesce(max(u.name), mode() within group (order by p.university)) n, count(*) c, bool_or(p.university_id is not null) l
            from public.profiles p left join public.universities u on u.id = p.university_id
            group by coalesce(p.university_id::text, 'k:' || private.uni_key(p.university))
            order by 2 desc limit 50) t), '[]'::jsonb),
    'to_review', coalesce((select jsonb_agg(jsonb_build_object('spelling', s, 'count', c) order by c desc, s)
      from (select mode() within group (order by university) s, count(*) c
            from public.profiles where university_id is null
            group by private.uni_key(university) order by 2 desc limit 50) t), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
