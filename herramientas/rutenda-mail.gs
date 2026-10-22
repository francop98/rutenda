/* =========================================================
   Rutenda — reservas por mail (Google Apps Script, gratis)
   Corre en la casilla rutendaviajes@gmail.com. Cada 5 minutos
   mira los mails nuevos, los manda a Rutenda y los archiva.

   CÓMO INSTALARLO (una sola vez):
   1. Entrá a https://script.google.com con rutendaviajes@gmail.com
      → "Nuevo proyecto" → borrá todo y pegá este archivo.
   2. ⚙️ Configuración del proyecto → "Propiedades de la secuencia
      de comandos" → Agregar:
        RUTENDA_CLAVE = (la misma clave que pusiste en Vercel como MAIL_SECRET)
   3. Arriba elegí la función "instalar" y tocá ▶ Ejecutar.
      Google te pide permisos para leer y mandar mails: aceptá
      (dice "app no verificada" porque es tuya: Avanzado → Ir al proyecto).
   Listo. Para probar: reenviá una reserva a rutendaviajes@gmail.com
   desde el mail con el que entrás a Rutenda.
   ========================================================= */

const URL_RUTENDA = 'https://rutenda.vercel.app/api/recibir-mail';
const ETIQUETA = 'Rutenda/procesado';
const MAX_ADJUNTO = 3 * 1024 * 1024;   // 3 MB por archivo
const MAX_TOTAL = 3.5 * 1024 * 1024;   // y en total, por mail

/** Crea el disparador que revisa la casilla cada 5 minutos. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisar').timeBased().everyMinutes(5).create();
  revisar();
}

function revisar() {
  const clave = PropertiesService.getScriptProperties().getProperty('RUTENDA_CLAVE');
  if (!clave) throw new Error('Falta la propiedad RUTENDA_CLAVE');
  const etiqueta = GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
  const hilos = GmailApp.search('in:inbox is:unread', 0, 20);
  hilos.forEach(hilo => {
    let todoBien = true;
    hilo.getMessages().filter(m => m.isUnread()).forEach(m => {
      try { procesar(m, clave); m.markRead(); }
      catch (e) { console.error(e); todoBien = false; }   // queda sin leer: se reintenta en 5 minutos
    });
    if (todoBien) { hilo.addLabel(etiqueta); hilo.moveToArchive(); }
  });
}

function procesar(m, clave) {
  let total = 0;
  const adjuntos = m.getAttachments({ includeInlineImages: false }).filter(a => {
    const t = (a.getContentType() || '').toLowerCase();
    const ok = (t === 'application/pdf' || t.indexOf('image/') === 0) && a.getSize() <= MAX_ADJUNTO && total + a.getSize() <= MAX_TOTAL;
    if (ok) total += a.getSize();
    return ok;
  }).slice(0, 5).map(a => ({ nombre: a.getName(), tipo: a.getContentType(), base64: Utilities.base64Encode(a.getBytes()) }));

  const r = UrlFetchApp.fetch(URL_RUTENDA, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Rutenda-Clave': clave },
    payload: JSON.stringify({ de: m.getFrom(), asunto: m.getSubject(), fecha: m.getDate().toISOString(), texto: m.getPlainBody().slice(0, 20000), adjuntos: adjuntos })
  });
  const codigo = r.getResponseCode();
  if (codigo === 404) {
    m.reply('¡Hola! Recibimos tu mail, pero no encontramos una cuenta de Rutenda con esta dirección.\n\n' +
      'Reenviá las reservas desde el mismo mail con el que entrás a Rutenda (lo ves en ☰ → Mis datos).\n\nRutenda · tu viaje, paso a paso');
  } else if (codigo === 429) {
    m.reply('Recibimos muchas reservas tuyas hoy. Probá de nuevo mañana o subila desde la app (Docs → Subir).\n\nRutenda');
  } else if (codigo !== 200) {
    throw new Error('Rutenda respondió ' + codigo + ': ' + r.getContentText().slice(0, 200));
  }
}
