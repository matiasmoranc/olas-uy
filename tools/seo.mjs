// Páginas para Google: /pronostico/, una por zona (Montevideo, Canelones, Maldonado, Rocha), una por playa,
// /fotos/, sitemap.xml y robots.txt. HTML estático con el pronóstico del día ya escrito (Google lee el texto
// sin ejecutar nada) y links a la app (olas.uy/#olas=Playa).
// Usa los mismos datos y cálculos que index.html (playas, punto en el mar, orientación, altura en la playa, puntaje).
// Lo corre el workflow "Páginas para Google" todos los días. Local: node tools/seo.mjs [--mock]
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://olas.uy";
const MOCK = process.argv.includes("--mock");
const TZ = "America/Montevideo";

// ---------- Código compartido con index.html ----------
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
function grab(token) {
  const i = html.indexOf(token);
  if (i < 0) throw new Error("No encontré en index.html: " + token);
  const re = /\n(?=\S)/g; re.lastIndex = i; const m = re.exec(html);
  return html.slice(i, m ? m.index : undefined);
}
const code = ["const BEACHES=", "const SPOT=", "const MAPPOS=", "const slug=", "const angDiff=", "const expo=", "function effH(", "function windK(", "function score(", "function mkHour(", "const HM=", "const WK="]
  .map(grab).join("\n") + "\n;({BEACHES,SPOT,MAPPOS,slug,effH,windK,mkHour,HM,HW,WK})";
const { BEACHES, SPOT, MAPPOS, slug, effH, windK, mkHour, HM, HW, WK } = vm.runInNewContext(code, {});

// ---------- Zonas (departamentos) ----------
const ZONES = [
  { id: "montevideo", name: "Montevideo", title: "Montevideo y alrededores", beaches: ["Pocitos", "Kiyú", "Solymar", "El Pinar"],
    intro: "Las playas del Río de la Plata: Pocitos en Montevideo, Kiyú en San José y la Ciudad de la Costa. Necesitan un buen mar de fondo del sur o viento sur fuerte para que entren olas." },
  { id: "canelones", name: "Canelones", title: "Canelones", beaches: ["Solymar", "El Pinar", "Bello Horizonte", "Cuchilla Alta"],
    intro: "La Costa de Oro, del Río de la Plata a la entrada del océano. Las olas llegan con mar de fondo del sur y sureste; con viento norte (terral) quedan más ordenadas." },
  { id: "maldonado", name: "Maldonado", title: "Maldonado y Punta del Este", beaches: ["Punta Negra", "Piriápolis", "El Emir", "Playa Brava", "Montoya", "José Ignacio"],
    intro: "De Piriápolis a José Ignacio, pasando por la Brava y La Barra. Del lado del océano entra más mar; Piriápolis y Punta Negra quedan más protegidas." },
  { id: "rocha", name: "Rocha", title: "Rocha", beaches: ["La Balconada", "Los Botes", "La Aguada", "La Pedrera", "Punta Rubia", "Cabo Polonio", "Barra de Valizas", "Punta del Diablo", "Santa Teresa"],
    intro: "La costa oceánica: La Paloma, La Pedrera, Cabo Polonio, Valizas y Punta del Diablo. Es donde más olas entran en Uruguay, con playas que miran para lados distintos." },
];
const DEPTO = { "Kiyú": "San José", "Pocitos": "Montevideo", "Solymar": "Canelones", "El Pinar": "Canelones", "Bello Horizonte": "Canelones", "Cuchilla Alta": "Canelones",
  "Punta Negra": "Maldonado", "Piriápolis": "Maldonado", "El Emir": "Maldonado", "Playa Brava": "Maldonado", "Montoya": "Maldonado", "José Ignacio": "Maldonado" };
const deptoOf = (b) => DEPTO[b] || "Rocha";
const zoneOf = (b) => ZONES.find((z) => z.id === slug(deptoOf(b))) || ZONES.find((z) => z.beaches.includes(b));
for (const b of BEACHES) if (!zoneOf(b)) throw new Error("Playa sin zona: " + b);

