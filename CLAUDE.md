# Olas UY

Herramienta web de pronóstico de olas para playas de Uruguay, pensada para surfistas expertos y para usuarios comunes. Interfaz en español rioplatense (voseo: "tocá", "deslizá").

Publicada con GitHub Pages: https://matiasmoranc.github.io/olas-uy/ (rama `main`, carpeta raíz). Cada push a `main` se publica solo en 1–2 minutos.

## Estructura

Todo está en un solo archivo, `index.html` (HTML + CSS + JS, sin build ni dependencias locales):

- **BEACHES**: lista de playas. `lat/lon` = punto en el mar para pedir el pronóstico (un poco mar adentro para que el modelo marino tenga datos); `mlat/mlon` = posición del marcador en el mapa; `facing` = hacia dónde mira la playa en grados (se usa para saber si el viento es terral, cruzado o de mar).
- **Datos en vivo**: Open-Meteo Marine API (altura, período, dirección de ola, mar de fondo, mar de viento, temperatura del agua) y Open-Meteo Forecast API (viento y ráfagas). Una sola llamada para todas las playas (coordenadas separadas por coma). Si falla, carga datos de EJEMPLO con un aviso amarillo.
- **evaluate()**: puntaje 0–10 y calificación (Plano, Malo, Regular, Bueno, Muy bueno, Peligroso) + indicador de baño.
- **waveType()**: tipo de ola que define la animación: plano, espuma, formada, tubo, picado, bomba.
- **drawHero()**: animación lateral en canvas de una ola con una persona de 1,70 m para escala. Debe ser simple y fluida (el usuario pidió explícitamente que se entienda fácil).
- **drawSim() / openSim()**: simulación de playa a pantalla completa en perspectiva; las olas llegan cada `período` segundos, en series, con contador y velocidad x1/x2/x4.
- **Mapa**: Leaflet (cdnjs) con imágenes satelitales de Esri (CARTO dejó de funcionar sin clave). Marcadores de color con la altura de ola; con zoom < 10 se muestran como puntos chicos sin número (evita que se encimen) y al tocar uno el mapa se acerca.
- Modo **Simple / Experto** (clase `expert` en `body`, elementos `.expert-only`).

## Cómo probar

Abrir `index.html` en el navegador. Para ver datos reales hace falta internet (Open-Meteo permite llamadas desde el navegador, sin clave).

## Pendientes / ideas

- Verificar coordenadas de Solymar, El Pinar, Bello Horizonte y Cuchilla Alta (se cargaron aproximadas).
- Ajustar `facing` de cada playa con conocimiento local.
