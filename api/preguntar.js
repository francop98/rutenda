/* =========================================================
   "Preguntale a Rutenda": responde preguntas sobre tu viaje.
   La app manda un resumen del viaje (itinerario, gastos, valija,
   pendientes…) y la pregunta; la IA (Groq) responde corto.
   Solo se llama cuando la persona envía una pregunta.
   Variables: GROQ_API_KEY (opcional GROQ_MODEL_TEXTO / GROQ_MODEL).
   ========================================================= */
const { usuario, db } = require('./_lib/firebase');

const MODELO = process.env.GROQ_MODEL_TEXTO || process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const LIMITE_DIARIO = 40;

const INSTRUCCIONES = `Sos Rutenda, el asistente de una app argentina para organizar viajes. Respondés preguntas sobre EL VIAJE del usuario.
Reglas:
- Español rioplatense (voseo), cálido y MUY breve: 1 a 5 oraciones o una lista corta. Nada de introducciones.
- Para datos del viaje (fechas, horarios, gastos, valija, reservas, pendientes) usá SOLO el contexto. Si algo no está cargado, decilo y sugerí dónde cargarlo en la app (Guía, Itinerario, Gastos, Valija, Docs).
- Para consejos generales (clima típico, qué llevar, costumbres, cómo moverse) podés usar conocimiento general, aclarando que conviene confirmarlo si es algo que cambia (precios, horarios, requisitos).
- Hacé las cuentas con cuidado y mostrá los montos con la moneda.
- Nunca inventes reservas, códigos, horarios ni montos.`;

async function controlarUso(uid) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ref = db().collection('usuarios').doc(uid).collection('uso').doc('preguntar');
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
  if (!uid) return res.status(401).json({ error: 'Ingresá a tu cuenta para preguntar.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const pregunta = String(body.pregunta || '').trim().slice(0, 500);
  if (!pregunta) return res.status(400).json({ error: 'Escribí una pregunta.' });
  const contexto = String(body.contexto || '').slice(0, 14000);
  const historial = (Array.isArray(body.historial) ? body.historial : []).slice(-6)
    .filter(x => x && (x.rol === 'yo' || x.rol === 'rutenda') && x.texto)
    .map(x => ({ role: x.rol === 'yo' ? 'user' : 'assistant', content: String(x.texto).slice(0, 1200) }));

  try {
    if (!(await controlarUso(uid))) return res.status(429).json({ error: 'Llegaste al límite de preguntas de hoy. Probá mañana.' });
  } catch (e) { /* si falla el contador, seguimos */ }

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: MODELO, temperature: 0.3, max_completion_tokens: 700,
        messages: [
          { role: 'system', content: INSTRUCCIONES + '\n\nCONTEXTO DEL VIAJE:\n' + contexto },
          ...historial,
          { role: 'user', content: pregunta }
        ]
      })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('Groq', r.status, JSON.stringify(d).slice(0, 300)); return res.status(502).json({ error: 'No pude responder ahora. Probá en un rato.' }); }
    const texto = String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '')
      .replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!texto) return res.status(502).json({ error: 'No pude responder ahora. Probá en un rato.' });
    return res.status(200).json({ respuesta: texto.slice(0, 3000) });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'No pude responder ahora. Probá en un rato.' });
  }
};
