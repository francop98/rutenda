/* =========================================================
   Ideas de qué hacer en un destino.
   Mezcla fuentes y las resume con IA en una lista corta:
   - Wikivoyage (secciones "Ver" y "Hacer"; libre, sin clave)
   - OpenStreetMap (atractivos reales cercanos; gratis, sin clave)
   - OpenTripMap (opcional, solo si hay OPENTRIPMAP_KEY)
   - IA (Groq) que ordena, resume y marca qué conviene reservar
   Se guarda por destino y mes para no volver a consultar.
   Variables: GROQ_API_KEY, opcional GROQ_MODEL y OPENTRIPMAP_KEY.
   ========================================================= */
const { usuario, db, admin } = require('./_lib/firebase');
const { limpiarJSON } = require('./escanear-reserva');

const MODELO = process.env.GROQ_MODEL_TEXTO || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const LIMITE_DIARIO = 30;
const VIGENCIA_DIAS = 90;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function json(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Rutenda/1.0 (organizador de viajes)' } });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

/** Texto de las secciones "Ver/Hacer" de Wikivoyage (español y, si no hay, inglés). */
async function wikivoyage(nombre) {
  const variantes = [nombre, nombre.replace(/^San Carlos de /i, '')].filter((x, i, a) => x && a.indexOf(x) === i);
  for (const idioma of ['es', 'en']) {
    for (const v of variantes) {
      const base = `https://${idioma}.wikivoyage.org/w/api.php`;
      const busq = await json(`${base}?action=opensearch&search=${encodeURIComponent(v)}&limit=1&namespace=0&format=json&origin=*`);
      const titulo = busq && busq[1] && busq[1][0];
      if (!titulo) continue;
      const d = await json(`${base}?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&titles=${encodeURIComponent(titulo)}&format=json&origin=*`, 8000);
      const pag = d && d.query && d.query.pages && Object.values(d.query.pages)[0];
      const texto = pag && pag.extract;
      if (!texto || texto.length < 400) continue;
      // Solo las secciones útiles para "qué hacer"
      const partes = texto.split(/\n(?===\s)/);
      const utiles = partes.filter(p => /^==\s*(Ver|Hacer|Qué ver|Qué hacer|Excursiones|Alrededores|See|Do|Go next|Day trips)\s*==/i.test(p));
      const elegido = (utiles.length ? utiles.join('\n') : texto).slice(0, 7000);
      return { texto: elegido, url: `https://${idioma}.wikivoyage.org/wiki/${encodeURIComponent(titulo.replace(/ /g, '_'))}`, titulo };
    }
  }
  return null;
}

/**
 * Atractivos reales cerca del destino desde OpenStreetMap (Overpass): gratis y sin clave.
 * Toma los que tienen nombre y artículo en Wikipedia (suelen ser los más conocidos).
 */
async function openStreetMap(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const consulta = `[out:json][timeout:12];
(
  nwr(around:25000,${lat},${lon})["tourism"~"attraction|viewpoint|museum|theme_park|zoo|gallery"]["name"];
  nwr(around:25000,${lat},${lon})["natural"~"peak|waterfall|beach|glacier"]["name"]["wikipedia"];
  nwr(around:25000,${lat},${lon})["historic"~"monument|castle|ruins"]["name"]["wikipedia"];
);
out tags 80;`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Rutenda/1.0 (organizador de viajes)' },
      body: 'data=' + encodeURIComponent(consulta)
    });
    if (!r.ok) return [];
    const d = await r.json();
    const vistos = new Set();
    return (d.elements || [])
      .map(e => e.tags || {})
      .sort((a, b) => (b.wikipedia ? 1 : 0) - (a.wikipedia ? 1 : 0))
      .map(x => x['name:es'] || x.name)
      .filter(n => n && !vistos.has(n.toLowerCase()) && vistos.add(n.toLowerCase()))
      .slice(0, 40);
  } catch (e) { return []; } finally { clearTimeout(t); }
}

/** Nombres de atractivos cercanos (OpenTripMap), si hay clave (opcional). */
async function openTripMap(lat, lon) {
  const clave = process.env.OPENTRIPMAP_KEY;
  if (!clave || lat == null || lon == null) return [];
  const d = await json(`https://api.opentripmap.com/0.1/en/places/radius?radius=25000&lon=${lon}&lat=${lat}&kinds=interesting_places&rate=3&format=json&limit=40&apikey=${clave}`);
  return Array.isArray(d) ? d.map(x => x.name).filter(Boolean).slice(0, 40) : [];
}

const INSTRUCCIONES = `Sos un guía de viajes. Armás una lista corta de ideas de qué hacer en un destino, para alguien que organiza su viaje.
Devolvé SOLO un JSON: {"ideas":[{"titulo":"","descripcion":"","tipo":"","reserva":false,"duracion":"","lugar":""}]}
Reglas:
- Entre 8 y 10 ideas, de lo más recomendado a lo menos. Variadas (naturaleza, cultura, gastronomía, excursiones).
- Solo lugares y actividades reales y conocidos del destino o sus alrededores. Si te paso información de fuentes, priorizala. Si no estás seguro de que algo exista, no lo pongas.
- "titulo": corto (máx. 6 palabras). "descripcion": una sola frase de hasta 120 caracteres, en español rioplatense, sin precios ni horarios.
- "tipo": uno de imperdible, naturaleza, excursion, cultura, gastronomia, aventura, compras, noche.
- "reserva": true solo si conviene reservar con anticipación (cupos limitados, entradas que se agotan, excursiones con agencia).
- "duracion": "1-2 h", "medio día" o "día completo".
- "lugar": nombre para buscarlo en un mapa (ej. "Cerro Catedral, Bariloche").
- Tené en cuenta la época del año: no propongas actividades que no se pueden hacer en ese mes (por ejemplo, esquí en verano).`;

