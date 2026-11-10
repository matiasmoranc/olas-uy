// Aviso de Mercado Pago cuando cambia un pago. Si está aprobado y el monto coincide,
// marca la orden como pagada (y se habilitan las descargas) y le manda el mail con los links al comprador.
// Mercado Pago llama a: /functions/v1/mp-webhook?ph=<fotógrafo>  (lo pusimos en checkout)
import { admin, hmacHex, MP_API, mpToken, round2 } from "../_shared/util.ts";
import { sendPurchaseMail } from "../_shared/mail.ts";

const ok = () => new Response("ok", { status: 200 });

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const photographerId = url.searchParams.get("ph") ?? "";
    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* algunos avisos vienen sin cuerpo */ }
    const type = body.type ?? body.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
    const paymentId = String(body?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
    if (type !== "payment" || !/^\d+$/.test(paymentId) || !photographerId) return ok();

    // Validar la firma del aviso (si configuraste la clave secreta de webhooks en Mercado Pago)
    const secret = Deno.env.get("MP_WEBHOOK_SECRET");
    if (secret) {
      const parts = Object.fromEntries((req.headers.get("x-signature") ?? "").split(",").map((s) => s.trim().split("=")));
      const manifest = `id:${url.searchParams.get("data.id") ?? paymentId};request-id:${req.headers.get("x-request-id") ?? ""};ts:${parts.ts};`;
      if (!parts.v1 || (await hmacHex(secret, manifest)) !== parts.v1) return new Response("firma inválida", { status: 401 });
    }

    // Consultamos el pago a Mercado Pago (no confiamos en lo que dice el aviso)
    const mp = await mpToken(photographerId);
    if (!mp) return ok();
    const r = await fetch(`${MP_API}/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${mp.token}` } });
    if (!r.ok) return new Response("reintentar", { status: 500 });
    const pay = await r.json();
    const orderId = pay.external_reference;
    if (!orderId) return ok();

    const { data: rows } = await admin.from("purchases").select("id, amount, status").eq("order_id", orderId).eq("photographer_id", photographerId);
    if (!rows?.length) return ok();
    const total = round2(rows.reduce((t, x) => t + Number(x.amount), 0));

    if (pay.status === "approved" && round2(Number(pay.transaction_amount)) >= total && pay.currency_id === "UYU") {
      const { data: now } = await admin.from("purchases").update({ status: "paid", paid_at: new Date().toISOString(), mp_payment_id: paymentId })
        .eq("order_id", orderId).eq("status", "pending").select("id");
      // Solo el aviso que efectivamente la marcó pagada manda el mail (Mercado Pago a veces avisa dos veces)
      if (now?.length) { try { await sendPurchaseMail(orderId); } catch (e) { console.error("mail", e); } }
    } else if (["refunded", "charged_back"].includes(pay.status)) {
      await admin.from("purchases").update({ status: "refunded" }).eq("order_id", orderId);
    } else if (["rejected", "cancelled"].includes(pay.status)) {
      await admin.from("purchases").update({ status: "cancelled" }).eq("order_id", orderId).eq("status", "pending");
    }
    return ok();
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 }); // Mercado Pago reintenta
  }
});
