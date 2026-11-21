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
    'by_university', coalesce((select jsonb_agg(jsonb_build_object('university', u, 'count', c) order by c desc, u)
      from (select university u, count(*) c from public.profiles group by 1 order by 2 desc limit 50) t), '[]'::jsonb)
  );
end;
$$;
