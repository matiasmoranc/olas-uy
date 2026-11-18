-- Olas UY · panel de administración (#admin): visitas, usuarios, fotógrafos, ventas y actividad.

-- ============ Visitas ============
-- Una fila por pantalla vista. Sin IP ni datos personales: un id al azar guardado en el navegador
-- (vid), la sección, de qué sitio vino la primera vez y si es celular. uid solo si entró con su cuenta.
create table public.visits (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  vid     uuid not null,
  uid     uuid references auth.users(id) on delete set null,
  path    text not null check (char_length(path) between 1 and 40),
  ref     text check (char_length(ref) <= 100),
  mobile  boolean not null default false
);
create index visits_at on public.visits (at);
alter table public.visits enable row level security;   -- sin políticas: el navegador no la lee
revoke all on public.visits from anon, authenticated;

-- El sitio registra cada pantalla con esta función (no puede leer nada).
create function public.track(p_vid uuid, p_path text, p_ref text default null, p_mobile boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_vid is null or p_path is null or p_path !~ '^[a-z0-9_-]{1,40}$' then return; end if;
  -- Ignora repeticiones de la misma pantalla en menos de 10 segundos (recargas, dobles toques)
  if exists (select 1 from public.visits where vid = p_vid and path = p_path and at > now() - interval '10 seconds') then return; end if;
  insert into public.visits (vid, uid, path, ref, mobile)
  values (p_vid, auth.uid(), p_path, nullif(left(coalesce(p_ref, ''), 100), ''), coalesce(p_mobile, false));
end $$;
revoke execute on function public.track(uuid, text, text, boolean) from public;
grant execute on function public.track(uuid, text, text, boolean) to anon, authenticated;

-- ============ Administradores ============
-- Privada. Se carga desde el secret ADMIN_EMAILS de GitHub (workflow Servidor) — nunca en el código.
create table public.admins (email text primary key check (email = lower(email)));
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.admins where email = lower(coalesce(auth.jwt()->>'email', '')));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ============ Todo el panel en una sola llamada ============
create function public.admin_stats()
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