async function pedirIdeas(destino, mes, extra, fuentes) {
  const contexto = [
    `Destino: ${[destino.nombre, destino.region, destino.pais].filter(Boolean).join(', ')}.`,
    mes ? `Viajan en ${MESES[mes - 1]}.` : '',
    extra.noches ? `Se quedan ${extra.noches} noches.` : '',
    extra.menores ? 'Viajan con chicos.' : '',
    fuentes.wiki ? `\nInformación de Wikivoyage:\n${fuentes.wiki.texto}` : '',
    fuentes.lugares.length ? `\nAtractivos reales cercanos (OpenStreetMap): ${fuentes.lugares.join(', ')}` : ''
  ].filter(Boolean).join('\n');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
    body: JSON.stringify({
      model: MODELO, temperature: 0.3, max_completion_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: INSTRUCCIONES }, { role: 'user', content: contexto }]
    })
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Groq ' + r.status + ' ' + JSON.stringify(datos).slice(0, 300));
  const crudo = limpiarJSON(datos.choices && datos.choices[0] && datos.choices[0].message && datos.choices[0].message.content);
  const TIPOS = ['imperdible', 'naturaleza', 'excursion', 'cultura', 'gastronomia', 'aventura', 'compras', 'noche'];
  return (crudo.ideas || []).filter(i => i && i.titulo).slice(0, 10).map(i => ({
    titulo: String(i.titulo).slice(0, 60),
    descripcion: String(i.descripcion || '').slice(0, 160),
    tipo: TIPOS.includes(i.tipo) ? i.tipo : 'imperdible',
    reserva: !!i.reserva,
    duracion: String(i.duracion || '').slice(0, 20),
    lugar: String(i.lugar || i.titulo).slice(0, 90)
  }));
}

async function controlarUso(uid) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ref = db().collection('usuarios').doc(uid).collection('uso').doc('ideas');
  return db().runTransaction(async tx => {
    const d = (await tx.get(ref)).data() || {};
    const n = d.fecha === hoy ? d.cantidad || 0 : 0;
    if (n >= LIMITE_DIARIO) return false;
    tx.set(ref, { fecha: hoy, cantidad: n + 1 });
    return true;
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Las ideas todavía no están configuradas.' });
  const uid = await usuario(req);
  if (!uid) return res.status(401).json({ error: 'Ingresá a tu cuenta para ver ideas.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const d = body.destino || {};
  if (!d.nombre) return res.status(400).json({ error: 'Falta el destino.' });
  const destino = { nombre: String(d.nombre).slice(0, 80), region: String(d.region || '').slice(0, 80), pais: String(d.pais || '').slice(0, 60), lat: Number(d.lat), lon: Number(d.lon) };
  const mes = Math.min(12, Math.max(0, parseInt(body.mes, 10) || 0));
  const extra = { noches: parseInt(body.noches, 10) || 0, menores: !!body.menores };

  // Guardadas: mismas ideas para el mismo destino y mes (para todos los usuarios)
  const clave = [normal(destino.nombre), normal(destino.pais), mes || 'x', extra.menores ? 'chicos' : 'adultos'].join('_');
  const ref = db().collection('ideas').doc(clave);
  try {
    const previo = await ref.get();
    if (previo.exists && !body.otras) {
      const p = previo.data();
      if (p.creado && Date.now() - new Date(p.creado).getTime() < VIGENCIA_DIAS * 86400000) return res.status(200).json(p);
    }
  } catch (e) { /* sin caché, seguimos */ }

  try {
    if (!(await controlarUso(uid))) return res.status(429).json({ error: 'Llegaste al límite de ideas por hoy. Probá mañana.' });
  } catch (e) { /* si falla el contador, seguimos */ }

  try {
    const [wiki, osm, otm] = await Promise.all([wikivoyage(destino.nombre), openStreetMap(destino.lat, destino.lon), openTripMap(destino.lat, destino.lon)]);
    const lugares = Array.from(new Set(osm.concat(otm))).slice(0, 50);
    const ideas = await pedirIdeas(destino, mes, extra, { wiki, lugares });
    if (!ideas.length) return res.status(502).json({ error: 'No encontré ideas para este destino.' });
    const fuentes = [];
    if (wiki) fuentes.push({ nombre: 'Wikivoyage', url: wiki.url });
    if (osm.length) fuentes.push({ nombre: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' });
    if (otm.length) fuentes.push({ nombre: 'OpenTripMap', url: 'https://opentripmap.com' });
    const resultado = { destino: destino.nombre, mes, ideas, fuentes, creado: new Date().toISOString() };
    ref.set(resultado).catch(() => {});
    return res.status(200).json(resultado);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'No pude armar las ideas ahora. Probá de nuevo en un rato.' });
  }
};

module.exports.wikivoyage = wikivoyage;
