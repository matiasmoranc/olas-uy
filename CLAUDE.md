# Olas UY

"La casa del surf uruguayo": pronóstico de olas por playa + lugar donde los surfistas encuentran y compran las fotos que les sacaron en el agua + panel para que los fotógrafos suban y vendan sus fotos. Interfaz en español rioplatense (voseo: "tocá", "deslizá"). Prioridades del usuario: **UX/UI muy simple, poco texto, diseño claro (colores claros), dinámico, y buen SEO**.

## Publicación

- GitHub Pages: https://matiasmoranc.github.io/olas-uy/ (rama `main`, carpeta raíz). Cada push a `main` se publica solo en 1–2 minutos.
- **Por ahora el sitio solo se ve desde el link de github.io.** No hay archivo `CNAME`, así que **olas.uy no muestra nada** (decisión del usuario).
- Dominio olas.uy: registrado en Hosting Montevideo, DNS en Cloudflare apuntando a GitHub Pages (A de `@` a 185.199.108–111.153, CNAME `www` → `matiasmoranc.github.io`, nube gris). Para activarlo: agregar `CNAME` con `olas.uy` y configurar el dominio en Settings → Pages.
- `index.html` tiene `noindex` mientras sea una maqueta con datos de ejemplo. Sacarlo cuando el contenido sea real.
- `maqueta/index.html` solo redirige a la raíz (link viejo).

## Estado actual

Todo está en `index.html` (HTML + CSS + JS, sin build).

- **Pronóstico: datos REALES** de Open-Meteo (Marine API: altura, dirección y período de ola, mar de fondo, mar de viento; Forecast API: viento). Una sola llamada por API para todas las playas (coordenadas separadas por coma), 7 días, `timezone=America/Montevideo`. `SPOT` = punto en el mar donde se pide el pronóstico + `facing` de cada playa. `effH()`/`expo()` = altura en la playa según de dónde viene el mar; `windK()` = terral/calmo/cruzado/de mar; `score()` = puntaje 0–10; calificación `g` (0 Plano … 4 Muy bueno, 5 Peligroso si ola ≥ 3 m o viento ≥ 50 km/h). `build()` arma `FC` desde hoy 0:00 (hora de Uruguay, `nowUY()`), índice = día*24 + hora.
- Arranque (`boot()`): muestra al instante el último pronóstico guardado (`localStorage` `olasuy-fc`) y actualiza en segundo plano; reintenta 3 veces. Sin conexión usa lo guardado ("Sin conexión · datos de las HH:MM"); si nunca cargó, datos de ejemplo (`sampleFC()`), avisado. Se actualiza solo cada 30 min, al volver a la pestaña y al recuperar internet. Solo se muestra un aviso al lado de la leyenda si no hay conexión o son datos de ejemplo (no "Open-Meteo · hora").
- **Fotos, fotógrafos y ventas: REALES** desde Supabase/R2 cuando hay `config.js` (`isReal()`). Sin fotos todavía, se muestran rectángulos gris claro (`.skel`) donde van las fotos; **nunca fotos ficticias**. Las pantallas de ejemplo (`fotosDemo`, `sesionDemo`, `fotografoDemo`, `venderDemo`, fotos dibujadas con `photo()`) quedan solo para cuando no hay configuración.

Ruteo por hash (`#inicio`, `#olas`, `#fotos`, `#sesion=<id>`, `#fotografo=<slug>`, `#vender`, `#listo` con `?orden=`); el parámetro después de `=` queda en `S.arg`; objeto `V` con una función por pantalla que devuelve `{url, title, sec, html, after}`. `url` es la dirección "para Google" que tendría cada pantalla en la versión real.

