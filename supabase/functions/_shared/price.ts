// Precio con packs (el mismo cálculo está en index.html, `bestPrice`).
// Busca la combinación más barata de packs y fotos sueltas para llevar k fotos de una sesión.
// Un pack nunca puede salir más caro que esas fotos sueltas (lo controla la base de datos).
export type Pack = { n: number; price: number };

export function cleanPacks(raw: unknown, unit: number): Pack[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => ({ n: Math.trunc(Number(p?.n)), price: Math.trunc(Number(p?.price)) }))
    .filter((p) => p.n >= 2 && p.n <= 300 && p.price >= 50 && p.price <= p.n * unit);
}

export function bestPrice(k: number, unit: number, packs: Pack[]): { total: number; used: { n: number; price: number; times: number }[] } {
  const cost = [0], pick: (Pack | null)[] = [null];
  for (let i = 1; i <= k; i++) {
    cost[i] = cost[i - 1] + unit; pick[i] = null;
    for (const p of packs) if (p.n <= i && cost[i - p.n] + p.price < cost[i]) { cost[i] = cost[i - p.n] + p.price; pick[i] = p; }
  }
  const times = new Map<number, { n: number; price: number; times: number }>();
  for (let i = k; i > 0;) {
    const p = pick[i];
    if (!p) { i--; continue; }
    const t = times.get(p.n) ?? { ...p, times: 0 }; t.times++; times.set(p.n, t); i -= p.n;
  }
  return { total: cost[k], used: [...times.values()] };
}
