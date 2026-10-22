/* =========================================================
   Rutenda — sincronización con Firebase
   Estructura en Firestore:
     usuarios/{uid}                    perfil, preferencias, listas de valija, recordatorios
     usuarios/{uid}/suscripciones/{id} notificaciones push
     viajes/{viajeId}                  organización del viaje (cronograma, guía, itinerario, personas…)
       ./movimientos/{id}              gastos, ingresos y pagos (cada uno carga los suyos)
       ./documentos/{id}               datos de cada archivo (el archivo va a Storage)
       ./valijas/{personaId}           la valija de cada viajero
     invitaciones/{codigo}             enlace para sumarse a un viaje
   Storage: viajes/{viajeId}/archivos/{archivoId}
   Los cambios se envían agrupados (cada ~0,5 s) y solo lo que cambió.
   ========================================================= */
window.R = window.R || {};

R.nube = (function () {
  const SUBS = ['movimientos', 'documentos'];
  const SOLO_LOCAL = ['movimientos', 'documentos', 'valijas', 'votos'];
  const PROTEGIDOS = ['owner', 'miembros', 'roles', 'codigoUnion'];
  let app = null, db = null, auth = null, storage = null;
  let uid = null;
  let cb = null;
  let desuscribir = [];
  const porViaje = {};      // { viajeId: { unsubs: [], ultimo: {principal, movimientos:{}, documentos:{}, valijas:{}}, timer, nuevo } }

  function config() { return window.RUTENDA_FIREBASE || null; }
  function disponible() {
    const c = config();
    return !!(window.firebase && c && c.apiKey && c.projectId);
  }
  function iniciarApp() {
    if (app) return app;
    app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(config());
    auth = firebase.auth();
    auth.languageCode = 'es'; // mails de confirmación y de clave en español
    db = firebase.firestore();
    try { db.enablePersistence({ synchronizeTabs: true }).catch(() => { /* otra pestaña o navegador sin soporte */ }); } catch (e) { /* ya activado */ }
    storage = firebase.storage ? firebase.storage() : null;
    return app;
  }
  const FV = () => firebase.firestore.FieldValue;
  const limpio = o => JSON.parse(JSON.stringify(o === undefined ? null : o));

  /* ---------------------------------------------------------
     Arranque y escucha en tiempo real
     --------------------------------------------------------- */
  function iniciar(u, callbacks) {
    iniciarApp();
    detener();
    uid = u;
    cb = callbacks;
    return new Promise(resolver => {
      let listo = { perfil: false, viajes: false };
      const terminar = () => { if (listo.perfil && listo.viajes) resolver(); };
      setTimeout(resolver, 6000); // sin conexión ni caché: arrancar igual

      desuscribir.push(db.collection('usuarios').doc(uid).onSnapshot(s => {
        cb.alPerfil(s.exists ? s.data() : {});
        listo.perfil = true; terminar();
      }, () => { listo.perfil = true; terminar(); }));

      desuscribir.push(db.collection('viajes').where('miembros', 'array-contains', uid).onSnapshot(snap => {
        const ids = new Set();
        snap.docs.forEach(doc => {
          ids.add(doc.id);
          aplicarPrincipal(doc.id, doc.data(), doc.metadata.hasPendingWrites);
        });
        // Viajes de los que ya no sos miembro
        const lista = cb.lista();
        for (let i = lista.length - 1; i >= 0; i--) {
          const v = lista[i];
          if (!ids.has(v.id) && !(porViaje[v.id] && porViaje[v.id].nuevo)) { soltar(v.id); lista.splice(i, 1); }
        }
        listo.viajes = true; terminar();
        cb.alViajes();
      }, () => { listo.viajes = true; terminar(); }));
    });
  }

  function detener() {
    desuscribir.forEach(f => { try { f(); } catch (e) { /* nada */ } });
    desuscribir = [];
    Object.keys(porViaje).forEach(soltar);
  }
  function soltar(id) {
    const p = porViaje[id];
    if (!p) return;
    p.unsubs.forEach(f => { try { f(); } catch (e) { /* nada */ } });
    clearTimeout(p.timer);
    delete porViaje[id];
  }

  function registro(id) {
    if (!porViaje[id]) porViaje[id] = { unsubs: [], ultimo: { principal: null, movimientos: {}, documentos: {}, valijas: {}, votos: {} }, timer: null, nuevo: false, pendiente: false };
    return porViaje[id];
  }

  /** Aplica los datos del documento principal sobre el objeto del viaje (sin reemplazarlo). */
  function aplicarPrincipal(id, datos, propio) {
    const p = registro(id);
    const lista = cb.lista();
    let v = lista.find(x => x.id === id);
    if (propio && v) return;                       // eco de un cambio nuestro
    if (p.pendiente && v) { p.saltado = true; return; }   // hay cambios nuestros por enviar: no pisarlos
    if (!v) {
      v = { id, movimientos: [], documentos: [], valijas: {}, votos: {} };
      lista.push(v);
      escucharSubcolecciones(id);
    }
    Object.keys(v).forEach(k => { if (!SOLO_LOCAL.includes(k) && k !== 'id' && !(k in datos)) delete v[k]; });
    Object.assign(v, datos, { id });
    cb.normalizar(v);
    p.ultimo.principal = firmaPrincipal(v);
    p.nuevo = false;
  }

  function escucharSubcolecciones(id) {
    const p = registro(id);
    const ref = db.collection('viajes').doc(id);
    SUBS.forEach(col => {
      p.unsubs.push(ref.collection(col).onSnapshot(snap => {
        const v = cb.lista().find(x => x.id === id);
        if (!v) return;
        if (snap.metadata.hasPendingWrites) return;
        const mapa = {};
        snap.docs.forEach(d => { mapa[d.id] = Object.assign({ id: d.id }, d.data()); });
        p.ultimo[col] = {};
        Object.values(mapa).forEach(x => { p.ultimo[col][x.id] = JSON.stringify(x); });
        // Conservar lo nuestro que todavía no se envió
        const locales = (v[col] || []).filter(x => !mapa[x.id] && p.pendiente);
        v[col] = Object.values(mapa).concat(locales).sort((a, b) => String(a.creado || a.fecha || '').localeCompare(String(b.creado || b.fecha || '')));
        cb.alViajes();
      }, () => { /* sin permiso o sin conexión */ }));
    });
    p.unsubs.push(ref.collection('valijas').onSnapshot(snap => {
      const v = cb.lista().find(x => x.id === id);
      if (!v || snap.metadata.hasPendingWrites) return;
      const mapa = {};
      snap.docs.forEach(d => { mapa[d.id] = d.data(); });
      p.ultimo.valijas = {};
      Object.keys(mapa).forEach(k => { p.ultimo.valijas[k] = JSON.stringify(mapa[k]); });
      v.valijas = Object.assign({}, p.pendiente ? v.valijas : {}, mapa);
      cb.alViajes();
    }, () => { /* sin permiso */ }));
    // Votos de ideas: cada viajero tiene los suyos
    p.unsubs.push(ref.collection('votos').onSnapshot(snap => {
      const v = cb.lista().find(x => x.id === id);
      if (!v || snap.metadata.hasPendingWrites) return;
      const mapa = {};
      snap.docs.forEach(d => { mapa[d.id] = d.data(); });
      p.ultimo.votos = {};
      Object.keys(mapa).forEach(k => { p.ultimo.votos[k] = JSON.stringify(mapa[k]); });
      v.votos = Object.assign({}, p.pendiente ? v.votos : {}, mapa);
      cb.alViajes();
    }, () => { /* sin permiso */ }));
  }

  /* ---------------------------------------------------------
     Envío de cambios
     --------------------------------------------------------- */
  function principal(v) {
    const r = {};
    Object.keys(v).forEach(k => { if (!SOLO_LOCAL.includes(k)) r[k] = v[k]; });
    return limpio(r);
  }
  function firmaPrincipal(v) { return JSON.stringify(principal(v)); }

  function programar(v) {
    const p = registro(v.id);
    if (!p.ultimo.principal) p.nuevo = true;   // viaje nuevo: todavía no está en la nube
    p.pendiente = true;
    clearTimeout(p.timer);
    p.timer = setTimeout(() => enviar(v.id).catch(errorDeEnvio), 450);
  }

  function errorDeEnvio(e) {
    console.error('Rutenda: no se pudo sincronizar', e);
    if (R.util) R.util.toast(e && e.code === 'permission-denied' ? 'No tenés permiso para cambiar eso en este viaje.' : 'No se pudo guardar en la nube. Se reintenta al volver la conexión.');
  }

  /** Envía ya todo lo pendiente (por ejemplo, antes de cerrar sesión). */
  async function enviarTodo() {
    const ids = Object.keys(porViaje).filter(id => porViaje[id].pendiente);
    for (const id of ids) { clearTimeout(porViaje[id].timer); await enviar(id).catch(errorDeEnvio); }
  }

  async function enviar(id) {
    const p = registro(id);
    const v = cb.lista().find(x => x.id === id);
    if (!v) { p.pendiente = false; return; }
    const ref = db.collection('viajes').doc(id);
    const rol = (v.roles || {})[uid] || (v.owner === uid ? 'organizador' : 'viajero');
    const organiza = rol === 'organizador' || rol === 'coorganizador';

    // 1) Documento principal
    const datos = principal(v);
    const firma = JSON.stringify(datos);
    if (p.nuevo || !p.ultimo.principal) {
      datos.owner = uid; datos.miembros = [uid]; datos.roles = { [uid]: 'organizador' };
      await ref.set(datos);
      p.ultimo.principal = JSON.stringify(datos);
      p.nuevo = false;
      if (!p.unsubs.length) escucharSubcolecciones(id);
    } else if (firma !== p.ultimo.principal) {
      if (organiza) {
        const antes = JSON.parse(p.ultimo.principal);
        const cambios = {};
        Object.keys(datos).forEach(k => {
          if (PROTEGIDOS.includes(k) || k === 'personas') return;
          if (JSON.stringify(datos[k]) !== JSON.stringify(antes[k])) cambios[k] = datos[k];
        });
        Object.keys(antes).forEach(k => { if (!(k in datos) && !PROTEGIDOS.includes(k) && k !== 'personas') cambios[k] = FV().delete(); });
        // Personas: una por una, para no pisar a quien se sumó mientras tanto
        const pa = antes.personas || {}, pd = datos.personas || {};
        Object.keys(pd).forEach(k => { if (JSON.stringify(pd[k]) !== JSON.stringify(pa[k])) cambios['personas.' + k] = pd[k]; });
        Object.keys(pa).forEach(k => { if (!(k in pd)) cambios['personas.' + k] = FV().delete(); });
        if (Object.keys(cambios).length) await ref.update(cambios);
        p.ultimo.principal = firma;
        if (v.invitacion && v.invitacion.activa) actualizarInvitacion(v).catch(() => {});
        if (v.linkFamilia && v.linkFamilia.activo && R.familia) R.familia.actualizar(v);
      } else {
        // Un viajero no puede cambiar la organización: se vuelve a lo último sincronizado
        const ultimo = JSON.parse(p.ultimo.principal);
        Object.keys(v).forEach(k => { if (!SOLO_LOCAL.includes(k) && k !== 'id' && !(k in ultimo)) delete v[k]; });
        Object.assign(v, ultimo);
        cb.normalizar(v);
        p.ultimo.principal = firmaPrincipal(v);
      }
    }

    // 2) Gastos y documentos: solo lo que cambió
    const lote = db.batch();
    let operaciones = 0;
    SUBS.forEach(col => {
      const actuales = {};
      (v[col] || []).forEach(x => {
        if (!x.id) return;
        if (!x.creadoPor) x.creadoPor = uid;
        actuales[x.id] = x;
      });
      const previos = p.ultimo[col];
      Object.values(actuales).forEach(x => {
        const json = JSON.stringify(limpio(x));
        if (previos[x.id] === json) return;
        if (!organiza && x.creadoPor !== uid) return;
        const datosItem = limpio(x); delete datosItem.id;
        lote.set(ref.collection(col).doc(x.id), datosItem);
        previos[x.id] = json; operaciones++;
      });
      Object.keys(previos).forEach(k => {
        if (actuales[k]) return;
        const anterior = JSON.parse(previos[k]);
        if (!organiza && anterior.creadoPor !== uid) return;
        lote.delete(ref.collection(col).doc(k));
        delete previos[k]; operaciones++;
      });
    });
    // 3) Valijas (cada uno la suya; los organizadores, cualquiera)
    const mias = new Set(Object.values(v.personas || {}).filter(x => x.uid === uid).map(x => x.id));
    Object.keys(v.valijas || {}).forEach(pid => {
      const json = JSON.stringify(limpio(v.valijas[pid]));
      if (p.ultimo.valijas[pid] === json) return;
      if (!organiza && !mias.has(pid)) return;
      lote.set(ref.collection('valijas').doc(pid), limpio(v.valijas[pid]));
      p.ultimo.valijas[pid] = json; operaciones++;
    });
    // 4) Votos de ideas (cada uno los suyos)
    Object.keys(v.votos || {}).forEach(pid => {
      const json = JSON.stringify(limpio(v.votos[pid]));
      if (p.ultimo.votos[pid] === json) return;
      if (!organiza && !mias.has(pid)) return;
      lote.set(ref.collection('votos').doc(pid), limpio(v.votos[pid]));
      p.ultimo.votos[pid] = json; operaciones++;
    });
    if (operaciones) await lote.commit();
    p.pendiente = false;
    // Si mientras tanto llegó un cambio de otra persona, traerlo ahora
    if (p.saltado) {
      p.saltado = false;
      const s = await ref.get();
      if (s.exists) { aplicarPrincipal(id, s.data(), false); cb.alViajes(); }
    }
  }

  async function eliminarViaje(v) {
    const ref = db.collection('viajes').doc(v.id);
    soltar(v.id);
    for (const col of SUBS.concat(['valijas', 'votos'])) {
      const snap = await ref.collection(col).get();
      const lote = db.batch();
      snap.docs.forEach(d => lote.delete(d.ref));
      if (snap.docs.length) await lote.commit();
    }
    for (const d of v.documentos || []) { try { await borrarArchivo(v.id, d.archivoId); } catch (e) { /* ya no estaba */ } }
    if (v.invitacion && v.invitacion.codigo) { try { await db.collection('invitaciones').doc(v.invitacion.codigo).delete(); } catch (e) { /* nada */ } }
    await ref.delete();
  }

  async function salirDelViaje(v) {
    soltar(v.id);
    await db.collection('viajes').doc(v.id).update({ miembros: FV().arrayRemove(uid), ['roles.' + uid]: FV().delete() });
  }

  /* ---------------------------------------------------------
     Perfil
     --------------------------------------------------------- */
  let timerPerfil = null;
  function guardarPerfil(datos) {
    clearTimeout(timerPerfil);
    timerPerfil = setTimeout(() => {
      db.collection('usuarios').doc(uid).set(limpio(datos), { merge: true }).catch(errorDeEnvio);
    }, 400);
  }
  function actualizarPerfil(datos) { return db.collection('usuarios').doc(uid).set(limpio(datos), { merge: true }); }

  /* ---------------------------------------------------------
     Invitaciones y miembros
     --------------------------------------------------------- */
  function nuevoCodigo() {
    const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
    let c = '';
    const azar = window.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(12)) : Array.from({ length: 12 }, () => Math.floor(Math.random() * 1e9));
    for (let i = 0; i < 12; i++) c += letras[azar[i] % letras.length];
    return c;
  }
  function datosInvitacion(v) {
    return {
      viajeId: v.id, activa: true,
      nombre: v.nombre || v.destino || 'Viaje', destino: v.destino || '',
      fechaInicio: v.fechaInicio || '', fechaFin: v.fechaFin || '',
      organizador: ((v.personas || {})['u_' + v.owner] || {}).nombre || '',
      personas: Object.values(v.personas || {}).filter(p => (v.participantes || []).includes(p.id)).map(p => ({ id: p.id, nombre: p.nombre, vinculada: !!p.uid }))
    };
  }
  async function crearInvitacion(v) {
    const codigo = (v.invitacion && v.invitacion.codigo) || nuevoCodigo();
    await enviarTodo();
    await db.collection('invitaciones').doc(codigo).set(limpio(Object.assign(datosInvitacion(v), { creadoPor: uid, creado: new Date().toISOString() })));
    v.invitacion = { codigo, activa: true };
    await db.collection('viajes').doc(v.id).update({ invitacion: v.invitacion });
    registro(v.id).ultimo.principal = firmaPrincipal(v);
    return codigo;
  }
  function actualizarInvitacion(v) {
    return db.collection('invitaciones').doc(v.invitacion.codigo).set(limpio(datosInvitacion(v)), { merge: true });
  }
  async function desactivarInvitacion(v) {
    if (!v.invitacion) return;
    const codigo = v.invitacion.codigo;
    v.invitacion = { codigo, activa: false };
    await db.collection('viajes').doc(v.id).update({ invitacion: v.invitacion });
    await db.collection('invitaciones').doc(codigo).set({ activa: false }, { merge: true });
    registro(v.id).ultimo.principal = firmaPrincipal(v);
  }
  async function leerInvitacion(codigo) {
    iniciarApp();
    const s = await db.collection('invitaciones').doc(codigo).get();
    return s.exists ? Object.assign({ codigo }, s.data()) : null;
  }
  /**
   * Sumarse a un viaje. personaId: la persona del viaje que sos (o null para sumarte como alguien nuevo).
   */
  async function unirse(inv, personaId, nombre) {
    const ref = db.collection('viajes').doc(inv.viajeId);
    const cambios = { miembros: FV().arrayUnion(uid), ['roles.' + uid]: 'viajero', codigoUnion: inv.codigo };
    if (personaId) {
      cambios['personas.' + personaId + '.uid'] = uid;
    } else {
      const pid = 'u_' + uid;
      cambios['personas.' + pid] = { id: pid, nombre, color: R.util.colorPersona(pid), uid };
      cambios.participantes = FV().arrayUnion(pid);
    }
    await ref.update(cambios);
    return inv.viajeId;
  }
  async function cambiarRol(v, otroUid, rol) {
    v.roles[otroUid] = rol;
    await db.collection('viajes').doc(v.id).update({ ['roles.' + otroUid]: rol });
    registro(v.id).ultimo.principal = firmaPrincipal(v);
  }
  async function quitarMiembro(v, otroUid) {
    const cambios = { miembros: FV().arrayRemove(otroUid), ['roles.' + otroUid]: FV().delete() };
    Object.values(v.personas || {}).forEach(p => { if (p.uid === otroUid) { cambios['personas.' + p.id + '.uid'] = FV().delete(); delete p.uid; } });
    v.miembros = v.miembros.filter(x => x !== otroUid);
    delete v.roles[otroUid];
    await db.collection('viajes').doc(v.id).update(cambios);
    registro(v.id).ultimo.principal = firmaPrincipal(v);
  }

  /* ---------------------------------------------------------
     Link para la familia (solo lectura, sin cuenta)
     familia/{token}: { viajeId, creadoPor, activo, actualizado, datos }
     --------------------------------------------------------- */
  async function guardarFamilia(v, datos) {
    const token = (v.linkFamilia && v.linkFamilia.token) || (nuevoCodigo() + nuevoCodigo());
    await db.collection('familia').doc(token).set(limpio({ viajeId: v.id, creadoPor: uid, activo: true, actualizado: new Date().toISOString(), datos }));
    return token;
  }
  async function apagarFamilia(v) {
    if (!v.linkFamilia || !v.linkFamilia.token) return;
    await db.collection('familia').doc(v.linkFamilia.token).set({ viajeId: v.id, creadoPor: uid, activo: false, actualizado: new Date().toISOString(), datos: null });
  }
  async function leerFamilia(token) {
    iniciarApp();
    try {
      const s = await db.collection('familia').doc(token).get();
      return s.exists && s.data().activo ? s.data() : null;
    } catch (e) { return null; }   // apagado o inexistente
  }

  /* ---------------------------------------------------------
     Archivos (Storage)
     --------------------------------------------------------- */
  const rutaArchivo = (viajeId, id) => `viajes/${viajeId}/archivos/${id}`;
  async function subirArchivo(viajeId, id, blob) {
    if (!storage) throw new Error('Storage no disponible');
    await storage.ref(rutaArchivo(viajeId, id)).put(blob, { contentType: blob.type || 'application/octet-stream' });
  }
  async function bajarArchivo(viajeId, id) {
    if (!storage) return null;
    try {
      const url = await storage.ref(rutaArchivo(viajeId, id)).getDownloadURL();
      const r = await fetch(url);
      return r.ok ? await r.blob() : null;
    } catch (e) { return null; }
  }
  /** Enlace directo al archivo (sirve aunque el navegador no pueda descargarlo como blob). */
  async function urlArchivo(viajeId, id) {
    if (!storage) return null;
    try { return await storage.ref(rutaArchivo(viajeId, id)).getDownloadURL(); } catch (e) { return null; }
  }
  async function borrarArchivo(viajeId, id) { if (storage) await storage.ref(rutaArchivo(viajeId, id)).delete(); }
  /** Archivos guardados por el servidor en otra carpeta (por ejemplo, la bandeja de mails). */
  async function bajarRuta(ruta) {
    if (!storage) return null;
    try { const url = await storage.ref(ruta).getDownloadURL(); const r = await fetch(url); return r.ok ? await r.blob() : null; } catch (e) { return null; }
  }
  async function borrarRuta(ruta) { try { if (storage) await storage.ref(ruta).delete(); } catch (e) { /* ya no estaba */ } }
  function miUid() { return uid; }

  /* ---------------------------------------------------------
     Notificaciones push
     --------------------------------------------------------- */
  function idSuscripcion(endpoint) { return btoa(endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(-40); }
  async function borrarSuscripcion(sub) {
    const json = sub.toJSON ? sub.toJSON() : sub;
    await db.collection('usuarios').doc(uid).collection('suscripciones').doc(idSuscripcion(json.endpoint)).delete();
  }
  async function guardarSuscripcion(sub) {
    const json = sub.toJSON ? sub.toJSON() : sub;
    const id = idSuscripcion(json.endpoint);
    await db.collection('usuarios').doc(uid).collection('suscripciones').doc(id).set({ endpoint: json.endpoint, keys: json.keys, creado: new Date().toISOString(), dispositivo: navigator.userAgent.slice(0, 120) });
  }
  async function borrarSuscripciones() {
    const snap = await db.collection('usuarios').doc(uid).collection('suscripciones').get();
    const lote = db.batch();
    snap.docs.forEach(d => lote.delete(d.ref));
    if (snap.docs.length) await lote.commit();
  }

  return {
    disponible, iniciarApp, iniciar, detener, programar, enviarTodo, eliminarViaje, salirDelViaje,
    guardarPerfil, actualizarPerfil, crearInvitacion, desactivarInvitacion, leerInvitacion, unirse, cambiarRol, quitarMiembro,
    guardarFamilia, apagarFamilia, leerFamilia,
    subirArchivo, bajarArchivo, urlArchivo, borrarArchivo, bajarRuta, borrarRuta, miUid, guardarSuscripcion, borrarSuscripcion, borrarSuscripciones,
    auth: () => { iniciarApp(); return auth; }, db: () => { iniciarApp(); return db; }
  };
})();
