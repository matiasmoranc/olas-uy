# Olas UY

Herramienta web de pronóstico de olas para playas de Uruguay, pensada para surfistas expertos y para usuarios comunes. Interfaz en español rioplatense (voseo: "tocá", "deslizá").

Publicada con GitHub Pages en https://matiasmoranc.github.io/olas-uy/ (rama `main`, carpeta raíz). Cada push a `main` se publica solo en 1–2 minutos.

**Dominio olas.uy**: registrado en Hosting Montevideo, DNS en Cloudflare apuntando a GitHub Pages (A de `@` a 185.199.108–111.153, CNAME `www` → `matiasmoranc.github.io`). Por decisión del usuario, **por ahora olas.uy queda sin contenido**: no hay archivo `CNAME` en el repo. Para activarlo, volver a agregar `CNAME` con `olas.uy` y configurar el dominio en Settings → Pages.

**Maqueta del sitio nuevo** ("la casa del surf uruguayo": pronóstico + venta de fotos de surf + panel de fotógrafos) en `maqueta/index.html` → https://matiasmoranc.github.io/olas-uy/maqueta/. Es un diseño navegable con datos de ejemplo (noindex), no la versión real. Decisiones tomadas: diseño claro y con poco texto; pagos con Mercado Pago dividido (el pago va directo al fotógrafo), comisión 15%; búsqueda de fotos por playa, día y hora; mapa con costa real (GSHHG alta resolución), favoritas y más vistas.

## Estructura

Todo está en un solo archivo, `index.html` (HTML + CSS + JS, sin build ni dependencias locales):

- **BEACHES**: lista de playas, de oeste a este. `lat/lon` = punto en el mar para pedir el pronóstico (un poco mar adentro para que el modelo marino tenga datos); `mlat/mlon` = posición del marcador en el mapa; `facing` = hacia dónde mira la playa en grados (se usa para saber si el viento es terral, cruzado o de mar).
- **Datos en vivo**: Open-Meteo Marine API (altura, período, dirección de ola, mar de fondo, mar de viento, temperatura del agua) y Open-Meteo Forecast API (viento y ráfagas). Una sola llamada para todas las playas (coordenadas separadas por coma), 8 días; se muestran 7 desde la hora actual. Amanecer/atardecer de la API (`daily=sunrise,sunset`), con cálculo propio (`solar()`) si no hay. Reintenta 3 veces; si falla usa el último pronóstico guardado en `localStorage` (`olasuy-cache`, aviso azul) y, si no hay, datos de EJEMPLO (aviso amarillo). Se actualiza solo cada 30 min, al volver a la pestaña y al recuperar internet (`tick()`).
- **Horario**: todo se calcula en hora de Uruguay (`nowUY()`), no en la del dispositivo.
- **Próximos días** (`renderDays()`): mejor ventana de 3 h con luz por día. "Mejor playa" y la tabla ignoran las horas de noche.
- **Favoritas**: estrella en el panel, guardadas en `olasuy-favs`, aparecen primero en la lista.
- **Accesibilidad**: los colores de Bueno (verde) y Muy bueno (violeta) se distinguen; `aria-label` en marcadores, chips y canvas; con `prefers-reduced-motion` la ola se dibuja quieta.
- **effHeight() / expo()**: altura de ola *en la playa* (`he`): el mar de fondo y el mar de viento se reducen según el ángulo entre su dirección y `facing`. Todo lo que muestra tamaño de ola usa `he`; `h` (mar adentro) solo se ve en modo Experto.
- **evaluate()**: puntaje 0–10 y calificación (Plano, Malo, Regular, Bueno, Muy bueno, Peligroso) + indicador de baño.
- **waveType()**: tipo de ola que define la animación: plano, espuma, formada, tubo, picado, bomba.
- **drawHero()**: animación lateral en canvas de una ola con una persona de 1,70 m para escala. Debe ser simple y fluida (el usuario pidió explícitamente que se entienda fácil).
- **drawSim() / openSim()**: simulación de playa a pantalla completa en perspectiva; las olas llegan cada `período` segundos, en series, con contador y velocidad x1/x2/x4.
- **Mapa**: Leaflet (cdnjs) con imágenes satelitales de Esri (CARTO dejó de funcionar sin clave). Marcadores de color con la altura de ola; con zoom < 10 se muestran como puntos chicos sin número (evita que se encimen) y al tocar uno el mapa se acerca.
- Modo **Simple / Experto** (clase `expert` en `body`, elementos `.expert-only`).

## Cómo probar

Abrir `index.html` en el navegador. Para ver datos reales hace falta internet (Open-Meteo permite llamadas desde el navegador, sin clave).

## Pendientes / ideas

- Verificar coordenadas de Solymar, El Pinar, Bello Horizonte, Cuchilla Alta, Kiyú, Punta Negra, El Emir, La Balconada, Los Botes, Punta Rubia y Barra de Valizas (se cargaron aproximadas).
- Ajustar `facing` de cada playa con conocimiento local.
