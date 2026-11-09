// Subida de fotos: el fotógrafo pide links firmados y sube DIRECTO a Cloudflare R2 desde su navegador
// (las fotos pesadas no pasan por nuestro servidor).
// POST { session_id, files: [{ taken_at?: "07:42", width?, height?, ext: "jpg" }] }  (hasta 50 por pedido)
// → [{ id, original, preview, thumb }]  (links PUT que vencen en 15 min)
// Después de subir, el sitio marca cada foto como lista (photos.ready = true, permitido por RLS).
import { admin, cors, isUuid, json, presign, R2_PRIVATE, R2_PUBLIC, userFrom } from "../_shared/util.ts";

const EXT = new Set(["jpg", "jpeg", "png", "webp", "heic"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Método no permitido" }, 405);
  try {
    const user = await userFrom(req);
    if (!user) return json(req, { error: "Tenés que entrar con tu cuenta" }, 401);

    const { session_id, files } = await req.json();
    if (!isUuid(session_id) || !Array.isArray(files) || files.length < 1 || files.length > 50) {
      return json(req, { error: "Pedido inválido" }, 400);
    }
    const { data: ses } = await admin.from("sessions").select("id, photographer_id").eq("id", session_id).maybeSingle();
    if (!ses || ses.photographer_id !== user.id) return json(req, { error: "Esa sesión no es tuya" }, 403);

    const out = [];
    for (const f of files) {
      const ext = String(f?.ext ?? "jpg").toLowerCase();
      if (!EXT.has(ext)) return json(req, { error: `Formato no permitido: ${ext}` }, 400);
      const taken = typeof f?.taken_at === "string" && /^\d{1,2}:\d{2}$/.test(f.taken_at) ? f.taken_at : null;
      const id = crypto.randomUUID();
      const originalKey = `originales/${session_id}/${id}.${ext}`;
      const previewKey = `previas/${session_id}/${id}.jpg`;
      const thumbKey = `miniaturas/${session_id}/${id}.jpg`;

      const { error: e1 } = await admin.from("photos").insert({
        id, session_id, taken_at: taken, preview_key: previewKey, thumb_key: thumbKey,
        width: Number.isFinite(f?.width) ? f.width : null, height: Number.isFinite(f?.height) ? f.height : null,
      });
      if (e1) throw e1;
      const { error: e2 } = await admin.from("photo_originals").insert({ photo_id: id, original_key: originalKey });
      if (e2) throw e2;

      out.push({
        id,
        original: await presign("PUT", R2_PRIVATE, originalKey, 900),
        preview: await presign("PUT", R2_PUBLIC, previewKey, 900),
        thumb: await presign("PUT", R2_PUBLIC, thumbKey, 900),
      });
    }
    return json(req, out);
  } catch (e) {
    console.error(e);
    return json(req, { error: "No se pudo preparar la subida" }, 500);
  }
});
