-- Olas UY · esquema inicial
-- Fotógrafos, sesiones, fotos, compras y conexión con Mercado Pago.
-- Regla de seguridad: todo con RLS. Las claves de las fotos ORIGINALES y los tokens de
-- Mercado Pago están en tablas sin políticas: solo las funciones del servidor (service role) las leen.

create extension if not exists pgcrypto;

-- ============ Fotógrafos (perfil público) ============
create table public.photographers (
  id           uuid primary key references auth.users(id) on delete cascade,
  slug         text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name         text not null check (char_length(name) between 2 and 60),
  bio          text check (char_length(bio) <= 400),
  zone         text check (char_length(zone) <= 60),
  avatar_url   text,
  mp_connected boolean not null default false,   -- lo pone en true solo la función mp-connect
  created_at   timestamptz not null default now()
);

-- ============ Sesiones (playa + día + horario) ============
create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers(id) on delete cascade,
  beach           text not null,
  day             date not null,
  start_time      time not null,
  end_time        time not null,
  price           integer not null check (price between 50 and 5000),   -- pesos uruguayos por foto
  published       boolean not null default false,
  created_at      timestamptz not null default now(),
  check (end_time > start_time)
);
create index sessions_beach_day on public.sessions (beach, day) where published;
create index sessions_photographer on public.sessions (photographer_id);

-- ============ Fotos (solo vista previa y miniatura públicas) ============
create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  taken_at    time,
  preview_key text not null,     -- con marca de agua, ~1600 px (bucket público)
  thumb_key   text not null,     -- miniatura (bucket público)
  width       integer,
  height      integer,
  ready       boolean not null default false,   -- true cuando terminó de subirse
  created_at  timestamptz not null default now()
);
create index photos_session on public.photos (session_id, taken_at);

-- Privado: dónde está la original (bucket privado)
create table public.photo_originals (
  photo_id     uuid primary key references public.photos(id) on delete cascade,
  original_key text not null
);

-- Privado: tokens de Mercado Pago de cada fotógrafo (OAuth)
create table public.mp_accounts (
  photographer_id uuid primary key references public.photographers(id) on delete cascade,
  mp_user_id      text not null,
  access_token    text not null,
  refresh_token   text,
  expires_at      timestamptz,
  updated_at      timestamptz not null default now()
);

-- ============ Compras ============
create table public.purchases (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null,                                   -- una orden = un pago de Mercado Pago
  photo_id        uuid not null references public.photos(id) on delete restrict,
  photographer_id uuid not null references public.photographers(id),
  buyer_id        uuid references auth.users(id) on delete set null, -- null si compró solo con el mail
  buyer_email     text not null,
  amount          numeric(10,2) not null,                           -- lo que pagó el comprador por esta foto
  platform_fee    numeric(10,2) not null,                           -- comisión de Olas UY
  status          text not null default 'pending' check (status in ('pending','paid','refunded','cancelled')),
  mp_payment_id   text,
  download_token  uuid not null unique default gen_random_uuid(),  -- link de descarga privado
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);
create index purchases_order on public.purchases (order_id);
create index purchases_buyer on public.purchases (buyer_id);
create index purchases_email on public.purchases (lower(buyer_email));

-- ============ Seguridad (RLS) ============
alter table public.photographers   enable row level security;
alter table public.sessions        enable row level security;
alter table public.photos          enable row level security;
alter table public.photo_originals enable row level security;
alter table public.mp_accounts     enable row level security;
alter table public.purchases       enable row level security;

-- Tablas privadas: sin políticas y sin permisos para el navegador
revoke all on public.photo_originals, public.mp_accounts from anon, authenticated;

-- Fotógrafos: todos ven los perfiles; cada uno crea y edita el suyo (menos mp_connected)
create policy "perfiles visibles" on public.photographers for select using (true);
create policy "crear mi perfil" on public.photographers for insert to authenticated with check (id = auth.uid());
create policy "editar mi perfil" on public.photographers for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update on public.photographers from anon, authenticated;
grant insert (id, slug, name, bio, zone, avatar_url) on public.photographers to authenticated;
grant update (slug, name, bio, zone, avatar_url) on public.photographers to authenticated;

-- Sesiones: públicas si están publicadas; el dueño ve y maneja las suyas
create policy "sesiones visibles" on public.sessions for select using (published or photographer_id = auth.uid());
create policy "crear sesión" on public.sessions for insert to authenticated with check (photographer_id = auth.uid());
create policy "editar sesión" on public.sessions for update to authenticated using (photographer_id = auth.uid()) with check (photographer_id = auth.uid());
create policy "borrar sesión" on public.sessions for delete to authenticated using (photographer_id = auth.uid());

-- Fotos: públicas si están listas y su sesión publicada; el dueño ve todas las suyas.
-- Se crean solo desde la función r2-upload; el dueño solo puede marcarlas listas o borrarlas.
create policy "fotos visibles" on public.photos for select using (
  (ready and exists (select 1 from public.sessions s where s.id = session_id and s.published))
  or exists (select 1 from public.sessions s where s.id = session_id and s.photographer_id = auth.uid()));
create policy "marcar lista" on public.photos for update to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.photographer_id = auth.uid()));
create policy "borrar foto" on public.photos for delete to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.photographer_id = auth.uid()));
revoke insert, update on public.photos from anon, authenticated;
grant update (ready) on public.photos to authenticated;

-- Compras: cada comprador ve las suyas (incluye su link de descarga). Se escriben solo desde el servidor.
create policy "mis compras" on public.purchases for select to authenticated using (buyer_id = auth.uid());
revoke insert, update, delete on public.purchases from anon, authenticated;

-- ============ Funciones para el sitio ============

-- Al entrar con Google: asocia a la cuenta las compras hechas antes solo con ese mail
create function public.claim_purchases() returns integer
language sql security definer set search_path = public as $$
  with u as (
    update public.purchases set buyer_id = auth.uid()
    where auth.uid() is not null and buyer_id is null
      and lower(buyer_email) = lower(auth.jwt() ->> 'email')
    returning 1)
  select count(*)::integer from u;
$$;
revoke execute on function public.claim_purchases() from public, anon;
grant execute on function public.claim_purchases() to authenticated;

-- Ventas del fotógrafo (sin mostrarle el mail de los compradores)
create function public.my_sales() returns table (paid_at timestamptz, beach text, day date, taken_at time, amount numeric, platform_fee numeric)
language sql security definer set search_path = public stable as $$
  select p.paid_at, s.beach, s.day, f.taken_at, p.amount, p.platform_fee
  from public.purchases p
  join public.photos f on f.id = p.photo_id
  join public.sessions s on s.id = f.session_id
  where p.photographer_id = auth.uid() and p.status = 'paid'
  order by p.paid_at desc;
$$;
revoke execute on function public.my_sales() from public, anon;
grant execute on function public.my_sales() to authenticated;
