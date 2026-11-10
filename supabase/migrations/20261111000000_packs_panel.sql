-- Olas UY · packs con descuento por sesión + datos para el panel del fotógrafo.

-- ============ Packs ============
-- Cada sesión puede tener hasta 6 packs: [{"n": 3, "price": 120}, ...]
-- Reglas: n entero entre 2 y 300 (sin repetir), precio entero >= 50 y
-- NUNCA más caro que comprar esas fotos sueltas (price <= n × precio por foto).
create function public.packs_ok(p jsonb, unit integer) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) <= 6
    and not exists (
      select 1 from jsonb_array_elements(p) e
      where case
        when jsonb_typeof(e) = 'object'
         and jsonb_typeof(e->'n') = 'number' and (e->>'n') ~ '^\d{1,3}$'
         and jsonb_typeof(e->'price') = 'number' and (e->>'price') ~ '^\d{1,7}$'
        then (e->>'n')::int not between 2 and 300
          or (e->>'price')::int < 50
          or (e->>'price')::int > (e->>'n')::int * unit
        else true end)
    and (select count(distinct e->>'n') from jsonb_array_elements(p) e) = jsonb_array_length(p);
$$;

alter table public.sessions add column packs jsonb not null default '[]'::jsonb;
alter table public.sessions add constraint sessions_packs_ok check (public.packs_ok(packs, price));

-- ============ Panel del fotógrafo ============
-- Ventas por sesión (solo las suyas, sin datos de compradores)
create function public.my_session_stats()
returns table (session_id uuid, sold integer, gross numeric, fee numeric)
language sql security definer set search_path = public stable as $$
  select f.session_id, count(*)::integer, sum(p.amount), sum(p.platform_fee)
  from public.purchases p
  join public.photos f on f.id = p.photo_id
  where p.photographer_id = auth.uid() and p.status = 'paid'
  group by f.session_id;
$$;
revoke execute on function public.my_session_stats() from public, anon;
grant execute on function public.my_session_stats() to authenticated;