// ---------- Textos ----------
const PUNTOS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];
const rumbo = (deg) => PUNTOS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const GR = ["Plano", "Malo", "Regular", "Bueno", "Muy bueno", "Peligroso"];
const GC = ["#9fb3bd", "#f59e5b", "#f2c94c", "#3ccf8e", "#8b7cf6", "#ef4444"];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const m1 = (n) => (Math.round(n * 10) / 10).toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// ---------- Pronóstico (Open-Meteo, igual que el sitio) ----------
async function getJSON(u) {
  for (let k = 0; ; k++) {
    try { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return await r.json(); }
    catch (e) { if (k >= 3) throw e; await new Promise((ok) => setTimeout(ok, 2000 * (k + 1))); }
  }
}
async function loadForecast() {
  if (MOCK) return mockForecast();
  const lat = BEACHES.map((b) => SPOT[b][0]).join(","), lon = BEACHES.map((b) => SPOT[b][1]).join(",");
  const q = `latitude=${lat}&longitude=${lon}&timezone=America%2FMontevideo&forecast_days=7`;
  const [m, w] = await Promise.all([
    getJSON(`https://marine-api.open-meteo.com/v1/marine?${q}&hourly=${HM}`),
    getJSON(`https://api.open-meteo.com/v1/forecast?${q}&hourly=${HW}`),
  ]);
  const M = Array.isArray(m) ? m : [m], W = Array.isArray(w) ? w : [w], times = M[0].hourly.time;
  return { times, b: BEACHES.map((b, k) => times.map((t, i) => {
    const mh = M[k].hourly, wh = W[k].hourly, j = wh.time.indexOf(t);
    return [mh.wave_height[i], mh.wave_direction[i], mh.wave_period[i], mh.swell_wave_height[i], mh.swell_wave_direction[i], mh.wind_wave_height[i],
      mh.wind_wave_direction ? mh.wind_wave_direction[i] : null, j >= 0 ? wh.wind_speed_10m[j] : null, j >= 0 ? wh.wind_direction_10m[j] : null,
      j >= 0 ? wh.precipitation?.[j] : null, j >= 0 ? wh.precipitation_probability?.[j] : null, j >= 0 ? wh.cloud_cover?.[j] : null];
  })) };
}
function mockForecast() { // solo para probar el diseño sin internet
  const d0 = todayUY(), times = [];
  for (let i = 0; i < 168; i++) { const d = new Date(Date.UTC(d0.y, d0.m - 1, d0.d) + i * 3600e3); times.push(d.toISOString().slice(0, 13) + ":00"); }
  return { times, b: BEACHES.map((b, k) => times.map((_, i) => {
    const h = Math.max(.1, (k > 11 ? 1.4 : k > 7 ? 1 : .5) * (1 + .5 * Math.sin(i / 14 + k)));
    return [h, 150, 8 + 3 * Math.sin(i / 20 + k), h * .8, 150, h * .4, 170, 6 + 14 * Math.abs(Math.sin(i / 9 + k)), (i * 7 + k * 40) % 360, 0, 10, 40];
  })) };
}
function todayUY() {
  const p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, iso: `${p.year}-${p.month}-${p.day}` };
}
// Por playa: 7 días con la mejor hora de luz (6 a 20 h) de cada uno
function summarize(D) {
  const T = todayUY(), s0 = D.times.indexOf(`${T.iso}T00:00`);
  if (s0 < 0) throw new Error("El pronóstico no empieza hoy");
  const nd = Math.min(7, Math.floor((D.times.length - s0) / 24));
  const out = {};
  BEACHES.forEach((b, k) => {
    const f = SPOT[b][2];
    const hours = Array.from({ length: nd * 24 }, (_, i) => {
      const x = D.b[k][s0 + i] || [], h = effH(f, x), ws = x[7], wd = x[8];
      return { ...mkHour(i % 24, h, x[2], ws, wd, windK(f, wd, ws), [x[9], x[10], x[11]]), raw: x };
    });
    const days = Array.from({ length: nd }, (_, d) => {
      const from = d === 0 ? Math.max(6, Math.min(T.h, 20)) : 6;
      const day = hours.slice(d * 24 + from, d * 24 + 21);
      const best = day.reduce((a, x) => (x.sc > a.sc ? x : a), day[0] || hours[d * 24 + 12]);
      const date = new Date(Date.UTC(T.y, T.m - 1, T.d + d));
      return { d, date, best, maxH: Math.max(...day.map((x) => x.h)), minH: Math.min(...day.map((x) => x.h)) };
    });
    out[b] = { hours, days, now: hours[Math.min(T.h, hours.length - 1)] };
  });
  return { T, nd, beaches: out };
}

