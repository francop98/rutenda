/* =========================================================
   Tripbox — capa de datos
   Toda la app lee y escribe por R.db. Hay dos modos:
   - "nube": Firebase (Firestore + Storage), con sincronización
     en tiempo real y viajes compartidos (ver sincronizacion.js).
   - "local": todo en este dispositivo (localStorage + IndexedDB).
     Se usa si Firebase no está configurado.
   Los archivos se guardan siempre también en el dispositivo
   (IndexedDB) para poder abrirlos sin conexión.
   ========================================================= */
window.R = window.R || {};

R.db = (function () {
  const PREFIJO = 'tripbox_datos_v1_';
  const ROLES_ORG = ['organizador', 'coorganizador'];
  let modo = 'local';
  let uid = null;
  let usuario = null;
  let estado = { viajes: [], prefs: { monedaBase: 'ARS' }, listasValija: [], legado: [] };
  let pool = {};            // personas recién creadas que todavía no están en un viaje
  const oyentes = [];

  const U = () => R.util;

  /* ---------------------------------------------------------
     Normalización (también migra datos de versiones anteriores)
     --------------------------------------------------------- */
  function idYo() { return 'u_' + (uid || 'local'); }

  /** Reemplaza un id de persona por otro en todo el viaje. */
  function reemplazarId(v, viejo, nuevo) {
    const json = JSON.stringify(v).split(`"${viejo}"`).join(`"${nuevo}"`);
    const r = JSON.parse(json);
    Object.keys(v).forEach(k => delete v[k]);
    Object.assign(v, r);
  }

  function normalizarViaje(v) {
    v.perfil = Object.assign({
      internacional: false, internacionalManual: null, transporte: 'avion', alquilaAuto: false, menores: false,
      mascotas: false, viajaConMascota: false, accesibilidad: false, equipamiento: false, eventoEspecial: false, paquete: null
    }, v.perfil || {});
    if (!v.origen || typeof v.origen === 'string') v.origen = { nombre: v.origen || '' };
    if (!Array.isArray(v.destinos) || !v.destinos.length) {
      v.destinos = v.destino ? [{ id: 'dst_1', nombre: v.destino, pais: v.pais || '' }] : [];
    }
    v.destinos.forEach((d, i) => { if (!d.id) d.id = 'dst_' + (i + 1); });
    const principal = v.destinos.find(d => !d.soloDia) || v.destinos[0];
    v.destino = principal ? principal.nombre : (v.destino || '');
    v.pais = principal ? (principal.pais || '') : (v.pais || '');

    // Personas: antes eran globales con id 'yo'; ahora cada viaje tiene las suyas
    if ((v.participantes || []).includes('yo') || JSON.stringify(v.movimientos || []).includes('"yo"')) reemplazarId(v, 'yo', idYo());
    v.participantes = Array.isArray(v.participantes) && v.participantes.length ? v.participantes : [idYo()];
    v.personas = v.personas && typeof v.personas === 'object' && !Array.isArray(v.personas) ? v.personas : {};
    v.participantes.forEach(pid => {
      if (v.personas[pid]) return;
      const conocida = pool[pid] || buscarEnViajes(pid) || estado.legado.find(p => p.id === pid);
      if (pid === idYo()) v.personas[pid] = { id: pid, nombre: nombreYo(), color: colorDe(pid), uid: uid || 'local' };
      else v.personas[pid] = conocida ? limpiarPersona(conocida) : { id: pid, nombre: 'Viajero', color: colorDe(pid) };
    });
    // Mi nombre siempre actualizado
    Object.values(v.personas).forEach(p => { if (p.uid && p.uid === uid && usuario && usuario.nombre) p.nombre = usuario.nombre; });

    // Dueño, miembros y roles (en modo local, todo es tuyo)
    if (!v.owner) v.owner = uid || 'local';
    v.miembros = Array.isArray(v.miembros) && v.miembros.length ? v.miembros : [v.owner];
    v.roles = v.roles && typeof v.roles === 'object' ? v.roles : {};
    if (!v.roles[v.owner]) v.roles[v.owner] = 'organizador';

    v.tareas = v.tareas || {};
    v.tareasPropias = v.tareasPropias || [];
    v.itinerario = v.itinerario || [];
    v.documentos = v.documentos || [];
    v.movimientos = v.movimientos || [];
    v.cambios = v.cambios || [];
    // Valija: antes una sola por viaje, ahora una por persona
    if (!v.valijas || typeof v.valijas !== 'object') v.valijas = {};
    if (v.valija) {
      const mia = yoEnViaje(v) || idYo();
      if (!v.valijas[mia] && (v.valija.items || []).length) v.valijas[mia] = v.valija;
      delete v.valija;
    }
    if (R.recorrido) {
      if (!Array.isArray(v.recorrido)) v.recorrido = R.recorrido.construir(v.origen, v.destinos, [], v.perfil.transporte);
      v.recorrido.forEach(t => (t.segmentos || []).forEach(R.recorrido.normalizarSegmento));
      if (v.recorrido.length) {
        v.perfil.transporte = R.recorrido.medioPrincipal(v.recorrido);
        R.recorrido.recalcular(v);
      }
    }
    v.monedaBase = v.monedaBase || 'ARS';
    return v;
  }

  function limpiarPersona(p) { const r = { id: p.id, nombre: p.nombre, color: p.color || colorDe(p.id) }; if (p.uid) r.uid = p.uid; return r; }
  function colorDe(id) { return U() ? U().colorPersona(id) : '#2f7d7b'; }
  function nombreYo() { return (usuario && usuario.nombre) || 'Yo'; }
  function buscarEnViajes(pid) {
    for (const v of estado.viajes) if (v.personas && v.personas[pid]) return v.personas[pid];
    return null;
  }

  /* ---------------------------------------------------------
     Carga
     --------------------------------------------------------- */
  /** Carga los datos del usuario. En modo nube espera la primera sincronización. */
  async function cargar(u) {
    usuario = u || null;
    uid = u ? u.uid : null;
    modo = R.nube && R.nube.disponible() && u && !u.local ? 'nube' : 'local';
    if (modo === 'nube') {
      estado = { viajes: [], prefs: { monedaBase: 'ARS' }, listasValija: [], legado: [] };
      await R.nube.iniciar(uid, {
        alPerfil: perfil => {
          estado.prefs = Object.assign({ monedaBase: 'ARS' }, perfil.prefs || {});
          estado.listasValija = perfil.listasValija || [];
          avisar('perfil');
        },
        alViajes: () => avisar('viajes'),
        normalizar: normalizarViaje,
        lista: () => estado.viajes
      });
    } else {
      cargarLocal();
    }
    return estado;
  }

  function claveLocal() { return PREFIJO + (uid || 'local'); }
  function cargarLocal() {
    let datos = null;
    try { datos = JSON.parse(localStorage.getItem(claveLocal()) || 'null'); } catch (e) { datos = null; }
    datos = datos || {};
    estado = {
      viajes: Array.isArray(datos.viajes) ? datos.viajes : [],
      prefs: Object.assign({ monedaBase: 'ARS' }, datos.prefs || {}),
      listasValija: Array.isArray(datos.listasValija) ? datos.listasValija : [],
      legado: Array.isArray(datos.personas) ? datos.personas : []
    };
    estado.viajes.forEach(normalizarViaje);
  }
  function guardarLocal() {
    if (modo !== 'local') return;
    try {
      localStorage.setItem(claveLocal(), JSON.stringify({ version: 2, viajes: estado.viajes, prefs: estado.prefs, listasValija: estado.listasValija }));
    } catch (e) {
      console.error('Tripbox: error al guardar', e);
      if (U()) U().toast('No se pudo guardar. Revisá el espacio del navegador.');
    }
  }
  function guardar() { if (modo === 'local') guardarLocal(); else R.nube.guardarPerfil({ prefs: estado.prefs, listasValija: estado.listasValija }); }

  function alCambiar(fn) { oyentes.push(fn); }
  function avisar(que) { oyentes.forEach(fn => { try { fn(que); } catch (e) { console.error(e); } }); }

  /* ---------------------------------------------------------
     Viajes
     --------------------------------------------------------- */
  function viajes() { return estado.viajes; }
  function viaje(id) { return estado.viajes.find(v => v.id === id) || null; }
  function guardarViaje(v) {
    normalizarViaje(v);
    v.actualizado = new Date().toISOString();
    const i = estado.viajes.findIndex(x => x.id === v.id);
    if (i >= 0) estado.viajes[i] = v; else estado.viajes.push(v);
    // Las personas nuevas ya quedaron dentro del viaje
    Object.keys(v.personas).forEach(pid => { delete pool[pid]; });
    if (modo === 'local') guardarLocal(); else R.nube.programar(v);
    if (R.recordatorios) R.recordatorios.actualizar();
    return v;
  }
  async function eliminarViaje(id) {
    const v = viaje(id);
    if (!v) return;
    if (modo === 'nube') {
      if (v.owner === uid) await R.nube.eliminarViaje(v); else await R.nube.salirDelViaje(v);
    } else {
      for (const doc of v.documentos) { try { await eliminarArchivo(doc.archivoId); } catch (e) { /* ya no estaba */ } }
    }
    estado.viajes = estado.viajes.filter(x => x.id !== id);
    guardarLocal();
  }

  /* ---------------------------------------------------------
     Roles
     --------------------------------------------------------- */
  function rol(v) {
    if (!v) return 'organizador';
    if (modo === 'local') return 'organizador';
    return (v.roles && v.roles[uid]) || (v.owner === uid ? 'organizador' : 'viajero');
  }
  function puedeOrganizar(v) { return ROLES_ORG.includes(rol(v)); }
  function esDueno(v) { return modo === 'local' || v.owner === uid; }

  /* ---------------------------------------------------------
     Personas
     Cada viaje guarda las suyas (v.personas). Vos sos la persona
     del viaje vinculada a tu cuenta.
     --------------------------------------------------------- */
  function yo() { return { id: idYo(), nombre: nombreYo(), color: colorDe(idYo()), uid: uid || 'local', esYo: true }; }
  function yoEnViaje(v) {
    if (!v || !v.personas) return null;
    const p = Object.values(v.personas).find(x => x.uid && x.uid === (uid || 'local'));
    return p ? p.id : (v.participantes || []).includes(idYo()) ? idYo() : null;
  }
  function yoEn(v) { return yoEnViaje(v) || (v && v.participantes && v.participantes[0]) || idYo(); }
  function conFlag(p) { return p ? Object.assign({}, p, { esYo: !!(p.uid && p.uid === (uid || 'local')) || p.id === idYo() }) : null; }

  function persona(id) {
    if (id === idYo()) return yo();
    return conFlag(pool[id] || buscarEnViajes(id) || estado.legado.find(p => p.id === id) || null);
  }
  /** Todas las personas con las que viajaste (y vos). */
  function personas() {
    const r = {};
    estado.viajes.forEach(v => Object.values(v.personas || {}).forEach(p => { if (!r[p.id]) r[p.id] = conFlag(p); }));
    Object.values(pool).forEach(p => { if (!r[p.id]) r[p.id] = conFlag(p); });
    const lista = Object.values(r).filter(p => !p.esYo);
    return [yo()].concat(lista);
  }
  function crearPersona(nombre) {
    const id = U().id('per');
    pool[id] = { id, nombre: nombre.trim(), color: colorDe(id + nombre) };
    return conFlag(pool[id]);
  }
  /** Renombra a una persona en todos los viajes que podés editar. */
  function guardarPersona(p) {
    if (p.esYo || p.id === idYo()) {
      if (usuario) usuario.nombre = p.nombre;
    }
    estado.viajes.forEach(v => {
      const enViaje = v.personas && (v.personas[p.id] || (p.esYo && Object.values(v.personas).find(x => x.uid === uid)));
      if (!enViaje || !puedeOrganizar(v)) return;
      enViaje.nombre = p.nombre;
      guardarViaje(v);
    });
    if (pool[p.id]) pool[p.id].nombre = p.nombre;
    return p;
  }
  function eliminarPersona(id) { delete pool[id]; }

  /* ---------------------------------------------------------
     Preferencias y listas de valija (del usuario)
     --------------------------------------------------------- */
  function prefs() { return estado.prefs; }
  function guardarPrefs(cambios) { Object.assign(estado.prefs, cambios); guardar(); }
  function listasValija() { return estado.listasValija; }
  function guardarListaValija(l) {
    const i = estado.listasValija.findIndex(x => x.id === l.id);
    if (i >= 0) estado.listasValija[i] = l; else estado.listasValija.push(l);
    guardar();
  }
  function eliminarListaValija(id) { estado.listasValija = estado.listasValija.filter(l => l.id !== id); guardar(); }

  /* ---------------------------------------------------------
     Copia de seguridad
     --------------------------------------------------------- */
  function exportar() { return JSON.stringify({ version: 2, viajes: estado.viajes, prefs: estado.prefs, listasValija: estado.listasValija }, null, 2); }
  function importar(texto) {
    const nuevo = JSON.parse(texto);
    if (!nuevo || !Array.isArray(nuevo.viajes)) throw new Error('El archivo no parece una copia de Tripbox.');
    estado.legado = Array.isArray(nuevo.personas) ? nuevo.personas : [];
    nuevo.viajes.forEach(v => {
      if (modo === 'nube') { v.owner = uid; v.miembros = [uid]; v.roles = { [uid]: 'organizador' }; }
      guardarViaje(v);
    });
    if (nuevo.prefs) Object.assign(estado.prefs, nuevo.prefs);
    if (Array.isArray(nuevo.listasValija)) estado.listasValija = nuevo.listasValija;
    guardar();
  }

  /* ---------------------------------------------------------
     Archivos: IndexedDB en el dispositivo (+ Storage en la nube)
     --------------------------------------------------------- */
  const BASE_ARCHIVOS = 'tripbox_archivos';
  const ALMACEN = 'archivos';
  let conexion = null;
  function abrirBase() {
    if (conexion) return Promise.resolve(conexion);
    return new Promise((resolver, rechazar) => {
      if (!window.indexedDB) { rechazar(new Error('Este navegador no permite guardar archivos.')); return; }
      const pedido = indexedDB.open(BASE_ARCHIVOS, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN);
      pedido.onsuccess = () => { conexion = pedido.result; resolver(conexion); };
      pedido.onerror = () => rechazar(pedido.error);
    });
  }
  async function operacion(m, fn) {
    const base = await abrirBase();
    return new Promise((resolver, rechazar) => {
      const tx = base.transaction(ALMACEN, m);
      const pedido = fn(tx.objectStore(ALMACEN));
      tx.oncomplete = () => resolver(pedido ? pedido.result : undefined);
      tx.onerror = () => rechazar(tx.error);
      tx.onabort = () => rechazar(tx.error);
    });
  }
  const local = {
    guardar: (id, blob) => operacion('readwrite', s => s.put(blob, id)),
    obtener: id => operacion('readonly', s => s.get(id)),
    borrar: id => operacion('readwrite', s => s.delete(id))
  };
  /** Guarda un archivo. Con viajeId (modo nube) también lo sube a la nube. */
  async function guardarArchivo(id, blob, viajeId) {
    try { await local.guardar(id, blob); } catch (e) { if (modo === 'local') throw e; }
    if (modo === 'nube' && viajeId) await R.nube.subirArchivo(viajeId, id, blob);
  }
  async function obtenerArchivo(id, viajeId) {
    let blob = null;
    try { blob = await local.obtener(id); } catch (e) { blob = null; }
    if (!blob && modo === 'nube' && viajeId) {
      blob = await R.nube.bajarArchivo(viajeId, id);
      if (blob) { try { await local.guardar(id, blob); } catch (e) { /* sin espacio */ } }
    }
    return blob || null;
  }
  async function eliminarArchivo(id, viajeId) {
    try { await local.borrar(id); } catch (e) { /* ya no estaba */ }
    if (modo === 'nube' && viajeId) { try { await R.nube.borrarArchivo(viajeId, id); } catch (e) { /* ya no estaba */ } }
  }

  return {
    cargar, guardar, viajes, viaje, guardarViaje, eliminarViaje, alCambiar, normalizarViaje,
    modo: () => modo, uid: () => uid, rol, puedeOrganizar, esDueno,
    personas, persona, yo, yoEn, yoEnViaje, guardarPersona, crearPersona, eliminarPersona,
    prefs, guardarPrefs, exportar, importar, listasValija, guardarListaValija, eliminarListaValija,
    guardarArchivo, obtenerArchivo, eliminarArchivo, archivoLocal: local, PREFIJO, reemplazarId
  };
})();
