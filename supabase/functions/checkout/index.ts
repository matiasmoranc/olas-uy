// Compra: arma el pago en Mercado Pago (modelo marketplace).
// El pago se cobra en la cuenta del FOTÓGRAFO y Mercado Pago le pasa a Olas UY su comisión
// (marketplace_fee) automáticamente. Opción A: el comprador paga el precio publicado.
// Packs: si la sesión tiene packs ("3 fotos por $120"), se cobra la combinación más barata (bestPrice).
// POST { photo_ids: [...], email }  (todas las fotos del mismo fotógrafo)  → { url }
import { admin, cors, env, isUuid, json, MP_API, mpToken, one, PLATFORM_FEE, round2, SITE, userFrom } from "../_shared/util.ts";
import { bestPrice, cleanPacks } from "../_shared/price.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Método no permitido" }, 405);
  try {
    const user = await userFrom(req); // opcional: también se puede comprar solo con el mail
    const { photo_ids, email } = await req.json();
    const mail = String(email ?? user?.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return json(req, { error: "Revisá tu mail" }, 400);
    if (!Array.isArray(photo_ids) || photo_ids.length < 1 || photo_ids.length > 300 || !photo_ids.every(isUuid)) {
      return json(req, { error: "Elegí al menos una foto" }, 400);
    }
    const ids = [...new Set(photo_ids)];

    const { data: raw, error } = await admin.from("photos")
      .select("id, ready, taken_at, session:sessions(id, beach, day, price, packs, published, photographer_id)")
      .in("id", ids);
    if (error) throw error;
    const photos = (raw ?? []).map((p) => ({ ...p, session: one(p.session) }));
    if (!photos || photos.length !== ids.length || photos.some((p) => !p.ready || !p.session?.published)) {
      return json(req, { error: "Alguna foto ya no está disponible" }, 409);
    }
    const phIds = new Set(photos.map((p) => p.session!.photographer_id));
    if (phIds.size !== 1) return json(req, { error: "Comprá las fotos de cada fotógrafo por separado" }, 400);
    const photographerId = [...phIds][0];

    const mp = await mpToken(photographerId);
    if (!mp) return json(req, { error: "Este fotógrafo todavía no puede cobrar" }, 409);

    // Precio por sesión (con packs) y reparto del total entre sus fotos
    const orderId = crypto.randomUUID();
    const bySession = new Map<string, typeof photos>();
    for (const p of photos) bySession.set(p.session!.id, [...(bySession.get(p.session!.id) ?? []), p]);
    const rows: Record<string, unknown>[] = [];
    const items: Record<string, unknown>[] = [];
    for (const list of bySession.values()) {
      const s = list[0].session!, unit = Number(s.price);
      const { total, used } = bestPrice(list.length, unit, cleanPacks(s.packs, unit));
      const each = Math.floor((total / list.length) * 100) / 100;
      list.forEach((p, i) => {
        const amount = i === list.length - 1 ? round2(total - each * (list.length - 1)) : each;
        rows.push({
          order_id: orderId, photo_id: p.id, photographer_id: photographerId,
          buyer_id: user?.id ?? null, buyer_email: mail,
          amount, platform_fee: round2(amount * PLATFORM_FEE),
        });
      });
      const packTxt = used.length ? ` (${used.map((u) => `${u.times > 1 ? u.times + "× " : ""}pack ${u.n}`).join(" + ")})` : "";
      items.push({
        id: s.id,
        title: `${list.length === 1 ? "Foto" : list.length + " fotos"} de surf · ${s.beach} ${s.day}${packTxt}`,
        quantity: 1,
        unit_price: round2(total),
        currency_id: "UYU",
      });
    }
    const { error: e2 } = await admin.from("purchases").insert(rows);
    if (e2) throw e2;
    const fee = round2(rows.reduce((t, r) => t + Number(r.platform_fee), 0));

    const pref = await fetch(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${mp.token}` },
      body: JSON.stringify({
        items,
        marketplace_fee: fee,
        payer: { email: mail },
        external_reference: orderId,
        notification_url: `${env("SUPABASE_URL")}/functions/v1/mp-webhook?ph=${photographerId}`,
        back_urls: {
          // Sin "#": Mercado Pago lo borra al volver. El sitio detecta ?orden= y abre la descarga.
          success: `${SITE()}?orden=${orderId}`,
          pending: `${SITE()}?orden=${orderId}`,
          failure: `${SITE()}#fotos`,
        },
        auto_return: "approved",
        statement_descriptor: "OLAS UY",
      }),
    });
    if (!pref.ok) {
      console.error(await pref.text());
      await admin.from("purchases").update({ status: "cancelled" }).eq("order_id", orderId);
      return json(req, { error: "Mercado Pago no respondió. Probá de nuevo." }, 502);
    }
    const p = await pref.json();
    return json(req, { url: p.init_point, order_id: orderId });
  } catch (e) {
    console.error(e);
    return json(req, { error: "No se pudo iniciar el pago" }, 500);
  }
});