// ---------- HTML ----------
const dayName = (date, d) => d === 0 ? "Hoy" : d === 1 ? "Mañana" : DIAS[date.getUTCDay()][0].toUpperCase() + DIAS[date.getUTCDay()].slice(1, 3) + " " + date.getUTCDate();
const longDate = (date) => `${DIAS[date.getUTCDay()]} ${date.getUTCDate()} de ${MESES[date.getUTCMonth()]}`;
const gradePill = (g) => `<span class="g" style="--c:${GC[g]}">${GR[g]}</span>`;
const windTxt = (x) => x.ws < 8 ? "calmo" : `${x.ws} km/h ${WK[x.wk].t.toLowerCase()}`;
const fmtH = (h) => `${m1(h)} m`;
const appBeach = (b) => `${SITE}/#olas=${encodeURIComponent(b)}`;
const appFotos = (b) => `${SITE}/#fotos=${encodeURIComponent(b)}`;
const LOGO = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M2 20c4 0 5-9 12-9 5 0 6 4 3 5-2 .8-4-1-3-2.5" stroke="#13a8c2" stroke-width="2.8" stroke-linecap="round"/><path d="M2 26c3 0 4-2 7-2s4 2 7 2 4-2 7-2 4 2 7 2" stroke="#ff6f4f" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const CSS = `:root{--foam:#f7fbfc;--white:#fff;--sand:#f5ede0;--mist:#e6f4f7;--line:#dcebef;--ink:#0c2a38;--mut:#5f7c89;--aqua:#13a8c2;--aqua-d:#0b7f95;--coral:#ff6f4f;--display:"Bricolage Grotesque","Outfit",system-ui,sans-serif;--body:"Outfit",system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--foam);color:var(--ink);font:400 17px/1.55 var(--body);-webkit-font-smoothing:antialiased}
a{color:var(--aqua-d)}.wrap{max-width:960px;margin:0 auto;padding:0 16px}
header{background:rgba(247,251,252,.9);border-bottom:1px solid var(--line)}header .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:12px}
.logo{display:flex;align-items:center;gap:8px;font:800 23px/1 var(--display);letter-spacing:-.03em;color:var(--ink);text-decoration:none}.logo svg{width:32px;height:32px}
nav.top{display:flex;gap:6px;flex-wrap:wrap}nav.top a{font-weight:600;font-size:15px;text-decoration:none;color:var(--ink);padding:8px 12px;border-radius:999px}nav.top a:hover,nav.top a[aria-current]{background:var(--mist)}
.crumbs{font-size:14px;color:var(--mut);margin:18px 0 6px}.crumbs a{color:var(--mut)}
h1{font:800 clamp(30px,6vw,46px)/1.05 var(--display);letter-spacing:-.03em;margin:6px 0 8px}h2{font:800 clamp(22px,4vw,28px)/1.15 var(--display);letter-spacing:-.02em;margin:34px 0 12px}h3{font:700 19px/1.2 var(--display);margin:0 0 6px}
.lead{color:var(--mut);margin:0 0 18px;max-width:680px}.mut{color:var(--mut)}
.card{background:var(--white);border:1px solid var(--line);border-radius:22px;padding:18px}
.now{display:flex;flex-wrap:wrap;gap:18px 28px;align-items:center}.big{font:800 54px/1 var(--display);letter-spacing:-.03em}.big small{font-size:24px}
.facts{display:flex;flex-wrap:wrap;gap:8px}.facts span{background:var(--mist);border-radius:999px;padding:6px 12px;font-size:15px;font-weight:600}
.g{display:inline-block;background:var(--c);color:#fff;font-weight:700;font-size:14px;border-radius:999px;padding:3px 10px;white-space:nowrap}
.g[style*="f2c94c"]{color:var(--ink)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:15px}th{font-size:13px;color:var(--mut);font-weight:600;text-align:left;padding:0 8px 8px 0}td{padding:10px 8px 10px 0;border-top:1px solid var(--line);vertical-align:middle}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}td{white-space:nowrap}
@media (max-width:560px){nav.top a{padding:7px 9px;font-size:14px}nav.top .x{display:none}.logo{font-size:20px}.logo svg{width:28px;height:28px}h1{font-size:30px}table{font-size:14px}}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--ink);color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:13px 20px}.btn.c{background:var(--coral)}.btn.s{background:var(--mist);color:var(--ink)}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.bc{display:block;text-decoration:none;color:var(--ink);background:var(--white);border:1px solid var(--line);border-radius:18px;padding:14px 16px}.bc:hover{border-color:var(--aqua)}
.bc b{display:block;font:700 18px/1.2 var(--display)}.bc .row{margin-top:8px;gap:8px;font-size:15px}
.links{display:flex;flex-wrap:wrap;gap:8px}.links a{background:var(--white);border:1px solid var(--line);border-radius:999px;padding:7px 13px;text-decoration:none;color:var(--ink);font-size:15px}
.cta{background:var(--sand);border-radius:22px;padding:20px;margin-top:30px}
.sess{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}.sess a{display:block;text-decoration:none;color:var(--ink);background:var(--white);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.sess img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--mist)}.sess span{display:block;padding:10px 12px;font-size:15px}
footer{margin-top:48px;border-top:1px solid var(--line);padding:24px 0 40px;font-size:14px;color:var(--mut)}footer a{color:var(--mut)}footer .links a{font-size:14px}`;

function page({ url, title, description, h1, crumbs, body, ld = [], navCur }) {
  const bc = crumbs?.length ? { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: SITE + u })) } : null;
  const ldAll = [...ld, ...(bc ? [bc] : [])];
  return `<!doctype html>
