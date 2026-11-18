-- Olas UY · admin: personas por sección y playas más miradas (pronóstico, simulación y Fotos).

-- Una fila cada vez que alguien abre una playa. Mismo criterio que visits: sin datos personales.
create table public.beach_views (
  id     bigserial primary key,
  at     timestamptz not null default now(),
  vid    uuid not null,
  beach  text not null check (char_length(beach) between 1 and 40),
  kind   text not null check (kind in ('olas', 'sim', 'fotos'))
);
create index beach_views_at on public.beach_views (at);
alter table public.beach_views enable row level security;   -- sin políticas: el navegador no la lee
revoke all on public.beach_views from anon, authenticated;

create function public.track_beach(p_vid uuid, p_beach text, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_vid is null or p_beach is null or char_length(p_beach) not between 1 and 40 or p_kind not in ('olas', 'sim', 'fotos') then return; end if;
  -- La misma playa y el mismo tipo en menos de 30 segundos cuenta una sola vez
  if exists (select 1 from public.beach_views where vid = p_vid and beach = p_beach and kind = p_kind and at > now() - interval '30 seconds') then return; end if;
  insert into public.beach_views (vid, beach, kind) values (p_vid, p_beach, p_kind);
end $$;
revoke execute on function public.track_beach(uuid, text, text) from public;
grant execute on function public.track_beach(uuid, text, text) to anon, authenticated;

create or replace function public.admin_stats()
returns jsonb language plpgsql security definer set search_path = public, auth stable as $$
declare
  tz constant text := 'America/Montevideo';
  today date := (now() at time zone tz)::date;
  r jsonb;
begin
  if not public.is_admin() then raise exception 'sin permiso' using errcode = '42501'; end if;

  select jsonb_build_object(
    'now', now(),
    -- Visitas
    'online', (select count(distinct vid) from visits where at > now() - interval '5 minutes'),
    'today', (select jsonb_build_object('views', count(*), 'visitors', count(distinct vid))
              from visits where (at at time zone tz)::date = today),
    'week', (select jsonb_build_object('views', count(*), 'visitors', count(distinct vid))
             from visits where (at at time zone tz)::date > today - 7),
    'month', (select jsonb_build_object('views', count(*), 'visitors', count(distinct vid))
              from visits where (at at time zone tz)::date > today - 30),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'views', coalesce(v.views, 0), 'visitors', coalesce(v.visitors, 0),
                                                           'signups', coalesce(u.n, 0)) order by d), '[]')
               from generate_series(today - 29, today, interval '1 day') g(d0)
               cross join lateral (select g.d0::date as d) dd
               left join (select (at at time zone tz)::date dv, count(*) views, count(distinct vid) visitors
                          from visits where at > now() - interval '31 days' group by 1) v on v.dv = dd.d
               left join (select (created_at at time zone tz)::date du, count(*) n
                          from auth.users where created_at > now() - interval '31 days' group by 1) u on u.du = dd.d),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('h', h, 'views', coalesce(v.n, 0), 'today', coalesce(t.n, 0)) order by h), '[]')
                from generate_series(0, 23) h
                left join (select extract(hour from at at time zone tz)::int hv, count(*) n
                           from visits where at > now() - interval '7 days' group by 1) v on v.hv = h
                left join (select extract(hour from at at time zone tz)::int ht, count(*) n
                           from visits where (at at time zone tz)::date = today group by 1) t on t.ht = h),
    -- Personas distintas por sección (hoy · 7 · 30 días)
    'sections', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'today', t, 'week', w, 'month', m, 'views', v) order by m desc), '[]')
                 from (select path,
                         count(distinct vid) filter (where (at at time zone tz)::date = today) t,
                         count(distinct vid) filter (where (at at time zone tz)::date > today - 7) w,
                         count(distinct vid) m, count(*) v
                       from visits where at > now() - interval '30 days' group by 1) x),
    -- Playas más miradas (30 días): pronóstico abierto, simulación y búsqueda en Fotos
    'beaches', (select coalesce(jsonb_agg(jsonb_build_object('beach', beach, 'olas', o, 'people', p, 'sim', s, 'fotos', f, 'week', w) order by o desc, f desc), '[]')
                from (select beach,
                        count(*) filter (where kind = 'olas') o,
                        count(distinct vid) filter (where kind = 'olas') p,
                        count(*) filter (where kind = 'sim') s,
                        count(*) filter (where kind = 'fotos') f,
                        count(*) filter (where kind = 'olas' and at > now() - interval '7 days') w
                      from beach_views where at > now() - interval '30 days' group by 1) x),
    'paths', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', n) order by n desc), '[]')
              from (select path, count(*) n from visits where at > now() - interval '30 days' group by 1) x),
    'refs', (select coalesce(jsonb_agg(jsonb_build_object('ref', ref, 'n', n) order by n desc), '[]')
             from (select ref, count(distinct vid) n from visits where ref is not null and at > now() - interval '30 days'
                   group by 1 order by 2 desc limit 8) x),
    'mobile', (select round(100.0 * count(*) filter (where mobile) / nullif(count(*), 0))
               from visits where at > now() - interval '30 days'),
    -- Usuarios
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'week', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'active_week', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'list', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
        select u.email, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as name,
               u.raw_app_meta_data->>'provider' as provider, u.created_at, u.last_sign_in_at,
               (p.id is not null) as photographer,
               (select count(*) from purchases b where b.buyer_id = u.id and b.status = 'paid') as bought,
               (select max(at) from visits w where w.uid = u.id) as last_seen
        from auth.users u left join photographers p on p.id = u.id
        order by u.created_at desc limit 100) x)),
    -- Fotógrafos
    'photographers', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
        select p.name, p.slug, p.created_at, p.mp_connected,
               (select count(*) from sessions s where s.photographer_id = p.id) as sessions,
               (select count(*) from sessions s where s.photographer_id = p.id and s.published) as published,
               (select count(*) from photos f join sessions s on s.id = f.session_id where s.photographer_id = p.id and f.ready) as photos,
               (select count(*) from purchases b where b.photographer_id = p.id and b.status = 'paid') as sold,
               (select coalesce(sum(amount), 0) from purchases b where b.photographer_id = p.id and b.status = 'paid') as gross,
               (select max(s.created_at) from sessions s where s.photographer_id = p.id) as last_upload
        from photographers p) x),
    -- Ventas
    'sales', jsonb_build_object(
      'photos', (select count(*) from purchases where status = 'paid'),
      'orders', (select count(distinct order_id) from purchases where status = 'paid'),
      'gross', (select coalesce(sum(amount), 0) from purchases where status = 'paid'),
      'fee', (select coalesce(sum(platform_fee), 0) from purchases where status = 'paid'),
      'month_gross', (select coalesce(sum(amount), 0) from purchases where status = 'paid' and paid_at > now() - interval '30 days'),
      'month_fee', (select coalesce(sum(platform_fee), 0) from purchases where status = 'paid' and paid_at > now() - interval '30 days')),
    'content', jsonb_build_object(
      'sessions', (select count(*) from sessions where published),
      'photos', (select count(*) from photos f join sessions s on s.id = f.session_id where s.published and f.ready)),
    -- Actividad reciente
    'activity', (select coalesce(jsonb_agg(x order by x.at desc), '[]') from (
        select * from (
          select created_at as at, 'signup' k, coalesce(raw_user_meta_data->>'full_name', email) who, null::text what from auth.users
          union all
          select created_at, 'photographer', name, null from photographers
          union all
          select s.created_at, 'session', p.name, s.beach || ' · ' || (select count(*) from photos f where f.session_id = s.id) || ' fotos'
            from sessions s join photographers p on p.id = s.photographer_id where s.published
          union all
          select min(b.paid_at), 'sale', min(p.name), count(*) || ' foto(s) · $' || sum(b.amount)
            from purchases b join photographers p on p.id = b.photographer_id where b.status = 'paid' group by b.order_id
        ) a order by at desc limit 40) x)
  ) into r;
  return r;
end $$;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
