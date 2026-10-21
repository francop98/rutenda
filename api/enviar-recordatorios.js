/* =========================================================
   Envía los recordatorios del día como notificación push.
   La ejecuta Vercel Cron una vez por día (ver vercel.json).
   Variables: FIREBASE_SERVICE_ACCOUNT_JSON, VAPID_PUBLIC_KEY,
   VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET.
   ========================================================= */
const webpush = require('web-push');
const { db, admin } = require('./_lib/firebase');

function hoyEn(zona) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zona || 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch (e) {
    return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  }
}

module.exports = async (req, res) => {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || (req.headers.authorization || '') !== 'Bearer ' + secreto) return res.status(401).json({ error: 'No autorizado' });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(503).json({ error: 'Faltan las claves VAPID' });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:rutenda@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const resumen = { usuarios: 0, enviados: 0, borradas: 0, errores: 0 };
  const usuarios = await db().collection('usuarios').where('recordatoriosActualizados', '>', '').get();

  for (const u of usuarios.docs) {
    const datos = u.data();
    const hoy = hoyEn(datos.zonaHoraria);
    const yaEnviados = datos.recordatoriosEnviados || {};
    const deHoy = (datos.recordatorios || []).filter(r => r.fecha === hoy && !yaEnviados[r.id]);
    if (!deHoy.length) continue;
    const subs = await u.ref.collection('suscripciones').get();
    if (subs.empty) continue;
    resumen.usuarios++;

    // Si hay muchos el mismo día, se agrupan en una sola notificación
    const mensajes = deHoy.length > 3
      ? [{ id: 'resumen_' + hoy, titulo: `Rutenda: ${deHoy.length} cosas para hoy`, cuerpo: deHoy.map(r => r.titulo.replace(/^\S+\s/, '')).join(' · '), url: '#inicio' }]
      : deHoy;

    for (const s of subs.docs) {
      const sub = s.data();
      for (const m of mensajes) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(m), { TTL: 6 * 3600 });
          resumen.enviados++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) { await s.ref.delete(); resumen.borradas++; break; }
          resumen.errores++;
        }
      }
    }

    // Marcar enviados (y olvidar los de días anteriores)
    const nuevos = {};
    Object.keys(yaEnviados).filter(k => k.endsWith(hoy)).forEach(k => { nuevos[k] = true; });
    deHoy.forEach(r => { nuevos[r.id] = true; });
    await u.ref.set({ recordatoriosEnviados: nuevos, recordatoriosUltimoEnvio: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  res.status(200).json(resumen);
};

module.exports.hoyEn = hoyEn;