<html lang="es-UY">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${url}">
<meta name="theme-color" content="#f7fbfc">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Olas UY">
<meta property="og:locale" content="es_UY">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${url}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Outfit:wght@400;600;700&display=swap">
<style>${CSS}</style>
${ldAll.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join("\n")}
</head>
<body>
<header><div class="wrap"><a class="logo" href="/">${LOGO}olas.uy</a>
<nav class="top" aria-label="Secciones"><a href="/pronostico/"${navCur === "olas" ? ' aria-current="page"' : ""}>Pronóstico</a><a href="/fotos/"${navCur === "fotos" ? ' aria-current="page"' : ""}>Fotos</a><a href="/#vender">Vender<span class="x"> fotos</span></a></nav></div></header>
<main class="wrap">
${crumbs?.length ? `<nav class="crumbs" aria-label="Estás en">${crumbs.map(([n, u], i) => i < crumbs.length - 1 ? `<a href="${u}">${esc(n)}</a>` : esc(n)).join(" › ")}</nav>` : ""}
<h1>${h1}</h1>
${body}
</main>
<footer><div class="wrap">
<p><b>Pronóstico de olas por zona:</b></p>
<div class="links">${ZONES.map((z) => `<a href="/pronostico/${z.id}/">Olas en ${esc(z.name)}</a>`).join("")}<a href="/pronostico/">Todo Uruguay</a><a href="/fotos/">Fotos de surf</a></div>
<p style="margin-top:18px"><b>Playas:</b></p>
<div class="links">${BEACHES.map((b) => `<a href="/pronostico/${slug(b)}/">${esc(b)}</a>`).join("")}</div>
<p style="margin-top:22px">Olas UY · La casa del surf uruguayo · Datos del pronóstico: <a href="https://open-meteo.com/" rel="noopener">Open-Meteo</a> · <a href="/privacidad.html">Privacidad</a></p>
</div></footer>
</body>
</html>
`;
}

// Tabla de 7 días de una playa
function weekTable(S) {
  return `<div class="scroll"><table><thead><tr><th>Día</th><th>Mejor hora</th><th>Ola</th><th>Período</th><th>Viento</th><th>Para surfear</th></tr></thead><tbody>${S.days.map((x) =>
    `<tr><td><b>${dayName(x.date, x.d)}</b></td><td>${x.best.clk}:00</td><td>${fmtH(x.best.h)}</td><td>${x.best.per} s</td><td>${windTxt(x.best)}</td><td>${gradePill(x.best.g)} <span class="mut">${m1(x.best.sc)}/10</span></td></tr>`).join("")}</tbody></table></div>`;
}
const beachCard = (b, S) => {
  const t = S.days[0];
  return `<a class="bc" href="/pronostico/${slug(b)}/"><b>${esc(b)}</b><span class="mut" style="font-size:14px">${esc(deptoOf(b))}</span>
  <span class="row">${gradePill(t.best.g)}<span>${fmtH(t.best.h)} · ${t.best.per} s</span></span>
  <span class="row mut" style="font-size:14px;margin-top:4px">Mejor hoy: ${t.best.clk}:00 · viento ${windTxt(t.best)}</span></a>`;
};
// Texto de cada playa: a dónde mira y qué condiciones le sirven (sale de los mismos datos que usa el puntaje)
function beachText(b) {
  const f = SPOT[b][2], z = zoneOf(b);
  return `${esc(b)} mira hacia el ${rumbo(f)}. Recibe mejor el mar que viene del ${rumbo(f)} y queda más ordenada con viento del ${rumbo(f + 180)} (terral, de la tierra hacia el mar). Con viento del ${rumbo(f)} (de mar) las olas se desarman. ${z.id === "rocha" ? "Está sobre el océano Atlántico." : z.id === "maldonado" ? "Está en la costa de Maldonado." : "Está sobre el Río de la Plata: necesita un mar de fondo grande para que lleguen olas."}`;
}

async function loadSessions() {
  if (MOCK) return [];
  try {
    const cfg = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
    const url = cfg.match(/supabaseUrl:\s*"([^"]+)"/)?.[1], key = cfg.match(/supabaseAnonKey:\s*"([^"]+)"/)?.[1], photos = cfg.match(/photosUrl:\s*"([^"]+)"/)?.[1];
    if (!url || !key) return [];
    const r = await fetch(`${url}/rest/v1/sessions?select=id,beach,day,start_time,end_time,photographer:photographers(name,slug),photos(thumb_key,ready)&published=eq.true&order=day.desc&limit=24`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return [];
    return (await r.json()).map((s) => ({ ...s, cover: (s.photos || []).find((p) => p.ready)?.thumb_key ? `${photos.replace(/\/$/, "")}/${s.photos.find((p) => p.ready).thumb_key}` : null, n: (s.photos || []).filter((p) => p.ready).length }));
  } catch { return []; }
}

// ---------- Armado ----------
const F = summarize(await loadForecast());
const sessions = await loadSessions();
const T = F.T, todayDate = new Date(Date.UTC(T.y, T.m - 1, T.d));
const upd = `Actualizado el ${longDate(todayDate)} a las ${String(T.h).padStart(2, "0")}:00 (hora de Uruguay)`;
const out = [];
const write = (rel, content) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); out.push(rel); };
const ORG = { "@context": "https://schema.org", "@type": "Organization", name: "Olas UY", url: SITE + "/", logo: SITE + "/favicon.svg" };

// Playas
for (const b of BEACHES) {
  const S = F.beaches[b], z = zoneOf(b), dep = deptoOf(b), t = S.days[0], bt = t.best;
  const best7 = S.days.reduce((a, x) => (x.best.sc > a.best.sc ? x : a), S.days[0]);
  const desc = `Pronóstico de olas en ${b}, ${dep}: altura, período, viento y la mejor hora para surfear hoy y los próximos 7 días. Hoy: ${fmtH(bt.h)} a las ${bt.clk}:00 (${GR[bt.g].toLowerCase()}).`;
  const near = z.beaches.filter((x) => x !== b);
  const body = `<p class="lead">${esc(dep)}, Uruguay · ${upd}</p>
