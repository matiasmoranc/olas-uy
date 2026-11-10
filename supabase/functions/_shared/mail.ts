// Mail al comprador con el link para descargar sus fotos (se manda una sola vez, cuando el pago se confirma).
// Usa Resend (resend.com). Si falta RESEND_API_KEY no hace nada: la compra sigue funcionando igual.
import { admin, DOWNLOAD_DAYS, env, one, SITE } from "./util.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function sendPurchaseMail(orderId: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  const { data } = await admin.from("purchases")
    .select("buyer_email, download_token, photo:photos(preview_key, taken_at, session:sessions(beach, day))")
    .eq("order_id", orderId).eq("status", "paid");
  if (!data?.length) return;
  const to = data[0].buyer_email;
  const pub = (Deno.env.get("R2_PUBLIC_URL") ?? "").replace(/\/$/, "");
  const n = data.length, una = n === 1;
  const s0 = one(one(data[0].photo)?.session);
  const page = `${SITE()}?orden=${orderId}`;
  const cards = data.map((x, i) => {
    const ph = one(x.photo);
    const dl = `${env("SUPABASE_URL")}/functions/v1/download?t=${x.download_token}`;
    return `<tr><td style="padding:8px 0">
      ${pub && ph ? `<img src="${pub}/${ph.preview_key}" width="260" alt="" style="display:block;width:260px;max-width:100%;border-radius:14px">` : ""}
      <a href="${dl}" style="display:inline-block;margin-top:8px;background:#ff6f4f;color:#fff;font-weight:700;text-decoration:none;padding:10px 16px;border-radius:999px">⬇ Descargar ${una ? "foto" : `foto ${i + 1}`}${ph?.taken_at ? ` · ${String(ph.taken_at).slice(0, 5)}` : ""}</a>
      </td></tr>`;
  }).join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#0c2a38;max-width:520px;margin:0 auto;padding:16px">
    <h1 style="font-size:24px;margin:0 0 6px">¡${una ? "Tu foto es tuya" : "Tus fotos son tuyas"}! 🌊</h1>
    <p style="color:#5b7380;margin:0 0 14px">${esc(s0?.beach ?? "")}${s0?.day ? ` · ${s0.day}` : ""} · ${n} ${una ? "foto original" : "fotos originales"}, sin marca de agua.</p>
    <a href="${page}" style="display:inline-block;background:#0c2a38;color:#fff;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">Ver y descargar ${una ? "tu foto" : "tus fotos"}</a>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px">${cards}</table>
    <p style="color:#5b7380;font-size:13px;margin-top:16px">Los links funcionan durante ${DOWNLOAD_DAYS} días. Si entrás a Olas UY con este mail, ${una ? "la" : "las"} tenés siempre en tu cuenta.</p>
    <p style="color:#5b7380;font-size:13px">Olas UY · la casa del surf uruguayo</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_FROM") ?? "Olas UY <fotos@olas.uy>",
      to: [to],
      subject: una ? "Tu foto de surf está lista para descargar" : `Tus ${n} fotos de surf están listas para descargar`,
      html,
    }),
  });
  if (!r.ok) console.error("Resend", r.status, await r.text());
}