- **Diseño**: tema claro único ("espuma y arena"), tokens en `:root`; fuentes Bricolage Grotesque (títulos) + Outfit. Navegación con dock flotante abajo (Olas · Mis fotos · Vender), fondo turquesa transparente. Transiciones con View Transitions; respeta `prefers-reduced-motion`.
- **Inicio**: portada con olas animadas en canvas (`sea()`), mejor playa ahora, carrusel "Ahora" (`nowOrder()`: ♥ favoritas, después las más abiertas, después el resto por puntaje) y "Recién subidas". Los carruseles (`.rail`) usan `scroll-padding-inline` para no pegarse al borde en el celular.
- **Olas (`#olas`)**:
  - Arriba, mapa SVG con zoom (rueda, pellizco, arrastre, +/−/⤢). Costa, lagunas y fronteras reales de GSHHG alta resolución (1:250.000, del paquete PyPI `basemap-data-hires`), simplificadas a ~20 m y proyectadas con `PJ(lat,lon)`. El tinte gris de Argentina y Brasil sale de geo-maps / Natural Earth.
  - `MAPPOS`: posición de cada playa, ajustada a la orilla real.
  - Al tocar una playa: si está lejos o encimada, `tapMk()` acerca el mapa; si no, abre una hoja (`openBeach`) con el pronóstico de ahora y de los 7 días.
  - Debajo del mapa: selector de día (7 días), barra de hora y "Tus playas": ♥ favoritas (`olasuy-maq-favs`) y "las que más mirás" (contador `olasuy-maq-views`, aparecen con 2 o más vistas). Más abajo, "Todas", ordenadas por puntaje.
  - Tarjeta (`waveCard`): siempre desplegada (se ven los 7 días); tocarla suma una vista (una vez por pantalla). altura arriba a la derecha, "⭐ puntaje/10", período, viento (flecha verde terral / gris cruzado / roja de mar + km/h) y barritas de 24 h. Tocar o arrastrar las barritas, o tocar un día dentro de la tarjeta, cambia **solo esa playa** (`S.sel[playa]=[día,hora]`, `paintBeach()`) y aparece un botón "🕐 día · hora ✕" para volver a la hora general. La barra de hora y los días de arriba cambian todas las playas (y borran las horas propias). Al abrirla: mejor puntaje de cada uno de los 7 días y mejor hora del día.
  - `score()` replica el `evaluate()` real (tamaño × período ± viento).
  - Botón **▶ Simulación** en cada tarjeta (`openSim()`): pantalla completa con la ola animada de costado (`drawWave()`, en canvas) junto a una persona de 1,70 m para escala, a la hora y día de esa tarjeta. `waveType()` define la forma: plano, espuma, formada, tubo, picado o bomba (según altura, período y viento). Adentro hay días y barra de hora; cambiarlos actualiza también esa tarjeta (`S.sel`). Con `prefers-reduced-motion` se dibuja quieta.
- **Fotos (`#fotos`, `#sesion=<id>`)**: "¿Dónde surfeaste?" (playas) + "¿Cuándo?" (últimos 7 días) → sesiones publicadas reales (`fetchSessions`, portada = primera miniatura). En la sesión (`fetchSession`): miniaturas por hora y barra de hora para encontrarse. Visor con la previa (marca de agua ya incluida). "Llevala en alta" → hoja con mail → función `checkout` → Mercado Pago. Caché `need()` de 60 s; `clearRC()` al publicar.
- **Compra lista (`#listo?orden=`)**: consulta `download?orden=` cada 4 s hasta que el webhook confirma el pago; muestra las previas con "Descargar" (link firmado a la original).
- **Inicio**: "Recién subidas" con las últimas sesiones reales (`recentReal()`).
- **Fotógrafo (`#fotografo=<slug>`)**: perfil público real (nombre, zona, bio, cantidad de fotos y sesiones, sus sesiones).
- **Vender (`#vender`)** — REAL cuando hay Supabase (`venderReal()`; sin configuración usa `venderDemo()`):
  - Sin sesión: "Entrar con Google". Sin perfil (`PH_ME===null`): alta de fotógrafo (nombre, zona, bio; `slug` único con reintento si choca).
  - Barra "Conectá Mercado Pago" (función `mp-connect`; al volver, `?mp=ok` muestra aviso). Publicar queda bloqueado sin MP conectado.
  - Asistente: fotos (JPG/PNG/WebP, hasta 300) → playa, día (últimos 7) y horario → precio (te quedan precio×85%).
  - `publishSession()`: crea la sesión (sin publicar), pide links firmados a `r2-upload` de a 8, sube a R2 la original + previa 1600 px + miniatura 520 px (ambas con marca de agua "olas.uy" hecha en el navegador con `rendition()`), marca cada foto `ready` y al final publica la sesión. Hora de cada foto: EXIF DateTimeOriginal (`exifTime()`) o la del archivo. Barra de progreso.

