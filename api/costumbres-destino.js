/* =========================================================
   "Cómo es allá": costumbres de un destino.
   Horarios de comida, comidas típicas, hábitos, propinas,
   frases útiles y datos prácticos (enchufe, agua, pagos).
   Fuentes: Wikivoyage (de la ciudad y del país; libre, sin clave)
   resumido con IA (Groq). Se guarda por destino para todos los
   usuarios: la segunda vez no se consulta a la IA.
   Solo se llama cuando la persona toca el botón.
   Variables: GROQ_API_KEY (y opcional GROQ_MODEL_TEXTO / GROQ_MODEL).
   ========================================================= */
const { usuario, db } = require('./_lib/firebase');
const { limpiarJSON } = require('./escanear-reserva');
const { wikivoyage } = require('./ideas-destino');

const MODELO = process.env.GROQ_MODEL_TEXTO || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const LIMITE_DIARIO = 20;
const VIGENCIA_DIAS = 180;

const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const SECCIONES_CIUDAD = /^==\s*(Comer|Beber|Gastronom[ií]a|Eat|Drink|Respeto|Respect|Entender|Understand)\s*==/i;
const SECCIONES_PAIS = /^==\s*(Comer|Beber|Respeto|Hablar|Entender|Costumbres|Seguridad|Salud|Conectar|Dinero|Eat|Drink|Respect|Talk|Understand|Stay safe|Stay healthy|Cope|Buy|Money)\s*==/i;

const INSTRUCCIONES = `Sos un guía de viajes que le explica a un viajero argentino cómo es la vida cotidiana en un destino, para que no se sorprenda.
Devolvé SOLO un JSON con esta forma:
{"resumen":"","horarios":{"desayuno":"","almuerzo":"","cena":"","nota":""},"comidas":[{"nombre":"","descripcion":""}],"costumbres":[""],"propina":"","pagos":"","agua":"","enchufe":"","idioma":"","frases":[{"es":"","local":"","pronunciacion":""}],"evitar":[""]}
Reglas:
- Todo en español rioplatense, claro y breve. Compará con Argentina cuando ayude (ej. "se cena mucho más temprano que en Argentina").
- "resumen": una sola frase sobre el ritmo del lugar.
- "horarios": franjas típicas (ej. "12 a 14 h"). "nota": algo útil (siesta, comercios que cierran, etc.).
- "comidas": 4 a 6 platos o bebidas típicos REALES de ese lugar o región, con una descripción de hasta 90 caracteres.
- "costumbres": 4 a 6 hábitos o normas sociales útiles (saludo, puntualidad, vestimenta, fila, ruido, religión), una frase cada uno.
- "propina", "pagos" (efectivo o tarjeta, apps), "agua" (si se puede tomar de la canilla), "enchufe" (tipo y voltaje): una frase cada uno.
- "idioma": el idioma principal. Si NO es español, "frases": 5 frases útiles (hola, gracias, por favor, ¿cuánto cuesta?, la cuenta) con pronunciación aproximada para hispanohablantes. Si es español, "frases" con 2 o 3 palabras locales que un argentino no conocería (o vacío).
- "evitar": 2 o 3 cosas que conviene no hacer.
- Si no estás seguro de un dato, dejalo vacío. No inventes. Si te paso información de fuentes, priorizala.`;

async function pedir(destino, fuentes) {
  const contexto = [
    `Destino: ${[destino.nombre, destino.region, destino.pais].filter(Boolean).join(', ')}.`,
    fuentes.ciudad ? `\nWikivoyage (ciudad):\n${fuentes.ciudad.texto}` : '',
    fuentes.pais ? `\nWikivoyage (país):\n${fuentes.pais.texto}` : ''
  ].filter(Boolean).join('\n');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
    body: JSON.stringify({
      model: MODELO, temperature: 0.2, max_completion_tokens: 2200,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: INSTRUCCIONES }, { role: 'user', content: contexto }]
    })
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Groq ' + r.status + ' ' + JSON.stringify(datos).slice(0, 300));
  return depurar(limpiarJSON(datos.choices && datos.choices[0] && datos.choices[0].message && datos.choices[0].message.content));
}

/** Deja solo lo esperado, con largos acotados. */
function depurar(c) {
  const t = (x, n) => String(x || '').trim().slice(0, n || 200);
  const lista = (x, n, largo) => (Array.isArray(x) ? x : []).map(y => t(y, largo)).filter(Boolean).slice(0, n);
  const h = c && c.horarios ? c.horarios : {};
  return {
    resumen: t(c.resumen, 220),
    horarios: { desayuno: t(h.desayuno, 40), almuerzo: t(h.almuerzo, 40), cena: t(h.cena, 40), nota: t(h.nota, 200) },
    comidas: (Array.isArray(c.comidas) ? c.comidas : []).filter(x => x && x.nombre).slice(0, 6).map(x => ({ nombre: t(x.nombre, 50), descripcion: t(x.descripcion, 120) })),
    costumbres: lista(c.costumbres, 6, 200),
    propina: t(c.propina), pagos: t(c.pagos), agua: t(c.agua), enchufe: t(c.enchufe, 120),
    idioma: t(c.idioma, 40),
    frases: (Array.isArray(c.frases) ? c.frases : []).filter(x => x && x.es && x.local).slice(0, 6).map(x => ({ es: t(x.es, 40), local: t(x.local, 60), pronunciacion: t(x.pronunciacion, 60) })),
    evitar: lista(c.evitar, 3, 200)
  };
}

async function controlarUso(uid) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ref = db().collection('usuarios').doc(uid).collection('uso').doc('costumbres');
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
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Esta función todavía no está configurada.' });
  const uid = await usuario(req);
  if (!uid) return res.status(401).json({ error: 'Ingresá a tu cuenta para ver esto.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const d = body.destino || {};
  if (!d.nombre) return res.status(400).json({ error: 'Falta el destino.' });
  const destino = { nombre: String(d.nombre).slice(0, 80), region: String(d.region || '').slice(0, 80), pais: String(d.pais || '').slice(0, 60) };

  const clave = [normal(destino.nombre), normal(destino.region), normal(destino.pais)].join('_');
  const ref = db().collection('costumbres').doc(clave);
  try {
    const previo = await ref.get();
    if (previo.exists) {
      const p = previo.data();
      if (p.creado && Date.now() - new Date(p.creado).getTime() < VIGENCIA_DIAS * 86400000) return res.status(200).json(p);
    }
  } catch (e) { /* sin caché, seguimos */ }

  try {
    if (!(await controlarUso(uid))) return res.status(429).json({ error: 'Llegaste al límite por hoy. Probá mañana.' });
  } catch (e) { /* si falla el contador, seguimos */ }

  try {
    const [ciudad, pais] = await Promise.all([
      wikivoyage(destino.nombre, SECCIONES_CIUDAD, 3500),
      destino.pais && destino.pais !== destino.nombre ? wikivoyage(destino.pais, SECCIONES_PAIS, 5000) : Promise.resolve(null)
    ]);
    const datos = await pedir(destino, { ciudad, pais });
    if (!datos.comidas.length && !datos.costumbres.length) return res.status(502).json({ error: 'No encontré información de este destino.' });
    const fuentes = [ciudad, pais].filter(Boolean).map(f => ({ nombre: 'Wikivoyage · ' + f.titulo, url: f.url }));
    const resultado = { destino: destino.nombre, datos, fuentes, creado: new Date().toISOString() };
    ref.set(resultado).catch(() => {});
    return res.status(200).json(resultado);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'No pude armarlo ahora. Probá de nuevo en un rato.' });
  }
};

module.exports.depurar = depurar;
