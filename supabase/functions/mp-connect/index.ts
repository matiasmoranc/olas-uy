// Conexión de la cuenta de Mercado Pago de cada fotógrafo (OAuth de Mercado Pago, modelo marketplace).
// 1) POST (con sesión del sitio)  → { url }  : el sitio manda al fotógrafo a Mercado Pago a autorizar.
// 2) GET ?code=...&state=...      ← Mercado Pago vuelve acá; guardamos el token y volvemos al sitio.
import { admin, cors, env, hmacHex, json, MP_API, userFrom } from "../_shared/util.ts";

const REDIRECT = () => `${env("SUPABASE_URL")}/functions/v1/mp-connect`;
const SITE = () => Deno.env.get("SITE_URL") ?? "https://matiasmoranc.github.io/olas-uy/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  try {
    // ---- Paso 1: armar el link de autorización
    if (req.method === "POST") {
      const user = await userFrom(req);
      if (!user) return json(req, { error: "Tenés que entrar con tu cuenta" }, 401);
      const { data: ph } = await admin.from("photographers").select("id").eq("id", user.id).maybeSingle();
      if (!ph) return json(req, { error: "Primero creá tu perfil de fotógrafo" }, 400);
      const ts = Date.now().toString();
      const state = `${user.id}.${ts}.${await hmacHex(env("MP_STATE_SECRET"), `${user.id}.${ts}`)}`;
      const u = new URL("https://auth.mercadopago.com/authorization");
      u.searchParams.set("client_id", env("MP_CLIENT_ID"));
      u.searchParams.set("response_type", "code");
      u.searchParams.set("platform_id", "mp");
      u.searchParams.set("state", state);
      u.searchParams.set("redirect_uri", REDIRECT());
      return json(req, { url: u.toString() });
    }

    // ---- Paso 2: vuelta desde Mercado Pago
    const q = new URL(req.url).searchParams;
    const code = q.get("code"), state = q.get("state") ?? "";
    const back = (ok: boolean) => Response.redirect(`${SITE()}?mp=${ok ? "ok" : "error"}#vender`, 302);
    const [uid, ts, sig] = state.split(".");
    if (!code || !uid || !ts || !sig) return back(false);
    if (Date.now() - Number(ts) > 30 * 60e3) return back(false); // el link vale 30 minutos
    if ((await hmacHex(env("MP_STATE_SECRET"), `${uid}.${ts}`)) !== sig) return back(false);

    const r = await fetch(`${MP_API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env("MP_CLIENT_ID"),
        client_secret: env("MP_CLIENT_SECRET"),
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT(),
      }),
    });
    if (!r.ok) { console.error(await r.text()); return back(false); }
    const t = await r.json();
    const { error } = await admin.from("mp_accounts").upsert({
      photographer_id: uid,
      mp_user_id: String(t.user_id),
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? null,
      expires_at: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    if (error) { console.error(error); return back(false); }
    await admin.from("photographers").update({ mp_connected: true }).eq("id", uid);
    return back(true);
  } catch (e) {
    console.error(e);
    return json(req, { error: "No se pudo conectar Mercado Pago" }, 500);
  }
});