<div class="card now"><div><div class="mut" style="font-weight:600">Mejor hora ${t.d === 0 ? "de hoy" : ""}: ${bt.clk}:00</div><div class="big">${m1(bt.h)}<small> m</small></div></div>
<div><div style="margin-bottom:8px">${gradePill(bt.g)} <b>${m1(bt.sc)}/10</b></div><div class="facts"><span>⏱ ${bt.per} s de período</span><span>💨 Viento ${windTxt(bt)}</span><span>🌊 Entre ${m1(t.minH)} y ${m1(t.maxH)} m en el día</span></div></div></div>
<div class="row" style="margin-top:14px"><a class="btn" href="${appBeach(b)}">Ver hora por hora y la simulación</a><a class="btn s" href="${appFotos(b)}">📷 Fotos de surf en ${esc(b)}</a></div>
<h2>Pronóstico de olas en ${esc(b)} para 7 días</h2>
${weekTable(S)}
<p class="mut" style="font-size:15px">El mejor día de la semana pinta ${best7.d === 0 ? "<b>hoy</b>" : best7.d === 1 ? "<b>mañana</b>" : "el <b>" + DIAS[best7.date.getUTCDay()] + " " + best7.date.getUTCDate() + "</b>"}: ${fmtH(best7.best.h)} a las ${best7.best.clk}:00, ${GR[best7.best.g].toLowerCase()}.</p>
<h2>Cómo es ${esc(b)} para surfear</h2>
<p>${beachText(b)}</p>
<p class="mut" style="font-size:15px">La altura es la que llega a la orilla de ${esc(b)}: se calcula con el mar de fondo y el mar de viento de Open-Meteo según de dónde viene cada uno. El puntaje (0 a 10) combina tamaño, período y viento.</p>
<div class="cta"><h3>¿Surfeaste en ${esc(b)}?</h3><p style="margin:0 0 12px">Buscá las fotos que te sacaron desde el agua o la orilla: elegís la playa, el día y la hora.</p><a class="btn c" href="${appFotos(b)}">Buscar mis fotos</a></div>
<h2>Otras playas de ${esc(z.title)}</h2>
<div class="grid">${near.map((x) => beachCard(x, F.beaches[x])).join("")}</div>
<p style="margin-top:14px"><a href="/pronostico/${z.id}/">Pronóstico de olas en ${esc(z.name)} →</a></p>`;
  write(`pronostico/${slug(b)}/index.html`, page({
    url: `/pronostico/${slug(b)}/`, navCur: "olas",
    title: `Pronóstico de olas en ${b} (${dep}) · Surf hoy y 7 días | Olas UY`, description: desc,
    h1: `Pronóstico de olas en ${esc(b)}`,
    crumbs: [["Olas UY", "/"], ["Pronóstico de olas", "/pronostico/"], [z.name, `/pronostico/${z.id}/`], [b, `/pronostico/${slug(b)}/`]],
    body,
    ld: [{ "@context": "https://schema.org", "@type": "Beach", name: b, url: `${SITE}/pronostico/${slug(b)}/`,
      address: { "@type": "PostalAddress", addressRegion: dep, addressCountry: "UY" },
      geo: { "@type": "GeoCoordinates", latitude: MAPPOS[b][0], longitude: MAPPOS[b][1] } }],
  }));
}

// Zonas
for (const z of ZONES) {
  const list = z.beaches.map((b) => [b, F.beaches[b]]).sort((a, c) => c[1].days[0].best.sc - a[1].days[0].best.sc);
  const [tb, tS] = list[0];
  const body = `<p class="lead">${esc(z.intro)}</p>
