// Borrar una sesión (panel del fotógrafo): borra sus fotos de R2 (original, previa y miniatura) y de la base.
// Si alguna foto ya se vendió, NO se borra (el comprador tiene derecho a descargarla): hay que ocultarla.
// POST { session_id } → { ok: true }
import { admin, cors, isUuid, json, presign, R2_PRIVATE, R2_PUBLIC, userFrom } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Método no permitido" }, 405);
  try {
    const user = await userFrom(req);
    if (!user) return json(req, { error: "Tenés que entrar con tu cuenta" }, 401);
    const { session_id } = await req.json();
    if (!isUuid(session_id)) return json(req, { error: "Pedido inválido" }, 400);
    const { data: ses } = await admin.from("sessions").select("id, photographer_id").eq("id", session_id).maybeSingle();
    if (!ses || ses.photographer_id !== user.id) return json(req, { error: "Esa sesión no es tuya" }, 403);

    const { data: photos } = await admin.from("photos").select("id, preview_key, thumb_key, original:photo_originals(original_key)").eq("session_id", session_id);
    const ids = (photos ?? []).map((p) => p.id);
    if (ids.length) {
      const { count } = await admin.from("purchases").select("id", { count: "exact", head: true }).in("photo_id", ids).in("status", ["paid", "refunded"]);
      if (count) return json(req, { error: "Esta sesión tiene fotos vendidas: podés ocultarla, pero no borrarla." }, 409);
      // Compras que nunca se pagaron (pendientes o canceladas): se pueden borrar
      const { error: e1 } = await admin.from("purchases").delete().in("photo_id", ids).in("status", ["pending", "cancelled"]);
      if (e1) throw e1;
    }
    // Archivos en R2 (de a 10 en paralelo); si alguno ya no estaba, no importa
    const files: [string, string][] = [];
    for (const p of photos ?? []) {
      files.push([R2_PUBLIC, p.preview_key], [R2_PUBLIC, p.thumb_key]);
      const o = Array.isArray(p.original) ? p.original[0] : p.original;
      if (o?.original_key) files.push([R2_PRIVATE, o.original_key]);
    }
    for (let i = 0; i < files.length; i += 10) {
      await Promise.all(files.slice(i, i + 10).map(async ([b, k]) => {
        const r = await fetch(await presign("DELETE", b, k, 120), { method: "DELETE" });
        if (!r.ok && r.status !== 404) console.error("R2 delete", r.status, k);
      }));
    }
    const { error: e2 } = await admin.from("sessions").delete().eq("id", session_id);
    if (e2) throw e2;
    return json(req, { ok: true });
  } catch (e) {
    console.error(e);
    return json(req, { error: "No se pudo borrar la sesión" }, 500);
  }
});
