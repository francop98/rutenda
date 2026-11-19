/* =========================================================
   Rutenda — sumar una reserva al itinerario
   Pegás el mail de confirmación o subís el PDF: se lee en el
   celular con reglas (sin IA, no se manda a ningún lado),
   te muestra lo que encontró y lo guardás con un toque.
   Si no se puede leer, el archivo queda en Archivos.
   ========================================================= */
window.R = window.R || {};

R.importar = (function () {
  const U = R.util;
  const { esc } = U;
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const t = x => (x || '').toString().trim();

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
  async function textoDePdf(blob) {
    const pdfjs = await cargarPdfJs();
    const pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
    let texto = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      let ultY = null;
      texto += c.items.map(x => { const y = x.transform ? Math.round(x.transform[5]) : null; const salto = ultY != null && y != null && Math.abs(y - ultY) > 3; ultY = y; return (salto ? '\n' : ' ') + x.str; }).join('') + '\n';
    }
    return texto;
  }

  /* ---------- Leer ---------- */
  function opciones(v) {
    const ciudades = {};
    if (R.AEROPUERTOS_DATOS) R.AEROPUERTOS_DATOS.forEach(a => { ciudades[a[0]] = a[2]; });
    return {
      esAeropuerto: c => !!(R.aeropuertos && R.aeropuertos.porCodigo(c)),
      ciudadDe: c => ciudades[c] || '',
      anio: v && v.fechaInicio ? Number(v.fechaInicio.slice(0, 4)) : new Date().getFullYear()
    };
  }
  function leerTexto(texto, v) { const r = R.lector.leer(texto, opciones(v)); return r.util ? r : null; }
  /** Un PDF con texto se lee; una foto o un PDF escaneado no (devuelve null). */
  async function leerArchivo(archivo, v) {
    const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name || '');
    if (!esPdf) return null;
    const texto = await textoDePdf(archivo);
    if (texto.replace(/\s/g, '').length < 40) return null;
    return leerTexto(texto, v);
  }

  /* ---------- Lo leído → cosas del itinerario ---------- */
  /** Devuelve { items: [...], alojamientos: [...], costo } listo para guardar. */
  function convertir(v, r) {
    const items = [], alojamientos = [];
    const codigo = t(r.codigo);
    if (Array.isArray(r.tramos) && r.tramos.length) {
      const tipo = r.tipo === 'micro' ? 'micro' : r.tipo === 'tren' ? 'tren' : r.tipo === 'barco' ? 'barco' : 'vuelo';
      r.tramos.forEach(x => {
        const desde = t(x.desde) || t(x.desdeAeropuerto), hasta = t(x.hasta) || t(x.hastaAeropuerto);
        items.push(R.agenda.nuevoItem({
          tipo, fecha: t(x.fechaSalida), hora: t(x.horaSalida), desde, hasta,
          horaLlegada: t(x.horaLlegada), fechaLlegada: t(x.fechaLlegada) && t(x.fechaLlegada) !== t(x.fechaSalida) ? t(x.fechaLlegada) : '',
          empresa: t(x.empresa || r.empresa), numero: t(x.numero), codigo,
          aeroDesde: tipo === 'vuelo' ? t(x.desdeAeropuerto) : '', aeroHasta: tipo === 'vuelo' ? t(x.hastaAeropuerto) : '',
          titulo: desde || hasta ? `${desde || '?'} → ${hasta || '?'}` : R.agenda.tipo(tipo).nombre,
          nota: [r.asientos ? 'Asientos: ' + r.asientos : '', r.equipaje ? 'Equipaje: ' + r.equipaje : ''].filter(Boolean).join(' · ')
        }));
      });
    } else if (r.tipo === 'alojamiento' && r.alojamiento) {
      const a = r.alojamiento;
      alojamientos.push({
        id: U.id('al'), nombre: t(a.nombre) || 'Alojamiento', direccion: t(a.direccion),
        desde: t(a.checkinFecha), hasta: t(a.checkoutFecha), checkin: t(a.checkinHora), checkout: t(a.checkoutHora), codigo,
        nota: [a.telefono ? 'Tel: ' + a.telefono : '', a.desayuno ? 'Desayuno incluido' : '', a.cancelacionHasta ? 'Cancelación gratis hasta el ' + U.fmtFecha(a.cancelacionHasta, 'corto') : ''].filter(Boolean).join(' · ')
      });
    } else if (r.tipo === 'excursion' && (r.actividades || []).length) {
      r.actividades.forEach(x => items.push(R.agenda.nuevoItem({ tipo: 'excursion', titulo: t(x.nombre) || 'Excursión', fecha: t(x.fecha), hora: t(x.hora), lugar: t(x.lugar), codigo })));
    } else if (r.tipo === 'auto' && r.auto) {
      const a = r.auto;
      items.push(R.agenda.nuevoItem({ tipo: 'auto', titulo: 'Retiro del auto' + (a.rentadora ? ' · ' + a.rentadora : ''), fecha: t(a.retiroFecha), hora: t(a.retiroHora), empresa: t(a.rentadora), codigo }));
      if (a.devolucionFecha) items.push(R.agenda.nuevoItem({ tipo: 'auto', titulo: 'Devolución del auto' + (a.rentadora ? ' · ' + a.rentadora : ''), fecha: t(a.devolucionFecha), hora: t(a.devolucionHora), empresa: t(a.rentadora), codigo }));
    }
    // Una fecha fuera del viaje queda como idea sin día: la acomodás vos
    // El gasto se ofrece solo si está en la moneda del viaje (si no, hace falta la cotización: lo cargás en Gastos)
    let costo = r.costo && Number(r.costo.monto) > 0 ? { monto: Number(r.costo.monto), moneda: t(r.costo.moneda).toUpperCase() || v.monedaBase } : null;
    if (costo && costo.moneda !== v.monedaBase) costo = null;
    return { items, alojamientos, costo, seguro: r.tipo === 'seguro' ? r.seguro : null };
  }

  function filaVista(it) {
    const tp = R.agenda.tipo(it.tipo);
    const cuando = [it.fecha ? U.fmtFecha(it.fecha, 'dia') : 'sin día', it.hora].filter(Boolean).join(' · ');
    const extra = [it.empresa, it.numero, it.horaLlegada ? 'llega ' + it.horaLlegada : ''].filter(Boolean).join(' · ');
    return `<div class="imp-fila"><span aria-hidden="true">${tp.icono}</span><span><strong>${esc(it.titulo)}</strong><small>${esc(cuando)}${extra ? ' · ' + esc(extra) : ''}</small></span></div>`;
  }

  /**
   * Muestra lo leído y lo guarda en el viaje si confirmás.
   * Devuelve false si no había nada para llevar al itinerario.
   */
  function llevar(v, r, archivo, op) {
    const o = op || {};
    const c = convertir(v, r);
    if (c.seguro) {
      // El seguro no va al itinerario: queda como pendiente hecho y el archivo en Archivos
      U.cerrarModal();
      const s = c.seguro;
      v.emergencias = Object.assign({}, v.emergencias, { seguro: { compania: t(s.compania), poliza: t(s.poliza), telefono: t(s.telefono) } });
      R.pendientes.sumar(v, `Seguro de viaje${s.compania ? ' · ' + s.compania : ''}${s.poliza ? ' (póliza ' + s.poliza + ')' : ''}${s.telefono ? ' · Asistencia: ' + s.telefono : ''}`);
      v.pendientes[v.pendientes.length - 1].hecho = true;
      (archivo ? R.documentos.guardarArchivos(v, [archivo], { categoria: 'seguro' }) : Promise.resolve()).then(() => { R.db.guardarViaje(v); R.app.refrescar(); });
      U.toast('Guardé el seguro: el teléfono de asistencia queda en Archivos → Emergencias.');
      return true;
    }
    if (!c.items.length && !c.alojamientos.length) return false;
    const dias = R.agenda.dias(v);
    const fuera = c.items.filter(it => it.fecha && dias.length && !dias.includes(it.fecha)).length;
    const yo = R.db.yoEn(v);
    U.modal({
      titulo: '🎫 Esto encontré',
      subtitulo: o.aviso || 'Revisalo. Después lo podés cambiar tocándolo en el itinerario.',
      cuerpo: `
        <div class="imp-vista">
          ${c.items.map(filaVista).join('')}
          ${c.alojamientos.map(a => `<div class="imp-fila"><span aria-hidden="true">🛏️</span><span><strong>${esc(a.nombre)}</strong><small>${a.desde ? 'Entrás ' + esc(U.fmtFecha(a.desde, 'dia')) : 'Sin fecha de entrada'}${a.hasta ? ' · salís ' + esc(U.fmtFecha(a.hasta, 'dia')) : ''}${a.direccion ? ' · ' + esc(a.direccion) : ''}</small></span></div>`).join('')}
        </div>
        ${fuera ? `<p class="ayuda">⚠️ ${fuera === 1 ? 'Una fecha queda' : 'Algunas fechas quedan'} fuera de las fechas del viaje. Se guarda igual y se suma ese día.</p>` : ''}
        ${c.costo ? `<label class="check"><input type="checkbox" id="impCosto" checked> Cargar el gasto: ${esc(U.fmtMoneda(c.costo.monto, c.costo.moneda))} (lo pagaste vos)</label>` : ''}
        ${archivo ? `<p class="ayuda">📎 ${esc(archivo.name || 'El archivo')} queda guardado junto con la reserva.</p>` : ''}`,
      acciones: [
        { texto: 'Cancelar' },
        { texto: 'Guardar', clase: 'btn-primario', onClick: f => { guardar(f.querySelector('#impCosto')); } }
      ]
    });
    async function guardar(chkCosto) {
      c.items.forEach((it, i) => {
        // Si el tramo ya estaba en el recorrido (cargado sin datos), se completa ese y no se duplica
        const ya = R.agenda.parecido(v, it);
        if (ya) {
          const id = ya.id;
          c.items[i] = it = Object.assign({}, ya, Object.fromEntries(Object.entries(it).filter(([k, x]) => x && !['id', 'creado', 'titulo', 'desde', 'hasta'].includes(k))), { id, pendiente: false, sinMedio: false });
        }
        R.agenda.guardarItem(v, it);
      });
      c.alojamientos.forEach(a => {
        // Si en "Dónde dormís" ya estaba ese alojamiento sin nombre, se completa ese (no se duplica)
        const hueco = (v.alojamientos || []).find(x => x.deArmado && !x.nombre && a.desde && x.desde <= a.desde && a.desde < x.hasta);
        if (hueco) Object.assign(a, { id: hueco.id, deArmado: true, destinoId: hueco.destinoId, ciudad: hueco.ciudad });
        R.agenda.guardarAlojamiento(v, a);
      });
      const principal = c.items[0] || c.alojamientos[0];
      if (c.costo && chkCosto && chkCosto.checked && principal) {
        v.movimientos.push({
          id: U.id('mov'), tipo: 'gasto', fecha: U.hoyISO(), creado: new Date().toISOString(),
          moneda: c.costo.moneda, cotizacion: 1, monto: c.costo.monto, persona: yo,
          concepto: principal.titulo || principal.nombre, categoria: c.alojamientos.length ? 'alojamiento' : c.items[0].tipo === 'excursion' ? 'actividades' : 'transporte',
          division: { modo: 'igual', entre: v.participantes.slice(), montos: {} }, origenItem: principal.id
        });
      }
      if (archivo && principal) {
        try { await R.documentos.guardarArchivos(v, [archivo], { categoria: c.alojamientos.length ? 'alojamiento' : 'pasaje', itemId: principal.id }); } catch (e) { /* el archivo es opcional */ }
      }
      R.db.guardarViaje(v);
      if (o.alGuardar) o.alGuardar();
      if (!/\/itinerario$/.test(location.hash)) location.hash = `#viaje/${v.id}/itinerario`;
      R.app.refrescar();
      U.toast('Listo, quedó en el itinerario. 🗓️');
    }
    return true;
  }

  /** Cartel para pegar el texto de una reserva. */
  function pegar(v) {
    const { el } = U.modal({
      titulo: '📋 Pegar una reserva',
      subtitulo: 'Copiá el mail de confirmación (o el texto del voucher) y pegalo acá.',
      cuerpo: `<label class="campo completo"><textarea id="prTexto" rows="8" placeholder="Ej: Código de reserva ABC123 · AR1672 Buenos Aires (AEP) → Bariloche (BRC) 12/12 07:15…"></textarea></label>
        <p class="ayuda">Se lee en el celular: no se manda a ningún lado.</p>`,
      acciones: [{ texto: 'Cancelar' }, { texto: 'Leer', clase: 'btn-primario', onClick: () => {
        const texto = el.querySelector('#prTexto').value;
        if (texto.trim().length < 15) { U.toast('Pegá el texto de la reserva.'); return false; }
        const r = leerTexto(texto, v);
        if (!r || !llevarSinCerrar(v, r)) { U.toast('No encontré datos de una reserva. Probá con el mail completo, o cargalo a mano con "+ Agregar".'); return false; }
      } }]
    });
    setTimeout(() => { const x = el.querySelector('#prTexto'); if (x) x.focus(); }, 60);
  }
  // U.modal cierra el cartel al volver del onClick: abrimos la vista previa un instante después
  function llevarSinCerrar(v, r, archivo) {
    const c = convertir(v, r);
    if (!c.seguro && !c.items.length && !c.alojamientos.length) return false;
    setTimeout(() => llevar(v, r, archivo), 30);
    return true;
  }

  /** Subir el PDF de una reserva: si se puede leer, lo suma; si no, queda en Archivos. */
  function archivo(v) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      U.toast('Leyendo… 🔎');
      let r = null;
      try { r = await leerArchivo(f, v); } catch (e) { r = null; }
      if (r && llevar(v, r, f)) return;
      await R.documentos.guardarArchivos(v, [f], { categoria: 'otro' });
      R.db.guardarViaje(v); R.app.refrescar();
      U.toast('No pude leer los datos: lo guardé en Archivos. Cargalo a mano con "+ Agregar".');
    };
    input.click();
  }

  /** "Sumar una reserva": pegar el mail o subir el PDF. */
  function elegir(v) {
    const { el } = U.modal({
      titulo: '🎫 Sumar una reserva',
      subtitulo: 'Pasaje, alojamiento, excursión o alquiler de auto.',
      cuerpo: `<div class="cargar-reserva">
        <button type="button" class="btn btn-suave btn-bloque" data-r="pegar">📋 Pegar el mail de confirmación</button>
        <button type="button" class="btn btn-suave btn-bloque" data-r="archivo">📄 Subir el PDF</button>
        <p class="ayuda">Se lee en el celular y te muestra lo que encontró antes de guardar.</p></div>`
    });
    el.querySelector('[data-r="pegar"]').onclick = () => { U.cerrarModal(); setTimeout(() => pegar(v), 30); };
    el.querySelector('[data-r="archivo"]').onclick = () => { U.cerrarModal(); archivo(v); };
  }

  return { elegir, pegar, archivo, leerTexto, leerArchivo, convertir, llevar, cargarPdfJs, textoDePdf };
})();