<p class="mut" style="font-size:15px">${upd}. Hoy la mejor es <b>${esc(tb)}</b>: ${fmtH(tS.days[0].best.h)} a las ${tS.days[0].best.clk}:00 (${GR[tS.days[0].best.g].toLowerCase()}).</p>
<div class="grid">${list.map(([b, S]) => beachCard(b, S)).join("")}</div>
<h2>Los próximos 7 días en ${esc(z.title)}</h2>
<div class="scroll"><table><thead><tr><th>Playa</th>${F.beaches[z.beaches[0]].days.map((x) => `<th>${dayName(x.date, x.d)}</th>`).join("")}</tr></thead><tbody>${list.map(([b, S]) =>
    `<tr><td><a href="/pronostico/${slug(b)}/"><b>${esc(b)}</b></a></td>${S.days.map((x) => `<td>${gradePill(x.best.g)}<br><span class="mut" style="font-size:14px">${fmtH(x.best.h)}</span></td>`).join("")}</tr>`).join("")}</tbody></table></div>
<div class="row" style="margin-top:18px"><a class="btn" href="${SITE}/#olas">Ver el mapa con todas las playas</a><a class="btn s" href="/fotos/">📷 Fotos de surf</a></div>
<h2>Otras zonas</h2>
<div class="links">${ZONES.filter((x) => x !== z).map((x) => `<a href="/pronostico/${x.id}/">Olas en ${esc(x.name)}</a>`).join("")}</div>`;
  write(`pronostico/${z.id}/index.html`, page({
    url: `/pronostico/${z.id}/`, navCur: "olas",
    title: `Olas en ${z.name}: pronóstico de surf hoy y 7 días | Olas UY`,
    description: `Pronóstico de olas en ${z.title}: ${z.beaches.join(", ")}. Altura, período, viento y la mejor hora para surfear, actualizado todos los días.`,
    h1: `Pronóstico de olas en ${esc(z.title)}`,
    crumbs: [["Olas UY", "/"], ["Pronóstico de olas", "/pronostico/"], [z.name, `/pronostico/${z.id}/`]],
    body,
    ld: [{ "@context": "https://schema.org", "@type": "ItemList", name: `Playas para surfear en ${z.title}`,
      itemListElement: z.beaches.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b, url: `${SITE}/pronostico/${slug(b)}/` })) }],
  }));
}

// Uruguay
{
  const all = BEACHES.map((b) => [b, F.beaches[b]]).sort((a, c) => c[1].days[0].best.sc - a[1].days[0].best.sc);
  const body = `<p class="lead">Pronóstico de olas para surfear en las 21 playas de la costa uruguaya, de Montevideo a Rocha: altura en la orilla, período, viento y la mejor hora de cada día. ${upd}.</p>
