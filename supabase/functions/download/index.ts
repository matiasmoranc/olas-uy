// Descarga de la foto ORIGINAL ya comprada.
// GET ?t=<download_token>   → redirige a un link de R2 que vence en 5 minutos
// GET ?orden=<order_id>     → lista de fotos de esa orden (para la pantalla "¡Es tuya!")
import { admin, cors, DOWNLOAD_DAYS, env, isUuid, json, one, presign, R2_PRIVATE } from "../_shared/util.ts";

const PUBLIC_URL = () => (Deno.env.get("R2_PUBLIC_URL") ?? "").replace(/\/$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  try {
    const q = new URL(req.url).searchParams;

    // ---- Lista de una orden (el id de la orden solo lo conoce quien pagó)
    const orden = q.get("orden");
    if (orden) {
      if (!isUuid(orden)) return json(req, { error: "Orden inválida" }, 400);
      const { data } = await admin.from("purchases")
        .select("status, download_token, photo:photos(preview_key, taken_at, session:sessions(beach, day))")
        .eq("order_id", orden);
      if (!data?.length) return json(req, { error: "No encontramos esa compra" }, 404);
      return json(req, {
        status: data.every((x) => x.status === "paid") ? "paid" : data.some((x) => x.status === "pending") ? "pending" : "error",
        photos: data.map((x) => {
          const ph = one(x.photo), se = one(ph?.session);
          return {
            preview: `${PUBLIC_URL()}/${ph?.preview_key}`,
            beach: se?.beach, day: se?.day, taken_at: ph?.taken_at,
            download: x.status === "paid" ? `${env("SUPABASE_URL")}/functions/v1/download?t=${x.download_token}` : null,
          };
        }),
      });
    }

    // ---- Descarga de una foto
    const t = q.get("t");
    if (!isUuid(t)) return new Response("Link inválido", { status: 400 });
    const { data: p } = await admin.from("purchases").select("photo_id, status, paid_at").eq("download_token", t).maybeSingle();
    if (!p || p.status !== "paid") return new Response("Esta foto todavía no está pagada", { status: 403 });
    if (Date.now() - new Date(p.paid_at).getTime() > DOWNLOAD_DAYS * 864e5) {
      return new Response("El link venció. Entrá con tu cuenta en Olas UY para volver a descargarla.", { status: 410 });
    }
    const { data: o } = await admin.from("photo_originals").select("original_key").eq("photo_id", p.photo_id).maybeSingle();
    if (!o) return new Response("No encontramos la foto", { status: 404 });
    const name = `olas-uy-${p.photo_id.slice(0, 8)}.${o.original_key.split(".").pop()}`;
    const signed = await presign("GET", R2_PRIVATE, o.original_key, 300, {
      "response-content-disposition": `attachment; filename="${name}"`,
    });
    return Response.redirect(signed, 302);
  } catch (e) {
    console.error(e);
    return new Response("No se pudo descargar", { status: 500 });
  }
});
