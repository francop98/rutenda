/* Conexión de las funciones del servidor con Firebase (Admin SDK).
   Usa la variable de entorno FIREBASE_SERVICE_ACCOUNT_JSON de Vercel
   (el JSON completo de la cuenta de servicio, nunca dentro del código). */
const admin = require('firebase-admin');

function app() {
  if (admin.apps.length) return admin.app();
  const crudo = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!crudo) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_JSON');
  const cuenta = JSON.parse(crudo);
  if (cuenta.private_key) cuenta.private_key = cuenta.private_key.replace(/\\n/g, '\n');
  return admin.initializeApp({ credential: admin.credential.cert(cuenta) });
}

/** Devuelve el uid de quien llama (token de Firebase en Authorization: Bearer …) o null. */
async function usuario(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  try {
    const d = await app().auth().verifyIdToken(token);
    return d.uid;
  } catch (e) {
    return null;
  }
}

module.exports = { admin, app, db: () => app().firestore(), usuario };
