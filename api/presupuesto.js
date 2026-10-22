/* =========================================================
   Presupuesto sugerido para un viaje (orientativo).
   La IA (Groq) estima cuánto se gasta por día y por persona en
   cada destino, en dólares, para tres estilos de viaje.
   Se guarda por destino y mes: la segunda vez no se consulta.
   Solo se llama cuando la persona lo pide.
   POST { destinos: [{ nombre, region, pais }], mes: 1-12 }
   Variables: GROQ_API_KEY (opcional GROQ_MODEL_TEXTO / GROQ_MODEL).
   ========================================================= */
const { usuario, db } = require('./_lib/firebase');
const { limpiarJSON } = require('./escanear-reserva');

const MODELO = process.env.GROQ_MODEL_TEXTO || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const LIMITE_DIARIO = 15;
const VIGENCIA_DIAS = 60;
const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const INSTRUCCIONES = `Estimás costos de viaje para viajeros argentinos. Devolvé SOLO un JSON:
{"destinos":[{"nombre":"","economico":{"comida":0,"transporte":0,"actividades":0,"alojamiento":0},"medio":{...},"comodo":{...},"nota":""}],"consejos":[""]}
Reglas:
- Montos en DÓLARES ESTADOUNIDENSES (USD), números sin símbolos.
- "comida", "transporte" (dentro del destino) y "actividades": por persona y por día.
- "alojamiento": por noche, por habitación doble.
- "economico" = hostel o hotel simple, comer barato, transporte público; "medio" = hotel 3 estrellas, restaurantes comunes; "comodo" = hotel 4-5 estrellas, buenos restaurantes, taxis y excursiones.
- Tené en cuenta la temporada del mes indicado (alta o baja).
- "nota": una frase con lo que más cambia el costo en ese destino (máx. 140 caracteres).
- "consejos": 2 o 3 ideas concretas para gastar menos (máx. 140 caracteres cada una).
- Sé realista; si no sabés, estimá con prudencia.`;

async function controlarUso(uid) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ref = db().collection('usuarios').doc(uid).collection('uso').doc('presupuesto');
  return db().runTransaction(async tx => {
    const d = (await tx.get(ref)).data() || {};
    const n = d.fecha === hoy ? d.cantidad || 0 : 0;
    if (n >= LIMITE_DIARIO) return false;
    tx.set(ref, { fecha: hoy, cantidad: n + 1 });
    return true;
  });
}

const num = x => { const n = Number(x); return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n) : 0; };
function depurar(r, destinos) {
  const nivel = x => ({ comida: num((x || {}).comida), transporte: num((x || {}).transporte), actividades: num((x || {}).actividades), alojamiento: num((x || {}).alojamiento) });
  const lista = (Array.isArray(r.destinos) ? r.destinos : []).slice(0, destinos.length).map((d, i) => ({
    nombre: String((destinos[i] || {}).nombre || d.nombre || '').slice(0, 80),
    economico: nivel(d.economico), medio: nivel(d.medio), comodo: nivel(d.comodo),
    nota: String(d.nota || '').slice(0, 160)
  }));
  return { destinos: lista, consejos: (Array.isArray(r.consejos) ? r.consejos : []).map(x => String(x).slice(0, 160)).filter(Boolean).slice(0, 3) };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Esta función todavía no está configurada.' });
  const uid = await usuario(req);
  if (!uid) return res.status(401).json({ error: 'Ingresá a tu cuenta para pedir el presupuesto.' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const destinos = (Array.isArray(body.destinos) ? body.destinos : []).filter(d => d && d.nombre).slice(0, 6)
    .map(d => ({ nombre: String(d.nombre).slice(0, 80), region: String(d.region || '').slice(0, 80), pais: String(d.pais || '').slice(0, 60) }));
  if (!destinos.length) return res.status(400).json({ error: 'Faltan los destinos.' });
  const mes = Math.min(12, Math.max(1, parseInt(body.mes, 10) || (new Date().getMonth() + 1)));

  const clave = destinos.map(d => normal(d.nombre) + '_' + normal(d.pais)).join('__').slice(0, 400) + '__m' + mes;
  const ref = db().collection('presupuestos').doc(clave);
  try {
    const p = await ref.get();
    if (p.exists && p.data().creado && Date.now() - new Date(p.data().creado).getTime() < VIGENCIA_DIAS * 86400000) return res.status(200).json(p.data());
  } catch (e) { /* sin caché */ }
  try {
    if (!(await controlarUso(uid))) return res.status(429).json({ error: 'Llegaste al límite por hoy. Probá mañana.' });
  } catch (e) { /* seguimos */ }

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: MODELO, temperature: 0.2, max_completion_tokens: 1500, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: INSTRUCCIONES }, { role: 'user', content: `Mes del viaje: ${mes}. Destinos, en orden: ${destinos.map(d => [d.nombre, d.region, d.pais].filter(Boolean).join(', ')).join(' | ')}.` }]
      })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('Groq', r.status, JSON.stringify(d).slice(0, 300)); return res.status(502).json({ error: 'No pude calcularlo ahora. Probá en un rato.' }); }
    const datos = depurar(limpiarJSON(d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content), destinos);
    if (!datos.destinos.length) return res.status(502).json({ error: 'No pude calcularlo ahora. Probá en un rato.' });
    const resultado = Object.assign({ moneda: 'USD', mes, creado: new Date().toISOString() }, datos);
    ref.set(resultado).catch(() => {});
    return res.status(200).json(resultado);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'No pude calcularlo ahora. Probá en un rato.' });
  }
};

module.exports.depurar = depurar;
