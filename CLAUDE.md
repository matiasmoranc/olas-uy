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
- Arranque (`boot()`): muestra al instante el último pronóstico guardado (`localStorage` `olasuy-fc`) y actualiza en segundo plano; reintenta 3 veces. Sin conexión usa lo guardado ("Sin conexión · datos de las HH:MM"); si nunca cargó, datos de ejemplo (`sampleFC()`), avisado. Se actualiza solo cada 30 min, al volver a la pestaña y al recuperar internet. La fuente y la hora se ven al lado de la leyenda.
- **Fotos, fotógrafos y ventas: todavía de EJEMPLO** (marcado con una etiqueta "Ejemplo"); las fotos se dibujan con canvas en `photo()`. Falta el servidor (ver Pendientes).

Ruteo por hash (`#inicio`, `#olas`, `#fotos`, `#sesion`, `#fotografo`, `#vender`); objeto `V` con una función por pantalla que devuelve `{url, title, sec, html, after}`. `url` es la dirección "para Google" que tendría cada pantalla en la versión real.

- **Diseño**: tema claro único ("espuma y arena"), tokens en `:root`; fuentes Bricolage Grotesque (títulos) + Outfit. Navegación con dock flotante abajo (Olas · Mis fotos · Vender). Transiciones con View Transitions; respeta `prefers-reduced-motion`.
- **Inicio**: portada con olas animadas en canvas (`sea()`), mejor playa ahora, carrusel "Ahora" y "Recién subidas".
- **Olas (`#olas`)**:
  - Arriba, mapa SVG con zoom (rueda, pellizco, arrastre, +/−/⤢). Costa, lagunas y fronteras reales de GSHHG alta resolución (1:250.000, del paquete PyPI `basemap-data-hires`), simplificadas a ~20 m y proyectadas con `PJ(lat,lon)`. El tinte gris de Argentina y Brasil sale de geo-maps / Natural Earth.
  - `MAPPOS`: posición de cada playa, ajustada a la orilla real.
  - Al tocar una playa: si está lejos o encimada, `tapMk()` acerca el mapa; si no, abre una hoja (`openBeach`) con el pronóstico de ahora y de los 7 días.
  - Debajo del mapa: selector de día (7 días), barra de hora y "Tus playas": ♥ favoritas (`olasuy-maq-favs`) y "las que más mirás" (contador `olasuy-maq-views`, aparecen con 2 o más vistas). Más abajo, "Todas", ordenadas por puntaje.
  - Tarjeta (`waveCard`): altura arriba a la derecha, "⭐ puntaje/10", período, viento (flecha verde terral / gris cruzado / roja de mar + km/h) y barritas de 24 h. Tocar o arrastrar las barritas, o tocar un día dentro de la tarjeta, cambia **solo esa playa** (`S.sel[playa]=[día,hora]`, `paintBeach()`) y aparece un botón "🕐 día · hora ✕" para volver a la hora general. La barra de hora y los días de arriba cambian todas las playas (y borran las horas propias). Al abrirla: mejor puntaje de cada uno de los 7 días y mejor hora del día.
  - `score()` replica el `evaluate()` real (tamaño × período ± viento).
  - Botón **▶ Simulación** en cada tarjeta (`openSim()`): pantalla completa con la ola animada de costado (`drawWave()`, en canvas) junto a una persona de 1,70 m para escala, a la hora y día de esa tarjeta. `waveType()` define la forma: plano, espuma, formada, tubo, picado o bomba (según altura, período y viento). Adentro hay días y barra de hora; cambiarlos actualiza también esa tarjeta (`S.sel`). Con `prefers-reduced-motion` se dibuja quieta.
- **Fotos (`#fotos`, `#sesion`)**: "¿Dónde surfeaste?" (playas en círculos) + "¿Cuándo?" (días). En la sesión, barra de hora para encontrarse. Visor a pantalla completa con marca de agua y "Llevala en alta". La compra es una hoja que pide solo mail + Mercado Pago.
- **Fotógrafo (`#fotografo`)**: perfil público con portada, avatar, números y sesiones.
- **Vender (`#vender`)**: asistente en 3 pasos (subir fotos con vista previa de la marca de agua → dónde y cuándo → precio con +/− y "te quedan $X") y conexión con Mercado Pago.

## Decisiones de producto

- Pagos: **Mercado Pago dividido** (marketplace). El pago va directo al fotógrafo y olas.uy cobra **15%** de comisión automática.
- Búsqueda de fotos en v1: **playa + día + hora** (sin reconocimiento facial).
- Stack previsto para la versión real: Cloudflare (Workers/Pages, R2 para fotos, D1 base de datos), que el usuario ya usa. Fotógrafos con login por mail (código, sin contraseña). Originales privados con link de descarga que vence.
- SEO: cada playa, día, fotógrafo y sesión con su propia URL (`/pronostico/la-pedrera`, `/fotos/la-pedrera/2026-11-09/usuario`, `/fotografos/nombre`), títulos, datos estructurados y sitemap.

## Cómo probar

Abrir `index.html` en el navegador (o el link de github.io). Para el mapa no hace falta internet: la geometría está embebida en el archivo.

## Pendientes / ideas

- Versión real de fotos: servidor, cuentas de fotógrafos, subida a R2 con marca de agua, pagos con Mercado Pago.
- Verificar `facing` y posiciones de las playas con conocimiento local.
