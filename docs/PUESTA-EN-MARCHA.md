# Puesta en marcha del servidor de Olas UY

Lo que tenés que crear con **tus** cuentas para que funcionen las cuentas con Google, la subida de fotos y los pagos.
Tiempo total: 45–60 minutos. Todo es gratis para empezar (Cloudflare R2 pide una tarjeta aunque no cobre).

> **Nunca pegues claves secretas en el chat.** Las secretas van en GitHub → *Settings → Secrets and variables → Actions*.
> Las públicas (URL de Supabase, clave *anon*, URL de las fotos) sí me las podés pasar para ponerlas en `config.js`.

---

## 1. Supabase (base de datos y cuentas) · 10 min

1. Entrá a **supabase.com** → *Start your project* → entrá con tu cuenta de GitHub.
2. *New project*:
   - Nombre: `olas-uy`
   - Contraseña de la base de datos: generá una larga y **guardala** (la vas a necesitar en el paso 5).
   - Región: **South America (São Paulo)**.
3. Cuando termine de crearse, anotá:
   - **Project URL** y **anon public key**: *Project Settings → API*. (Públicas)
   - **Project ref**: es el código de la URL, por ejemplo `abcdxyz` en `https://abcdxyz.supabase.co`.
4. **Access token**: arriba a la derecha, tu avatar → *Account → Access Tokens → Generate new token* (nombre `github`). (Secreto)
5. *Authentication → URL Configuration*:
   - **Site URL**: `https://matiasmoranc.github.io/olas-uy/`
   - **Redirect URLs** (agregá las dos): `https://matiasmoranc.github.io/olas-uy/**` y `https://olas.uy/**`

## 2. Entrar con Google · 15 min

1. Entrá a **console.cloud.google.com** → arriba, *Seleccionar proyecto → Proyecto nuevo* → `Olas UY`.
2. *APIs y servicios → Pantalla de consentimiento de OAuth* → **Externo** → nombre de la app `Olas UY`, tu mail de soporte → guardar. Después, *Publicar app*.
3. *APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth*:
   - Tipo: **Aplicación web**
   - *URI de redireccionamiento autorizados*: `https://TU-REF.supabase.co/auth/v1/callback` (con tu Project ref)
4. Copiá el **ID de cliente** y el **Secreto del cliente**.
5. En Supabase: *Authentication → Sign In / Providers → Google* → activalo, pegá los dos datos → *Save*.

## 3. Cloudflare R2 (fotos) · 10 min

1. En **dash.cloudflare.com** → *R2 Object Storage* → activalo (te pide una tarjeta; los primeros 10 GB son gratis).
2. *Create bucket* **dos veces**:
   - `olasuy-originales` → **privado** (no toques el acceso público).
   - `olasuy-previas` → *Settings → Public access* → activá **r2.dev subdomain** (o más adelante un dominio propio como `fotos.olas.uy`). Anotá esa **URL pública**. (Pública)
3. En **cada** bucket: *Settings → CORS policy → Edit* y pegá:
   ```json
   [{"AllowedOrigins":["https://matiasmoranc.github.io","https://olas.uy","https://www.olas.uy"],
     "AllowedMethods":["PUT","GET"],"AllowedHeaders":["*"],"MaxAgeSeconds":3600}]
   ```
4. *R2 → Manage R2 API Tokens → Create API token*:
   - Permiso: **Object Read & Write**, solo para esos dos buckets.
   - Anotá **Access Key ID** y **Secret Access Key**. (Secretos)
5. Anotá tu **Account ID** (aparece en la página de R2, a la derecha).

## 4. Mercado Pago (cobros) · 10 min

1. Entrá a **mercadopago.com.uy/developers** con tu cuenta → *Tus integraciones → Crear aplicación*:
   - Nombre: `Olas UY`
   - Tipo: **Pagos online**, producto **Checkout Pro**
   - ¿Es un marketplace? **Sí** (así los fotógrafos conectan su cuenta y cobramos la comisión).
2. En la aplicación → *Configuración / Edición*:
   - **URL de redireccionamiento**: `https://TU-REF.supabase.co/functions/v1/mp-connect`
3. *Credenciales de producción*: anotá **Client ID** y **Client Secret**. (Secretos)
4. *Webhooks → Configurar notificaciones*:
   - URL: `https://TU-REF.supabase.co/functions/v1/mp-webhook`
   - Evento: **Pagos**
   - Guardá y anotá la **clave secreta** de la firma. (Secreta)

## 5. Cargar las claves en GitHub · 5 min

En **github.com/matiasmoranc/olas-uy → Settings → Secrets and variables → Actions → New repository secret**, creá uno por cada fila:

| Nombre | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Access token del paso 1.4 |
| `SUPABASE_PROJECT_REF` | Project ref (ej. `abcdxyz`) |
| `SUPABASE_DB_PASSWORD` | Contraseña de la base del paso 1.2 |
| `R2_ACCOUNT_ID` | Account ID de Cloudflare |
| `R2_ACCESS_KEY_ID` | Access Key ID de R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key de R2 |
| `R2_PUBLIC_URL` | URL pública del bucket `olasuy-previas` |
| `MP_CLIENT_ID` | Client ID de Mercado Pago |
| `MP_CLIENT_SECRET` | Client Secret de Mercado Pago |
| `MP_WEBHOOK_SECRET` | Clave secreta de webhooks de Mercado Pago |
| `MP_STATE_SECRET` | Inventá una clave larga al azar (40+ letras y números, por ejemplo con un generador de contraseñas) |

Después: pestaña **Actions → Servidor (Supabase) → Run workflow**. Eso crea las tablas y sube las funciones.

## 6. Avisame

Pasame por el chat **solo los datos públicos**: Project URL, anon key y la URL pública de las fotos. Los pongo en `config.js` y aparece el botón **Entrar** en el sitio.

## 7. Entrar con Apple (opcional, requiere Apple Developer) · 15 min

En **developer.apple.com → Certificates, Identifiers & Profiles**:

1. **Identifiers → +  → App IDs → App**: descripción `Olas UY`, Bundle ID `uy.olas.app`, marcar **Sign In with Apple** → Register.
2. **Identifiers → + → Services IDs**: descripción `Olas UY Web`, identificador `uy.olas.web` → Register. Abrirlo, marcar **Sign In with Apple → Configure**:
   - Primary App ID: `uy.olas.app`
   - Domains: `gcakonxuqpcdpydrvyhz.supabase.co`
   - Return URLs: `https://gcakonxuqpcdpydrvyhz.supabase.co/auth/v1/callback`
3. **Keys → +**: nombre `Olas UY Sign in with Apple`, marcar **Sign in with Apple → Configure** (App ID `uy.olas.app`) → Register → **descargar el archivo .p8** (se baja una sola vez). Anotar el **Key ID** y el **Team ID** (arriba a la derecha).
4. En **GitHub → Settings → Secrets → Actions**, crear 3 secrets: `APPLE_TEAM_ID` (Team ID), `APPLE_KEY_ID` (Key ID) y `APPLE_PRIVATE_KEY` (abrir el .p8 con el Bloc de notas y pegar **todo** el texto, incluidas las líneas `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`).
5. Correr la acción **Entrar con Apple** (`.github/workflows/apple-login.yml`): genera el secreto de Apple y lo carga en Supabase (activa el proveedor Apple con Client ID `uy.olas.web`). Se repite sola el día 1 de cada mes, así el secreto (que vence a los 6 meses) nunca vence.
6. Poner `apple: true` en `config.js`.