## Servidor (en construcción)

- **Supabase** (base de datos Postgres + cuentas con Google) + **Cloudflare R2** (fotos) + **Mercado Pago marketplace** (cobros). Guía para crear las cuentas: `docs/PUESTA-EN-MARCHA.md`.
- `supabase/migrations/`: esquema con RLS. Tablas públicas `photographers`, `sessions`, `photos`, `purchases`; **privadas** (sin políticas ni permisos para el navegador) `photo_originals` (dónde está la original) y `mp_accounts` (tokens OAuth de Mercado Pago de cada fotógrafo). Funciones `claim_purchases()` (al entrar, asocia compras hechas con ese mail) y `my_sales()` (ventas del fotógrafo sin mails de compradores). Probado contra Postgres 16 con 27 pruebas de permisos.
- `supabase/functions/` (Deno): `r2-upload` (links firmados para subir directo a R2: original privada + previa con marca de agua + miniatura), `mp-connect` (OAuth del fotógrafo), `checkout` (preferencia de pago con `marketplace_fee` = `PLATFORM_FEE` 15%, opción A: el comprador paga el precio publicado), `mp-webhook` (verifica firma y consulta el pago; marca la orden pagada si el monto coincide), `download` (link firmado de 5 min a la original, válido `DOWNLOAD_DAYS` = 30 días desde la compra). `_shared/util.ts`: utilidades. Type-check: `deno check supabase/functions/*/index.ts`.
- `.github/workflows/supabase.yml`: al cambiar `supabase/**` en `main`, aplica migraciones, carga claves y sube funciones. Si faltan los secrets, termina sin hacer nada.
- Entrar: Google siempre; **Apple** con `apple: true` en `config.js` (App ID `uy.olas.app` + Services ID `uy.olas.web` + clave .p8 en Apple Developer, `docs/PUESTA-EN-MARCHA.md` §7; el workflow `apple-login.yml` genera el secreto ES256 y lo carga en Supabase vía Management API, y lo renueva el día 1 de cada mes — vence a los 6 meses). `signIn()` abre una hoja con "Continuar con Google / Apple"; `loginButtons()` también en Vender.
- Sitio: `config.js` (valores PÚBLICOS: URL de Supabase, clave anon, URL de fotos). Vacío = el sitio funciona como antes. Con datos: aparece "Entrar" (Google) y "Tus fotos" con descargas (`initAccounts()`).
- Cobro como **particular** con cuenta personal de Mercado Pago al principio; pasar a unipersonal **Literal E** si crece (misma cuenta de MP, se le agrega el RUT).
- Pendiente: probar una compra real de punta a punta (3 cuentas distintas de MP: Olas UY, fotógrafo, comprador); mandar mail al comprador con el link; que el fotógrafo vea y borre sus sesiones; pasar a la API de Orders de MP cuando discontinúen Preferences.

## Decisiones de producto

- Pagos: **Mercado Pago dividido** (marketplace). El pago va directo al fotógrafo y olas.uy cobra **15%** de comisión automática.
- Búsqueda de fotos en v1: **playa + día + hora** (sin reconocimiento facial).
- Stack: Supabase (base de datos + login con Google) + Cloudflare R2 (fotos, `fotos.olas.uy`) + Mercado Pago. Originales privados con link de descarga que vence.
- SEO: cada playa, día, fotógrafo y sesión con su propia URL (`/pronostico/la-pedrera`, `/fotos/la-pedrera/2026-11-09/usuario`, `/fotografos/nombre`), títulos, datos estructurados y sitemap.

## Cómo probar

Abrir `index.html` en el navegador (o el link de github.io). Para el mapa no hace falta internet: la geometría está embebida en el archivo.

## Pendientes / ideas

- Verificar `facing` y posiciones de las playas con conocimiento local.
