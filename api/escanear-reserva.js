/* =========================================================
   Lee un pasaje, reserva, voucher o póliza (foto o texto de PDF)
   con IA (Groq) y devuelve los datos ordenados en JSON.
   Requiere estar logueado (token de Firebase).
   Variables de entorno: GROQ_API_KEY, opcional GROQ_MODEL.
   ========================================================= */
const { usuario, db, admin } = require('./_lib/firebase');

const LIMITE_DIARIO = 40;
const MODELO = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

const INSTRUCCIONES = `Sos un asistente que lee documentos de viaje (pasajes de avión, micro, tren o barco; reservas de alojamiento; alquiler de auto; excursiones; seguros de viaje; paquetes turísticos).
Devolvé SOLO un objeto JSON con esta forma (omití lo que no figure, no inventes datos):
{
  "tipo": "vuelo" | "micro" | "tren" | "barco" | "alojamiento" | "auto" | "excursion" | "seguro" | "paquete" | "otro",
  "empresa": "aerolínea, empresa, agencia o compañía",
  "codigo": "código de reserva / localizador / N° de voucher",
  "pasajeros": ["nombres tal como figuran"],
  "tramos": [{ "desde": "ciudad", "hasta": "ciudad", "desdeAeropuerto": "IATA", "hastaAeropuerto": "IATA", "empresa": "", "numero": "N° de vuelo o servicio", "fechaSalida": "AAAA-MM-DD", "horaSalida": "HH:MM", "fechaLlegada": "AAAA-MM-DD", "horaLlegada": "HH:MM" }],
  "equipaje": "texto breve",
  "asientos": "texto breve",
  "alojamiento": { "nombre": "", "ciudad": "", "direccion": "", "telefono": "", "checkinFecha": "AAAA-MM-DD", "checkinHora": "HH:MM", "checkoutFecha": "AAAA-MM-DD", "checkoutHora": "HH:MM", "cancelacionHasta": "AAAA-MM-DD", "desayuno": true },
  "auto": { "rentadora": "", "vehiculo": "", "retiroLugar": "", "retiroFecha": "AAAA-MM-DD", "retiroHora": "HH:MM", "devolucionLugar": "", "devolucionFecha": "AAAA-MM-DD", "devolucionHora": "HH:MM" },
  "actividades": [{ "nombre": "", "fecha": "AAAA-MM-DD", "hora": "HH:MM", "lugar": "punto de encuentro" }],
  "seguro": { "compania": "", "poliza": "", "telefono": "teléfono de asistencia", "desde": "AAAA-MM-DD", "hasta": "AAAA-MM-DD" },
  "costo": { "monto": 0, "moneda": "ARS|USD|EUR|BRL|…" }
}
Cada vuelo o servicio es un tramo distinto (si hay escala, son dos tramos). Las horas son locales, como figuran en el documento. Fechas siempre AAAA-MM-DD.`;

function limpiarJSON(texto) {
  const s = String(texto || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const i = s.indexOf('{'), f = s.lastIndexOf('}');
  if (i < 0 || f < i) throw new Error('Respuesta sin JSON');
  return JSON.parse(s.slice(i, f + 1));
}

/** Controla el uso diario por usuario para cuidar el costo. */
async function controlarUso(uid) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ref = db().collection('usuarios').doc(uid).collection('uso').doc('escaneo');
  return db().runTransaction(async tx => {
    const d = (await tx.get(ref)).data() || {};
    const n = d.fecha === hoy ? d.cantidad || 0 : 0;
    if (n >= LIMITE_DIARIO) return false;
    tx.set(ref, { fecha: hoy, cantidad: n + 1, ultimo: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'El escaneo todavía no está configurado.' });
  const uid = await usuario(req);
  if (!uid) return res.status(401).json({ error: 'Ingresá a tu cuenta para escanear.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const imagen = typeof body.imagen === 'string' && body.imagen.startsWith('data:image/') ? body.imagen : '';
  const texto = typeof body.texto === 'string' ? body.texto.slice(0, 15000) : '';
  if (!imagen && !texto) return res.status(400).json({ error: 'No llegó ningún archivo.' });
  if (imagen.length > 4000000) return res.status(413).json({ error: 'La imagen es muy grande.' });

  try {
    if (!(await controlarUso(uid))) return res.status(429).json({ error: 'Llegaste al límite de escaneos de hoy. Probá mañana.' });
  } catch (e) { /* si falla el contador, seguimos */ }

  const pista = body.pista ? `\nContexto: el usuario está cargando "${String(body.pista).slice(0, 120)}".` : '';
  const contenido = imagen
    ? [{ type: 'text', text: 'Leé este documento de viaje y devolvé el JSON.' + pista }, { type: 'image_url', image_url: { url: imagen } }]
    : `Texto extraído de un PDF de viaje:${pista}\n\n${texto}`;

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: MODELO,
        temperature: 0.1,
        max_completion_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: INSTRUCCIONES }, { role: 'user', content: contenido }]
      })
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('Groq', r.status, JSON.stringify(datos).slice(0, 500));
      return res.status(502).json({ error: 'El lector no respondió. Probá de nuevo en un rato.' });
    }
    const resultado = limpiarJSON(datos.choices && datos.choices[0] && datos.choices[0].message && datos.choices[0].message.content);
    return res.status(200).json(resultado);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'No pude leer bien el archivo. Probá con una foto más nítida.' });
  }
};

module.exports.limpiarJSON = limpiarJSON;
