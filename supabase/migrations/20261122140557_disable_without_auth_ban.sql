-- Disabled accounts get a clear message only after the right password (task 8.19).
--
-- Until now, disabling an account also banned it inside Supabase Auth (banned_until). Supabase
-- then refuses the sign-in itself, and HeapHop can't tell whether the password was right, so
-- telling the student "your account is disabled" would also tell anyone who types their email.
-- Now Supabase checks only the password; HeapHop's login reads profiles.disabled, signs the user
-- straight out and explains. A disabled account still can't use anything:
--   - its open sessions are deleted when it is disabled (no refresh);
--   - every protected page checks profiles.disabled (the proxy) and signs it out;
--   - RLS: it can't update its profile ("update own profile" requires not disabled), and
--     private.is_admin() is false for a disabled account, so no admin function works.

create or replace function public.admin_set_disabled(target uuid, value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if target = auth.uid() then raise exception 'admins cannot disable themselves' using errcode = '22023'; end if;
  update public.profiles set disabled = value where id = target;
  if not found then raise exception 'no such user' using errcode = 'P0002'; end if;
  if value then delete from auth.sessions where user_id = target; end if;
end;
$$;
revoke all on function public.admin_set_disabled(uuid, boolean) from public, anon;
grant execute on function public.admin_set_disabled(uuid, boolean) to authenticated;

-- Lift the old Auth ban from accounts disabled before this change (they stay disabled here).
update auth.users u set banned_until = null
from public.profiles p
where p.id = u.id and p.disabled and u.banned_until is not null;