<div class="row" style="margin-bottom:8px"><a class="btn" href="${SITE}/#olas">Abrir el mapa del pronóstico</a></div>
<h2>Dónde hay olas hoy</h2>
<div class="grid">${all.slice(0, 6).map(([b, S]) => beachCard(b, S)).join("")}</div>
${ZONES.map((z) => `<h2><a href="/pronostico/${z.id}/" style="color:inherit;text-decoration:none">Olas en ${esc(z.title)} →</a></h2><p class="mut" style="margin-top:-4px">${esc(z.intro)}</p>
<div class="grid">${z.beaches.map((b) => beachCard(b, F.beaches[b])).join("")}</div>`).join("")}
<h2>Cómo leer el pronóstico</h2>
<p><b>Ola:</b> la altura que llega a la orilla de cada playa, no la del mar abierto. <b>Período:</b> los segundos entre ola y ola; con más de 10 s suelen venir más ordenadas y con más fuerza. <b>Viento:</b> el <i>terral</i> (de la tierra hacia el mar) las ordena; el <i>de mar</i> las desarma. <b>Para surfear:</b> plano, malo, regular, bueno, muy bueno o peligroso (olas de 3 m o más, o viento de 50 km/h o más).</p>
<div class="cta"><h3>Fotos de surf en Uruguay</h3><p style="margin:0 0 12px">Fotógrafos de todo el país suben las fotos de cada sesión. Encontrá las tuyas por playa, día y hora.</p><a class="btn c" href="/fotos/">Ver fotos de surf</a></div>`;
  write("pronostico/index.html", page({
    url: "/pronostico/", navCur: "olas",
    title: "Pronóstico de olas en Uruguay · Surf hoy y 7 días | Olas UY",
    description: "Pronóstico de olas en Uruguay para surfear: Montevideo, Canelones, Maldonado (Punta del Este) y Rocha. Altura, período, viento y la mejor hora, playa por playa.",
    h1: "Pronóstico de olas en Uruguay", crumbs: [["Olas UY", "/"], ["Pronóstico de olas", "/pronostico/"]], body, ld: [ORG],
  }));
}

// Fotos
{
  const sessH = sessions.length ? `<h2>Últimas sesiones</h2><div class="sess">${sessions.map((s) => `<a href="${SITE}/#sesion=${s.id}">${s.cover ? `<img src="${esc(s.cover)}" alt="Fotos de surf en ${esc(s.beach)}" loading="lazy">` : ""}<span><b>${esc(s.beach)}</b><br><span class="mut">${esc(s.day)} · ${s.n} fotos${s.photographer?.name ? " · " + esc(s.photographer.name) : ""}</span></span></a>`).join("")}</div>` : "";
  const body = `<p class="lead">Fotógrafos de surf de todo Uruguay suben las fotos de cada sesión. Elegís la playa, el día y la hora, te encontrás y te llevás la foto original en alta.</p>
