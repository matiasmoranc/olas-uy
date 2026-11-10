// Utilidades compartidas por las funciones del servidor (Supabase Edge Functions, Deno).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { AwsClient } from "npm:aws4fetch@1.0.20";

export const env = (k: string): string => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Falta la variable ${k}`);
  return v;
};

// Comisión de Olas UY sobre el precio de cada foto (0.15 = 15%).
export const PLATFORM_FEE = Number(Deno.env.get("PLATFORM_FEE") ?? "0.15");
// Días que dura el link de descarga de una foto comprada.
export const DOWNLOAD_DAYS = Number(Deno.env.get("DOWNLOAD_DAYS") ?? "30");

// Cliente con permisos de servidor (salta RLS). Nunca se expone al navegador.
export const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

// Usuario que hace el pedido (por el token de sesión que manda el sitio), o null.
export async function userFrom(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  return error ? null : data.user;
}

// CORS: el sitio (GitHub Pages hoy, olas.uy mañana) llama a estas funciones desde el navegador.
const ORIGINS = (Deno.env.get("SITE_ORIGINS") ?? "https://matiasmoranc.github.io,https://olas.uy,https://www.olas.uy").split(",");
export function cors(req: Request): Record<string, string> {
  const o = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}
export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

// ============ Cloudflare R2 (compatible con S3) ============
let r2: AwsClient | null = null; // se crea recién cuando se usa
export const R2_PRIVATE = Deno.env.get("R2_PRIVATE_BUCKET") ?? "olasuy-originales";
export const R2_PUBLIC = Deno.env.get("R2_PUBLIC_BUCKET") ?? "olasuy-previas";

// Link firmado que vence: para subir (PUT), descargar (GET) o borrar (DELETE) un archivo sin hacerlo público.
export async function presign(method: "PUT" | "GET" | "DELETE", bucket: string, key: string, seconds = 600, extra: Record<string, string> = {}) {
  r2 ??= new AwsClient({ accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" });
  const url = new URL(`https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  url.searchParams.set("X-Amz-Expires", String(seconds));
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  const signed = await r2.sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

// ============ Mercado Pago ============
export const MP_API = "https://api.mercadopago.com";

// Token vigente del fotógrafo (lo renueva si está por vencer).
export async function mpToken(photographerId: string): Promise<{ token: string; mpUserId: string } | null> {
  const { data: acc } = await admin.from("mp_accounts").select("*").eq("photographer_id", photographerId).maybeSingle();
  if (!acc) return null;
  const soon = acc.expires_at && new Date(acc.expires_at).getTime() < Date.now() + 3 * 864e5;
  if (soon && acc.refresh_token) {
    const r = await fetch(`${MP_API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env("MP_CLIENT_ID"),
        client_secret: env("MP_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: acc.refresh_token,
      }),
    });
    if (r.ok) {
      const t = await r.json();
      await admin.from("mp_accounts").update({
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? acc.refresh_token,
        expires_at: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("photographer_id", photographerId);
      return { token: t.access_token, mpUserId: acc.mp_user_id };
    }
  }
  return { token: acc.access_token, mpUserId: acc.mp_user_id };
}

// Firma HMAC (para el "state" del OAuth y para validar avisos de Mercado Pago).
export async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Relación "muchos a uno" de Supabase: viene como objeto (o como lista sin tipos generados).
export const one = <T>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x ?? undefined);

export const round2 = (n: number) => Math.round(n * 100) / 100;
// Dirección del sitio (adonde vuelve Mercado Pago y a donde apuntan los mails).
export const SITE = () => Deno.env.get("SITE_URL") ?? "https://matiasmoranc.github.io/olas-uy/";
export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
