/* =========================================================
   Tripbox — escanear reservas con IA
   Le sacás una foto o subís el PDF de un pasaje, reserva,
   voucher o seguro: la función /api/escanear-reserva (Groq)
   lee los datos y Tripbox completa el formulario del paso
   para que lo revises antes de guardar.
   ========================================================= */
window.R = window.R || {};

R.escaneo = (function () {
  const U = R.util;
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

  function disponible() { return R.db.modo() === 'nube' && navigator.onLine !== false; }

  /* ---------- Preparar el archivo ---------- */
  function cargarPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = PDFJS;
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; ok(window.pdfjsLib); };
      s.onerror = () => mal(new Error('No se pudo leer el PDF'));
      document.head.appendChild(s);
    });
  }
  function imagenADataURL(blob, max) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, (max || 1600) / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }
  /** PDF: primero intenta leer el texto; si es una imagen escaneada, convierte la 1.ª página en foto. */
  async function prepararPdf(blob) {
    const pdfjs = await cargarPdfJs();
    const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
    let texto = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
      const pag = await pdf.getPage(i);
      const c = await pag.getTextContent();
      texto += c.items.map(x => x.str).join(' ') + '\n';
    }
    if (texto.replace(/\s/g, '').length > 80) return { texto: texto.slice(0, 15000) };
    const pag = await pdf.getPage(1);
    const vista = pag.getViewport({ scale: 1.6 });
    const c = document.createElement('canvas');
    c.width = vista.width; c.height = vista.height;
    await pag.render({ canvasContext: c.getContext('2d'), viewport: vista }).promise;
    return { imagen: c.toDataURL('image/jpeg', 0.82) };
  }

  /** Envía el archivo a la IA y devuelve los datos encontrados. */
  async function analizar(archivo, pista) {
    if (!disponible()) throw new Error('El escaneo funciona con tu cuenta en la nube y con conexión.');
    const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name || '');
    const contenido = esPdf ? await prepararPdf(archivo) : { imagen: await imagenADataURL(archivo, 1600) };
    const token = await R.nube.auth().currentUser.getIdToken();
    const r = await fetch('/api/escanear-reserva', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(Object.assign({ pista: pista || '' }, contenido))
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || 'No se pudo leer el archivo.');
    return datos;
  }

  /* ---------- Llevar lo leído a cada formulario ---------- */
  const t = x => (x || '').toString().trim();
  function aFormulario(base, r) {
    const d = {};
    if (base === 't_segmento' && Array.isArray(r.tramos) && r.tramos.length) {
      d.tramos = r.tramos.map((x, i) => ({
        sentido: r.tramos.length > 1 ? `Tramo ${i + 1}` : 'Tramo', desde: t(x.desde), hasta: t(x.hasta),
        desdeAeropuerto: t(x.desdeAeropuerto).toUpperCase().slice(0, 3), hastaAeropuerto: t(x.hastaAeropuerto).toUpperCase().slice(0, 3),
        empresa: t(x.empresa || r.empresa), numero: t(x.numero), fechaSalida: t(x.fechaSalida), horaSalida: t(x.horaSalida),
        fechaLlegada: t(x.fechaLlegada), horaLlegada: t(x.horaLlegada), escalas: 'Directo'
      }));
      if (r.equipaje) d.equipaje = /bodega|despach/i.test(r.equipaje) ? 'Mano + bodega' : /mano/i.test(r.equipaje) ? 'Solo de mano' : 'Sin definir';
      if (r.asientos) d.asientos = t(r.asientos);
    }
    if (base === 'a_reserva' && r.alojamiento) {
      const a = r.alojamiento;
      Object.assign(d, { nombre: t(a.nombre), direccion: t(a.direccion), contacto: t(a.telefono), checkinFecha: t(a.checkinFecha), checkinHora: t(a.checkinHora), checkoutFecha: t(a.checkoutFecha), checkoutHora: t(a.checkoutHora), cancelacionHasta: t(a.cancelacionHasta), desayuno: !!a.desayuno });
    }
    if (base === 'mv_auto' && r.auto) Object.assign(d, Object.fromEntries(Object.entries(r.auto).map(([k, x]) => [k, t(x)])));
    if (base === 'e_excursiones' && Array.isArray(r.actividades)) d.excursiones = r.actividades.map(a => ({ nombre: t(a.nombre), fecha: t(a.fecha), hora: t(a.hora), encuentro: t(a.lugar), codigo: t(r.codigo) }));
    if (base === 'p_seguro' && r.seguro) Object.assign(d, { compania: t(r.seguro.compania || r.empresa), poliza: t(r.seguro.poliza || r.codigo), telefono: t(r.seguro.telefono), desde: t(r.seguro.desde), hasta: t(r.seguro.hasta) });
    if (base === 'pq_paquete') Object.assign(d, { agencia: t(r.empresa), codigo: t(r.codigo) });
    if (r.codigo && !d.codigo && base !== 'p_seguro') d.codigo = t(r.codigo);
    // Sacar vacíos para no pisar lo que ya estaba cargado
    Object.keys(d).forEach(k => { if (d[k] === '' || d[k] == null) delete d[k]; });
    if (r.costo && Number(r.costo.monto) > 0) d.costo = { monto: Number(r.costo.monto), moneda: t(r.costo.moneda).toUpperCase() || 'ARS' };
    return d;
  }

  /** ¿A qué paso de la guía corresponde lo escaneado? */
  function elegirPaso(v, r) {
    const lista = R.motor.lista(v);
    const tipo = r.tipo || '';
    const medio = { vuelo: 'avion', micro: 'micro', tren: 'tren', barco: 'barco' }[tipo];
    if (medio || (r.tramos && r.tramos.length)) {
      const segs = lista.filter(x => x.base === 't_segmento');
      const primero = (r.tramos || [])[0] || {}, ultimo = (r.tramos || []).slice(-1)[0] || {};
      const parecido = (a, b) => a && b && (normal(a).includes(normal(b)) || normal(b).includes(normal(a)));
      return (segs.find(x => parecido(x.ctx.seg.desde.nombre, primero.desde) && parecido(x.ctx.seg.hasta.nombre, ultimo.hasta))
        || segs.find(x => parecido(x.ctx.seg.hasta.nombre, ultimo.hasta) && (!medio || x.ctx.seg.medio === medio))
        || segs.find(x => (!medio || x.ctx.seg.medio === medio) && !R.motor.resuelta(v, x.id))
        || segs[0] || {}).id || null;
    }
    if (tipo === 'alojamiento') {
      const alojs = lista.filter(x => x.base === 'a_reserva');
      const ciudad = r.alojamiento && (r.alojamiento.ciudad || r.alojamiento.direccion);
      const f = r.alojamiento && r.alojamiento.checkinFecha;
      const palabras = n => normal(n).split(/[\s,.-]+/).filter(x => x.length > 3 && !['san', 'santa', 'puerto', 'ciudad', 'villa'].includes(x));
      const coincide = x => ciudad && palabras(x.ctx.destino.nombre).some(p => normal(ciudad).includes(p));
      return (alojs.find(coincide)
        || alojs.find(x => f && x.ctx.destino.desde === f)
        || alojs.find(x => !R.motor.resuelta(v, x.id)) || alojs[0] || {}).id || null;
    }
    const porTipo = { auto: 'mv_auto', excursion: 'e_excursiones', seguro: 'p_seguro', paquete: 'pq_paquete' }[tipo];
    return porTipo && lista.some(x => x.id === porTipo) ? porTipo : null;
  }

  /** Botón "Escanear" desde Documentos o Completá los datos. */
  function escanearYAbrir(v, tareaId) {
    if (!disponible()) { U.toast('El escaneo funciona con tu cuenta en la nube y con conexión.'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = async () => {
      const archivo = input.files[0];
      if (!archivo) return;
      U.toast('Leyendo el archivo… 🔎');
      try {
        const r = await analizar(archivo);
        const id = tareaId || elegirPaso(v, r);
        if (!id) {
          U.toast('Leí el archivo, pero no encontré a qué paso corresponde. Lo guardo en Documentos.');
          await R.documentos.guardarArchivos(v, [archivo], { categoria: 'otro' });
          R.db.guardarViaje(v); R.app.refrescar();
          return;
        }
        const tarea = R.motor.lista(v).find(x => x.id === id);
        R.formularios.abrir(v, id, { prellenar: aFormulario(tarea.base, r), archivo, aviso: 'Completé lo que pude leer: revisalo antes de guardar.' });
      } catch (e) {
        U.toast(e.message || 'No se pudo leer el archivo.');
      }
    };
    input.click();
  }

  return { disponible, analizar, aFormulario, elegirPaso, escanearYAbrir };
})();