<div class="row"><a class="btn c" href="${SITE}/#fotos">Buscar mis fotos</a><a class="btn s" href="${SITE}/#vender">Soy fotógrafo: vender fotos</a></div>
${sessH}
<h2>Fotos de surf por playa</h2>
${ZONES.map((z) => `<h3 style="margin-top:20px">${esc(z.title)}</h3><div class="links">${z.beaches.map((b) => `<a href="${appFotos(b)}">Fotos de surf en ${esc(b)}</a>`).join("")}</div>`).join("")}
<h2>Cómo funciona</h2>
<p><b>1. Buscá:</b> playa, día y hora en que surfeaste. <b>2. Encontrate:</b> mirá las previas de esa sesión. <b>3. Llevátela:</b> pagás con Mercado Pago y descargás la original, sin marca de agua. Si elegís varias, los packs salen más baratos.</p>
<h2>¿Sacás fotos de surf?</h2>
<p>Subí tus sesiones, poné tu precio y cobrá directo en tu cuenta de Mercado Pago. Olas UY se queda con el 15% solo cuando vendés.</p>
<div class="cta"><h3>Pronóstico de olas</h3><p style="margin:0 0 12px">Antes de ir, mirá cómo va a estar el mar en tu playa.</p><a class="btn" href="/pronostico/">Ver el pronóstico</a></div>`;
  write("fotos/index.html", page({
    url: "/fotos/", navCur: "fotos",
    title: "Fotos de surf en Uruguay · Encontrá tus fotos | Olas UY",
    description: "Fotos de surf en Uruguay: encontrá las fotos que te sacaron surfeando en La Pedrera, Punta del Diablo, La Paloma, Punta del Este y más. Buscá por playa, día y hora.",
    h1: "Fotos de surf en Uruguay", crumbs: [["Olas UY", "/"], ["Fotos de surf", "/fotos/"]], body, ld: [ORG],
  }));
}

// sitemap + robots
const urls = ["", "pronostico/", ...ZONES.map((z) => `pronostico/${z.id}/`), ...BEACHES.map((b) => `pronostico/${slug(b)}/`), "fotos/", "privacidad.html"];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}/${u}</loc><lastmod>${T.iso}</lastmod><changefreq>${u === "privacidad.html" ? "yearly" : "daily"}</changefreq><priority>${u === "" ? "1.0" : u.split("/").length <= 2 ? "0.9" : "0.8"}</priority></url>`).join("\n")}
</urlset>
`);
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /maqueta/\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Listo: ${out.length} archivos (${MOCK ? "datos de prueba" : "pronóstico real"}${sessions.length ? `, ${sessions.length} sesiones` : ""}).`);
