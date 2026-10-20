/* =========================================================
   Tripbox — capa de datos
   Hoy: localStorage (datos) + IndexedDB (archivos adjuntos).
   Toda la app pasa por R.db, así que más adelante se puede
   sumar Firebase (Auth + Firestore + Storage) cambiando solo
   este archivo, igual que en DBTYCS.
   ========================================================= */
window.R = window.R || {};

R.db = (function () {
  const PREFIJO = 'tripbox_datos_v1_';
  let CLAVE = PREFIJO + 'local';
  let datos = null;

  function porDefecto() {
    return {
      version: 1,
      viajes: [],
      personas: [{ id: 'yo', nombre: 'Yo', esYo: true, color: '#2f7d7b' }],
      prefs: { monedaBase: 'ARS' }
    };
  }

  function normalizar(d) {
    const base = porDefecto();
    const r = Object.assign({}, base, d || {});
    r.viajes = Array.isArray(r.viajes) ? r.viajes : [];
    r.personas = Array.isArray(r.personas) ? r.personas : base.personas;
    r.prefs = Object.assign({}, base.prefs, r.prefs || {});
    r.listasValija = Array.isArray(r.listasValija) ? r.listasValija : [];
    if (!r.personas.some(p => p.esYo)) r.personas.unshift(base.personas[0]);
    r.viajes.forEach(normalizarViaje);
    return r;
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
    v.participantes = Array.isArray(v.participantes) ? v.participantes : ['yo'];
    v.tareas = v.tareas || {};
    v.tareasPropias = v.tareasPropias || [];
    v.itinerario = v.itinerario || [];
    v.documentos = v.documentos || [];
    v.movimientos = v.movimientos || [];
    v.cambios = v.cambios || [];
    v.valija = v.valija || { items: [], listas: [] };
    if (R.recorrido) {
      if (!Array.isArray(v.recorrido)) v.recorrido = R.recorrido.construir(v.origen, v.destinos, [], v.perfil.transporte);
      if (v.recorrido.length) v.perfil.transporte = R.recorrido.medioPrincipal(v.recorrido);
    }
    v.monedaBase = v.monedaBase || 'ARS';
    return v;
  }

  /** Carga los datos del usuario indicado (cada cuenta tiene su propio espacio). */
  function cargar(usuario) {
    if (usuario) CLAVE = PREFIJO + usuario.uid;
    try {
      const texto = localStorage.getItem(CLAVE);
      datos = normalizar(texto ? JSON.parse(texto) : null);
    } catch (e) {
      console.warn('Tripbox: no se pudieron leer los datos guardados', e);
      datos = porDefecto();
    }
    if (usuario) {
      const yo = datos.personas.find(p => p.esYo);
      if (yo.nombre !== usuario.nombre) { yo.nombre = usuario.nombre; guardar(); }
    }
    return datos;
  }

  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(datos));
    } catch (e) {
      console.error('Tripbox: error al guardar', e);
      if (R.util) R.util.toast('No se pudo guardar. Revisá el espacio del navegador.');
    }
  }

  function d() { return datos || cargar(); }

  /* ---------- Viajes ---------- */
  function viajes() { return d().viajes; }
  function viaje(id) { return d().viajes.find(v => v.id === id) || null; }
  function guardarViaje(v) {
    normalizarViaje(v);
    v.actualizado = new Date().toISOString();
    const lista = d().viajes;
    const i = lista.findIndex(x => x.id === v.id);
    if (i >= 0) lista[i] = v; else lista.push(v);
    guardar();
    return v;
  }
  async function eliminarViaje(id) {
    const v = viaje(id);
    if (v) {
      for (const doc of v.documentos) {
        try { await eliminarArchivo(doc.archivoId); } catch (e) { /* ya no existía */ }
      }
    }
    d().viajes = d().viajes.filter(x => x.id !== id);
    guardar();
  }

  /* ---------- Personas (compañeros de viaje, globales) ---------- */
  function personas() { return d().personas; }
  function persona(id) { return d().personas.find(p => p.id === id) || null; }
  function yo() { return d().personas.find(p => p.esYo); }
  function guardarPersona(p) {
    const lista = d().personas;
    const i = lista.findIndex(x => x.id === p.id);
    if (i >= 0) lista[i] = p; else lista.push(p);
    guardar();
    return p;
  }
  function crearPersona(nombre) {
    const id = R.util.id('per');
    return guardarPersona({ id, nombre: nombre.trim(), color: R.util.colorPersona(id + nombre) });
  }
  function eliminarPersona(id) {
    d().personas = d().personas.filter(p => p.id !== id || p.esYo);
    guardar();
  }

  /* ---------- Listas de valija personalizadas (del usuario) ---------- */
  function listasValija() { return d().listasValija; }
  function guardarListaValija(l) {
    const lista = d().listasValija;
    const i = lista.findIndex(x => x.id === l.id);
    if (i >= 0) lista[i] = l; else lista.push(l);
    guardar();
  }
  function eliminarListaValija(id) { d().listasValija = d().listasValija.filter(l => l.id !== id); guardar(); }

  function prefs() { return d().prefs; }
  function guardarPrefs(cambios) { Object.assign(d().prefs, cambios); guardar(); }

  /* ---------- Copia de seguridad ---------- */
  function exportar() { return JSON.stringify(d(), null, 2); }
  function importar(texto) {
    const nuevo = JSON.parse(texto);
    if (!nuevo || !Array.isArray(nuevo.viajes)) throw new Error('El archivo no parece una copia de Tripbox.');
    datos = normalizar(nuevo);
    guardar();
  }

  /* ---------- Archivos (IndexedDB) ---------- */
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
  async function operacion(modo, fn) {
    const base = await abrirBase();
    return new Promise((resolver, rechazar) => {
      const tx = base.transaction(ALMACEN, modo);
      const pedido = fn(tx.objectStore(ALMACEN));
      tx.oncomplete = () => resolver(pedido ? pedido.result : undefined);
      tx.onerror = () => rechazar(tx.error);
      tx.onabort = () => rechazar(tx.error);
    });
  }
  function guardarArchivo(id, blob) { return operacion('readwrite', s => s.put(blob, id)); }
  function obtenerArchivo(id) { return operacion('readonly', s => s.get(id)); }
  function eliminarArchivo(id) { return operacion('readwrite', s => s.delete(id)); }

  return {
    cargar, guardar, viajes, viaje, guardarViaje, eliminarViaje,
    personas, persona, yo, guardarPersona, crearPersona, eliminarPersona,
    prefs, guardarPrefs, exportar, importar, listasValija, guardarListaValija, eliminarListaValija,
    guardarArchivo, obtenerArchivo, eliminarArchivo
  };
})();
