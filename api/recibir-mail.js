/* =========================================================
   Reservas por mail
   Reenviás un mail de reserva a rutendaviajes@gmail.com y un
   script de Google (Apps Script, gratis) que corre en esa casilla
   lo manda acá. Rutenda busca tu cuenta por el mail desde el que
   lo reenviaste, lo lee con reglas (sin IA) y lo deja en
   tu "Bandeja" para que lo sumes al viaje con un toque.
   POST /api/recibir-mail   (solo el script, con la clave secreta)
   Cabecera: X-Rutenda-Clave: <MAIL_SECRET>
   Cuerpo: { de, asunto, fecha, texto, adjuntos: [{ nombre, tipo, base64 }] }
   Variables de entorno: MAIL_SECRET, FIREBASE_SERVICE_ACCOUNT_JSON,
   FIREBASE_STORAGE_BUCKET (opcional; por defecto rutenda-app.firebasestorage.app).
   ========================================================= */
const crypto = require('crypto');
const { app, db, admin } = require('./_lib/firebase');
const lector = require('../js/lector.js');

/** Aeropuertos para el lector por reglas (el mismo archivo que usa la app). */
let AEROS = null;
function aeros() {
  if (AEROS) return AEROS;
  AEROS = {};
  try {
    const g = global;
    const antes = { window: g.window, R: g.R };
    g.window = g; g.R = g.R || {};
    require('../js/aeropuertosdatos.js');
    (g.R.AEROPUERTOS_DATOS || []).forEach(a => { AEROS[a[0]] = a[2]; });
    g.window = antes.window; if (!antes.R) delete g.R;
  } catch (e) { /* sin datos: el lector igual lee lo demás */ }
  return AEROS;
}
/** Se lee con reglas (gratis, sin IA). */
function leerConReglas(asunto, texto) {
  const A = aeros();
  const r = lector.leer(`${asunto}\n${texto}`, { esAeropuerto: c => c in A, ciudadDe: c => A[c] || '', anio: new Date().getFullYear() });
  return r && r.util ? r : null;
}

const LIMITE_DIARIO = 30;
const MAX_ADJUNTO = 3 * 1024 * 1024;
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'rutenda-app.firebasestorage.app';
const TIPOS_OK = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;

/** Compara la clave sin filtrar información por el tiempo de respuesta. */
function claveOk(recibida) {
  const esperada = process.env.MAIL_SECRET || '';
  if (!esperada || !recibida) return false;
  const a = Buffer.from(String(recibida)), b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** "Juan <juan@mail.com>" → "juan@mail.com" */
function soloMail(de) {
  const m = /<([^>]+)>/.exec(String(de || ''));
  return (m ? m[1] : String(de || '')).trim().toLowerCase();
}

async function buscarUsuario(email) {
  if (!email) return null;
  try { const u = await app().auth().getUserByEmail(email); return u.uid; } catch (e) { /* no está en Auth */ }
  try {
    const s = await db().collection('usuarios').where('email', '==', email).limit(1).get();
    if (!s.empty) return s.docs[0].id;
  } catch (e) { /* sin índice o sin datos */ }
  return null;
}

async function controlarUso(uid) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ref = db().collection('usuarios').doc(uid).collection('uso').doc('mail');
  return db().runTransaction(async tx => {
    const d = (await tx.get(ref)).data() || {};
    const n = d.fecha === hoy ? d.cantidad || 0 : 0;
    if (n >= LIMITE_DIARIO) return false;
    tx.set(ref, { fecha: hoy, cantidad: n + 1 });
    return true;
  });
}

/** Guarda un adjunto en Storage (o, si es chico y Storage falla, dentro de la bandeja). */
async function guardarAdjunto(uid, mailId, i, a) {
  const nombre = String(a.nombre || 'adjunto').replace(/[\\/:*?"<>|#\[\]]/g, '_').slice(0, 120);
  const tipo = String(a.tipo || '').toLowerCase();
  const datos = Buffer.from(String(a.base64 || ''), 'base64');
  if (!datos.length || datos.length > MAX_ADJUNTO || !TIPOS_OK.test(tipo)) return null;
  const ruta = `bandeja/${uid}/${mailId}/${i}-${nombre}`;
  try {
    await admin.storage(app()).bucket(BUCKET).file(ruta).save(datos, { contentType: tipo, resumable: false });
    return { nombre, tipo, tamano: datos.length, ruta };
  } catch (e) {
    console.error('Storage', e.message);
    if (datos.length < 500 * 1024) return { nombre, tipo, tamano: datos.length, base64: datos.toString('base64') };
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!claveOk(req.headers['x-rutenda-clave'])) return res.status(401).json({ error: 'Clave incorrecta' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const email = soloMail(body.de);
  const uid = await buscarUsuario(email);
  if (!uid) return res.status(404).json({ error: 'sin-cuenta', email });

  try {
    if (!(await controlarUso(uid))) return res.status(429).json({ error: 'limite' });
  } catch (e) { /* si falla el contador, seguimos */ }

  const asunto = String(body.asunto || '(sin asunto)').slice(0, 200);
  const texto = String(body.texto || '').slice(0, 20000);
  const ref = db().collection('usuarios').doc(uid).collection('bandeja').doc();
  const adjuntos = [];
  const lista = Array.isArray(body.adjuntos) ? body.adjuntos.slice(0, 5) : [];
  for (let i = 0; i < lista.length; i++) {
    const g = await guardarAdjunto(uid, ref.id, i, lista[i]);
    if (g) adjuntos.push(g);
  }
  let datos = null;
  try { datos = leerConReglas(asunto, texto); } catch (e) { datos = null; }
  if (datos && datos.tipo === 'otro' && !adjuntos.length) datos = null;

  await ref.set({
    asunto, de: email, recibido: new Date().toISOString(), fechaMail: String(body.fecha || ''),
    texto: texto.slice(0, 4000), datos: datos || null, adjuntos, estado: 'nuevo'
  });
  return res.status(200).json({ ok: true, id: ref.id, leido: !!datos, adjuntos: adjuntos.length });
};

module.exports.soloMail = soloMail;
module.exports.claveOk = claveOk;
module.exports.leerConReglas = leerConReglas;
