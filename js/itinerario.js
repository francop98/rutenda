/* =========================================================
   Rutenda — pestaña Itinerario
   - Cronograma del viaje (con avisos) y su editor.
   - Día por día: dónde amanecés, traslados con horarios,
     check-in / check-out, escapadas, actividades, clima y
     dónde dormís.
   - Mapa, compartir (WhatsApp / PDF) y agregar al calendario.
   - "Hoy" para el modo viaje.
   ========================================================= */
window.R = window.R || {};

R.itinerario = (function () {
  const U = R.util;
  const { esc } = U;
  const C = () => R.recorrido;

  const TIPOS = [
    { id: 'actividad', nombre: 'Actividad', icono: '🌄' },
    { id: 'comida', nombre: 'Comida', icono: '🍽️' },
    { id: 'traslado', nombre: 'Traslado', icono: '🚕' },
    { id: 'alojamiento', nombre: 'Alojamiento', icono: '🏡' },
    { id: 'vuelo', nombre: 'Viaje', icono: '✈️' },
    { id: 'otro', nombre: 'Otro', icono: '📌' }
  ];
  function tipo(id) { return TIPOS.find(t => t.id === id) || TIPOS[TIPOS.length - 1]; }

  function diasDelViaje(v) {
    if (!v.fechaInicio) return [];
    const fin = v.fechaFin || v.fechaInicio;
    const total = Math.min(Math.max(0, U.diasEntre(v.fechaInicio, fin)), 120);
    const r = [];
    for (let i = 0; i <= total; i++) r.push(U.sumarDias(v.fechaInicio, i));
    return r;
  }

  function datosAloj(v, estadiaId) {
    const t = v.tareas && v.tareas['a_reserva__' + estadiaId];
    return t && t.datos ? t.datos : null;
  }
  function documentosDe(v, tareaId) { return (v.documentos || []).filter(d => d.tareaId === tareaId); }

  /**
   * Arma un día: { fecha, numero, amaneces, dormis, items[], lugarPrincipal, clima }
   * items: { hora, icono, titulo, sub, clase, evento?, docs[] }
   */
  function diaDe(v, fecha) {
    const segs = C().todosLosSegmentos(v.recorrido);
    const est = C().estadias(v);
    const items = [];
    const enEstadia = est.find(e => e.desde && e.hasta && e.desde < fecha && fecha <= e.hasta);
    const durmiendo = est.find(e => e.desde && e.hasta && e.desde <= fecha && fecha < e.hasta);

    segs.forEach(x => {
      const s = x.seg;
      const m = C().medio(s.medio);
      const det = R.cronogramaEditor.datosSegmento(v, s);
      const tareaId = 't_segmento__' + s.id;
      const docs = documentosDe(v, tareaId);
      if (s.sale.fecha === fecha) {
        const llega = C().fechaLlega(s);
        items.push({
          hora: s.sale.hora, icono: m.icono, clase: 'ev-traslado',
          titulo: `${s.desde.nombre} → ${s.hasta.nombre}`,
          sub: [`${m.nombre}${s.medio === 'otro' && s.medioOtro ? ' (' + s.medioOtro + ')' : ''}`, llega && llega !== fecha ? `llega ${U.fmtFecha(llega, 'dia')}${s.llega.hora ? ' ' + s.llega.hora : ''}` : (s.llega.hora ? `llega ${s.llega.hora}` : ''), det, s.estado !== 'confirmado' ? 'sin confirmar' : ''].filter(Boolean).join(' · '),
          docs, tareaId
        });
      } else if (C().fechaLlega(s) === fecha && s.sale.fecha && s.sale.fecha !== fecha) {
        items.push({ hora: s.llega.hora, icono: s.medio === 'avion' ? '🛬' : '📍', clase: 'ev-traslado', titulo: `Llegás a ${s.hasta.nombre}`, sub: `${m.icono} desde ${s.desde.nombre}`, docs: [], tareaId });
      }
    });

    est.forEach(e => {
      const a = datosAloj(v, e.id);
      if (a && a.checkinFecha === fecha) items.push({ hora: a.checkinHora, icono: '🏨', clase: 'ev-aloj', titulo: `Check-in · ${a.nombre || e.nombre}`, sub: [a.direccion, a.codigo ? 'Cód. ' + a.codigo : ''].filter(Boolean).join(' · '), docs: documentosDe(v, 'a_reserva__' + e.id) });
      if (a && a.checkoutFecha === fecha) items.push({ hora: a.checkoutHora, icono: '🧳', clase: 'ev-aloj', titulo: `Check-out · ${a.nombre || e.nombre}`, sub: a.direccion || '', docs: [] });
    });

    (v.destinos || []).filter(d => d.soloDia && d.nombre && d.fecha === fecha && !d.fechaPendiente).forEach(d => {
      items.push({ hora: '', icono: '☀️', clase: 'ev-escapada', titulo: `Escapada a ${d.nombre}`, sub: 'Volvés en el día', docs: documentosDe(v, 'e_escapada__' + d.id) });
    });

    (v.itinerario || []).filter(e => e.fecha === fecha && !(e.origen || '').startsWith('t_segmento__')).forEach(e => {
      items.push({ hora: e.hora, icono: tipo(e.tipo).icono, clase: 'ev-propio', titulo: e.titulo, sub: [e.lugar && '📍 ' + e.lugar, e.confirmacion && 'Cód. ' + e.confirmacion, e.notas].filter(Boolean).join(' · '), evento: e.id, origen: e.origen, docs: [] });
    });

    items.sort((a, b) => (a.hora || '99:99').localeCompare(b.hora || '99:99'));

    // Dónde amanecés y dónde dormís
    let amaneces = '';
    if (fecha === v.fechaInicio) amaneces = v.origen && v.origen.nombre ? `Arrancás en casa (${v.origen.nombre})` : '';
    else if (enEstadia) amaneces = `Amanecés en ${enEstadia.nombre}`;
    else {
      const nocturno = segs.find(x => x.seg.sale.fecha && x.seg.sale.fecha < fecha && C().fechaLlega(x.seg) >= fecha);
      if (nocturno) amaneces = `Amanecés viajando en ${C().medio(nocturno.seg.medio).nombre.toLowerCase()}`;
    }
    let dormis = null;
    if (durmiendo) {
      const a = datosAloj(v, durmiendo.id);
      dormis = { icono: '🛏️', texto: a && a.nombre ? `${a.nombre}, ${durmiendo.nombre}` : `${durmiendo.nombre} · alojamiento a reservar`, direccion: a && a.direccion ? a.direccion : '', falta: !a };
    } else {
      const nocheViajando = segs.find(x => x.seg.sale.fecha && x.seg.sale.fecha <= fecha && C().fechaLlega(x.seg) > fecha);
      if (nocheViajando) dormis = { icono: '🌙', texto: `Noche viajando en ${C().medio(nocheViajando.seg.medio).nombre.toLowerCase()}`, direccion: '' };
      else if (fecha === v.fechaFin && (v.recorrido || []).some(t => t.tipo === 'vuelta')) dormis = { icono: '🏠', texto: 'En casa', direccion: '' };
    }
    const lugarPrincipal = durmiendo ? durmiendo.lugar : (enEstadia ? enEstadia.lugar : null);
    return { fecha, numero: v.fechaInicio ? U.diasEntre(v.fechaInicio, fecha) + 1 : null, amaneces, dormis, items, lugar: lugarPrincipal, lugarNombre: (durmiendo || enEstadia || {}).nombre || '' };
  }

  /* ---------------------------------------------------------
     Render
     --------------------------------------------------------- */
  function render(v, cont) {
    const dias = diasDelViaje(v);
    const avisos = C().validar(v).filter(a => a.nivel !== 'info' || /Faltan|Falta/.test(a.texto));
    const hoy = U.hoyISO();
    const fuera = (v.itinerario || []).filter(e => !(e.origen || '').startsWith('t_segmento__') && (!e.fecha || !dias.includes(e.fecha)));

    cont.innerHTML = `
      <div class="bloque-cab cab-seccion">
        <div>
          <h2 class="titulo-seccion">Itinerario</h2>
          <p class="texto-suave">${dias.length ? `${U.plural(dias.length, 'día', 'días')} de viaje, armados desde tu cronograma.` : 'Cuando cargues las fechas del cronograma, te armo los días automáticamente.'}</p>
        </div>
        <div class="acciones-fila">
          <button class="btn btn-suave btn-chico solo-org" data-a="cronograma">📅 Cronograma</button>
          <button class="btn btn-suave btn-chico" data-a="pdf">📄 PDF</button>
          <button class="btn btn-suave btn-chico" data-a="compartir">↗ Compartir</button>
          <button class="btn btn-primario btn-chico solo-org" data-a="nuevo">+ Actividad</button>
        </div>
      </div>

      ${avisos.length ? `<div class="cr-avisos bloque">${avisos.map(a => `<p class="cr-aviso cr-${a.nivel}">${a.nivel === 'error' ? '⛔' : a.nivel === 'aviso' ? '⚠️' : 'ℹ️'} ${esc(a.texto)}</p>`).join('')}
        <button class="btn btn-texto btn-chico solo-org" data-a="cronograma2">Corregir en el cronograma →</button></div>` : ''}

      <details class="bloque plegable" ${dias.length ? '' : 'open'}>
        <summary><h3 class="bloque-titulo">🧭 Cronograma del viaje</h3></summary>
        ${R.cronogramaEditor.resumenHTML(v)}
      </details>

      <details class="bloque plegable" data-mapa>
        <summary><h3 class="bloque-titulo">🗺️ Mapa del recorrido</h3></summary>
        <div class="mapa-cont"></div>
      </details>

      ${dias.length ? `<div class="linea-tiempo">${dias.map(f => diaHTML(v, diaDe(v, f), f === hoy)).join('')}</div>` : ''}
      ${fuera.length ? `<section class="dia fuera"><header class="dia-cab"><div><strong>Sin fecha o fuera del viaje</strong></div></header>${fuera.map(e => itemHTML({ hora: e.hora, icono: tipo(e.tipo).icono, titulo: e.titulo, sub: [e.fecha ? U.fmtFecha(e.fecha, 'corto') : '', e.lugar].filter(Boolean).join(' · '), evento: e.id, docs: [] })).join('')}</section>` : ''}
      ${!dias.length && !fuera.length ? `
        <div class="vacio vacio-chico">
          <div class="vacio-icono">🗓️</div>
          <p>Completá el cronograma (cuándo sale y llega cada traslado) y acá vas a ver cada día del viaje.</p>
          <button class="btn btn-primario solo-org" data-a="cronograma3">Completar el cronograma</button>
        </div>` : ''}
      <p class="ayuda itinerario-pie"><button class="btn btn-texto btn-chico" data-a="ics">📆 Agregar al calendario del celular</button></p>`;

    cont.querySelectorAll('[data-a^="cronograma"]').forEach(b => b.onclick = () => editarCronograma(v));
    cont.querySelector('[data-a="nuevo"]').onclick = () => editar(v);
    cont.querySelector('[data-a="compartir"]').onclick = () => compartir(v);
    cont.querySelector('[data-a="pdf"]').onclick = () => R.itinerarioPdf.descargar(v);
    cont.querySelector('[data-a="ics"]').onclick = () => descargarICS(v);
    cont.querySelectorAll('[data-agregar]').forEach(b => b.onclick = () => editar(v, null, b.dataset.agregar));
    cont.querySelectorAll('[data-evento]').forEach(b => b.onclick = () => editar(v, b.dataset.evento));
    cont.querySelectorAll('[data-doc]').forEach(b => b.onclick = e => { e.stopPropagation(); R.documentos.abrir(v.documentos.find(d => d.id === b.dataset.doc), v); });
    const det = cont.querySelector('[data-mapa]');
    det.addEventListener('toggle', () => { if (det.open && !det.dataset.cargado) { det.dataset.cargado = '1'; R.mapa.mostrar(det.querySelector('.mapa-cont'), v); } });
    cargarClima(v, cont);
  }

  function itemHTML(it) {
    return `
      <article class="evento ${it.clase || ''}" ${it.evento ? `data-evento="${it.evento}"` : ''}>
        <span class="ev-hora">${esc(it.hora || '—')}</span>
        <span class="ev-icono">${it.icono}</span>
        <div class="ev-texto">
          <strong>${esc(it.titulo)}</strong>
          ${it.sub ? `<small>${esc(it.sub)}</small>` : ''}
          ${it.docs && it.docs.length ? `<span class="ev-docs">${it.docs.map(d => `<button class="doc-mini" data-doc="${d.id}">${R.documentos.iconoDoc(d)} ${esc(d.nombre)}</button>`).join('')}</span>` : ''}
        </div>
      </article>`;
  }

  function diaHTML(v, d, esHoy) {
    return `
      <section class="dia ${esHoy ? 'hoy' : ''}" id="dia-${d.fecha}">
        <header class="dia-cab">
          <div>
            <strong>Día ${d.numero}${d.lugarNombre ? ' · ' + esc(d.lugarNombre) : ''}</strong>${esHoy ? ' <span class="chip chip-sol">Hoy</span>' : ''}
            <small>${U.fmtFecha(d.fecha, 'largo')}</small>
          </div>
          <span class="dia-clima" data-clima-dia="${d.fecha}"></span>
          <button class="btn-icono solo-org" data-agregar="${d.fecha}" title="Agregar a este día">+</button>
        </header>
        ${d.amaneces ? `<p class="dia-linea">🌅 ${esc(d.amaneces)}</p>` : ''}
        ${d.items.length ? d.items.map(itemHTML).join('') : '<p class="dia-libre">Día libre ☀️</p>'}
        ${d.dormis ? `<p class="dia-linea dia-dormis ${d.dormis.falta ? 'falta' : ''}">${d.dormis.icono} ${esc(d.dormis.texto)}${d.dormis.direccion ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.dormis.direccion)}" target="_blank" rel="noopener">${esc(d.dormis.direccion)}</a>` : ''}</p>` : ''}
      </section>`;
  }

  /** Completa el clima de cada día cuando llega (sin redibujar la pantalla). */
  function cargarClima(v, cont) {
    C().estadias(v).forEach(e => {
      if (!e.desde || !e.hasta || e.lugar.lat == null) return;
      R.clima.obtener(e.lugar.lat, e.lugar.lon, e.desde, e.hasta).then(datos => {
        if (!datos) return;
        datos.dias.forEach(d => {
          const x = cont.querySelector(`[data-clima-dia="${d.fecha}"]`);
          if (x && !x.textContent) x.innerHTML = `${R.clima.icono(d.codigo, d.lluvia)} ${d.max != null ? d.max + '°' : ''}<small>${d.min != null ? d.min + '°' : ''}</small>${datos.tipo === 'referencia' ? '<i title="Referencia: mismas fechas del año pasado">*</i>' : ''}`;
        });
      });
    });
  }

  /* ---------------------------------------------------------
     Editor del cronograma (modal)
     --------------------------------------------------------- */
  function editarCronograma(v, opciones) {
    const op = opciones || {};
    const b = JSON.parse(JSON.stringify({ origen: v.origen, destinos: v.destinos, recorrido: v.recorrido }));
    b.recorrido = C().construir(b.origen, b.destinos, b.recorrido, v.perfil.transporte);
    const firma = r => C().todosLosSegmentos(r).map(x => `${x.seg.id}:${x.seg.sale.fecha}|${C().fechaLlega(x.seg)}|${x.seg.medio}|${x.seg.noche}`).join(',');
    const antes = firma(v.recorrido);
    U.modal({
      titulo: 'Cronograma del viaje',
      subtitulo: 'Fechas y horas de cada traslado. Las noches se calculan solas.',
      ancho: true,
      cuerpo: '<div id="editorCrono"></div>',
      alAbrir: el => R.cronogramaEditor.montar(el.querySelector('#editorCrono'), b, { tareas: v.tareas }),
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Guardar', clase: 'btn-primario', onClick: () => {
            const errores = C().validar({ recorrido: b.recorrido, destinos: b.destinos, tareas: v.tareas }).filter(a => a.nivel === 'error');
            if (errores.length) { U.toast(errores[0].texto); return false; }
            const confirmadosAntes = C().todosLosSegmentos(v.recorrido).filter(x => x.seg.estado === 'confirmado').map(x => x.seg.id);
            v.recorrido = b.recorrido;
            v.destinos = b.destinos;
            v.perfil.transporte = C().medioPrincipal(v.recorrido);
            C().recalcular(v);
            R.db.guardarViaje(v);
            R.app.refrescar();
            const cambio = antes !== firma(v.recorrido);
            const tocados = C().todosLosSegmentos(v.recorrido).filter(x => confirmadosAntes.includes(x.seg.id) && x.seg.estado !== 'confirmado');
            if (op.alGuardar) { op.alGuardar(); return; }
            if (!cambio) return;
            if (tocados.length) {
              setTimeout(() => U.confirmar(`Cambiaste ${U.plural(tocados.length, 'un traslado que ya estaba confirmado', 'traslados que ya estaban confirmados')}. ¿Armo un plan para revisar pasajes, alojamientos y reservas?`, {
                titulo: 'Esto afecta reservas', textoSi: 'Sí, reorganizar', textoNo: 'No hace falta'
              }).then(ok => {
                if (!ok) return;
                R.motor.replanificar(v, ['fechas'], 'Cambio en el cronograma');
                R.db.guardarViaje(v);
                R.app.refrescar();
                R.vistaGuia.mostrarPlan(v, R.motor.ordenarPlan(v, R.motor.pasosARevisar(v)));
              }), 300);
            } else {
              U.toast('Cronograma actualizado.');
            }
          }
        }
      ]
    });
  }

  /* ---------------------------------------------------------
     Compartir, imprimir y calendario
     --------------------------------------------------------- */
  function textoItinerario(v) {
    const lineas = [`🧳 ${v.nombre || R.viajes.destinoCompleto(v)}`, U.fmtRango(v.fechaInicio, v.fechaFin), ''];
    diasDelViaje(v).forEach(f => {
      const d = diaDe(v, f);
      lineas.push(`📅 Día ${d.numero} · ${U.fmtFecha(f, 'dia')}${d.lugarNombre ? ' · ' + d.lugarNombre : ''}`);
      d.items.forEach(it => lineas.push(`• ${it.hora ? it.hora + ' ' : ''}${it.icono} ${it.titulo}${it.sub ? ' (' + it.sub + ')' : ''}`));
      if (d.dormis) lineas.push(`${d.dormis.icono} ${d.dormis.texto}${d.dormis.direccion ? ' — ' + d.dormis.direccion : ''}`);
      lineas.push('');
    });
    if (!diasDelViaje(v).length) {
      C().todosLosSegmentos(v.recorrido).forEach(x => lineas.push(`• ${C().etiquetaSegmento(x.seg)}`));
    }
    lineas.push('Armado con Rutenda');
    return lineas.join('\n');
  }

  function compartir(v) {
    const texto = textoItinerario(v);
    const { el } = U.modal({
      titulo: 'Compartir itinerario',
      cuerpo: `
        <div class="opciones-compartir">
          <button class="btn btn-primario btn-bloque" data-a="nativo">↗ Compartir (WhatsApp, mail…)</button>
          <button class="btn btn-suave btn-bloque" data-a="copiar">📋 Copiar texto</button>
          <button class="btn btn-suave btn-bloque" data-a="pdf">📄 Descargar PDF</button>
          ${navigator.canShare ? '<button class="btn btn-suave btn-bloque" data-a="pdfCompartir">📤 Compartir el PDF</button>' : ''}
          <button class="btn btn-suave btn-bloque" data-a="ics">📆 Agregar al calendario</button>
        </div>
        <pre class="vista-texto">${esc(texto)}</pre>`
    });
    el.querySelector('[data-a="nativo"]').onclick = async () => {
      if (navigator.share) {
        try { await navigator.share({ title: v.nombre || 'Itinerario', text: texto }); } catch (e) { /* cancelado */ }
      } else {
        window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
      }
    };
    el.querySelector('[data-a="copiar"]').onclick = async () => {
      try { await navigator.clipboard.writeText(texto); U.toast('Itinerario copiado.'); } catch (e) { U.toast('No se pudo copiar.'); }
    };
    el.querySelector('[data-a="pdf"]').onclick = () => R.itinerarioPdf.descargar(v);
    const pc = el.querySelector('[data-a="pdfCompartir"]');
    if (pc) pc.onclick = () => R.itinerarioPdf.descargar(v, { compartir: true });
    el.querySelector('[data-a="ics"]').onclick = () => descargarICS(v);
  }

  function imprimir(v) {
    const marco = document.createElement('div');
    marco.className = 'solo-impresion';
    marco.innerHTML = `<h1>${esc(v.nombre || R.viajes.destinoCompleto(v))}</h1><p>${esc(U.fmtRango(v.fechaInicio, v.fechaFin))}</p>
      ${R.cronogramaEditor.resumenHTML(v)}
      ${diasDelViaje(v).map(f => diaHTML(v, diaDe(v, f), false)).join('')}`;
    document.body.appendChild(marco);
    document.body.classList.add('imprimiendo');
    const limpiar = () => { document.body.classList.remove('imprimiendo'); marco.remove(); window.removeEventListener('afterprint', limpiar); };
    window.addEventListener('afterprint', limpiar);
    setTimeout(() => { window.print(); setTimeout(limpiar, 1500); }, 100);
  }

  function icsFecha(fecha, hora) { return fecha.replace(/-/g, '') + (hora ? 'T' + hora.replace(':', '') + '00' : ''); }
  function icsTexto(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }

  /** Archivo .ics con traslados, check-in/out, escapadas y actividades. */
  function generarICS(v) {
    const ev = [];
    const agregar = (fecha, hora, horaFin, fechaFin, zona, titulo, desc, lugar) => {
      if (!fecha) return;
      const uid = `${U.id('ics')}@tripbox`;
      const lineas = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
      if (hora) {
        const tz = zona ? `;TZID=${zona}` : '';
        lineas.push(`DTSTART${tz}:${icsFecha(fecha, hora)}`);
        if (horaFin) lineas.push(`DTEND${tz}:${icsFecha(fechaFin || fecha, horaFin)}`);
        else lineas.push(`DURATION:PT1H`);
      } else {
        lineas.push(`DTSTART;VALUE=DATE:${icsFecha(fecha)}`, `DTEND;VALUE=DATE:${icsFecha(U.sumarDias(fechaFin || fecha, fechaFin && fechaFin !== fecha ? 0 : 1))}`);
      }
      lineas.push(`SUMMARY:${icsTexto(titulo)}`);
      if (desc) lineas.push(`DESCRIPTION:${icsTexto(desc)}`);
      if (lugar) lineas.push(`LOCATION:${icsTexto(lugar)}`);
      lineas.push('END:VEVENT');
      ev.push(lineas.join('\r\n'));
    };
    C().todosLosSegmentos(v.recorrido).forEach(x => {
      const s = x.seg;
      agregar(s.sale.fecha, s.sale.hora, s.llega.hora && C().fechaLlega(s) === s.sale.fecha ? s.llega.hora : '', '', s.desde.zona,
        `${C().medio(s.medio).icono} ${s.desde.nombre} → ${s.hasta.nombre}`, R.cronogramaEditor.datosSegmento(v, s), s.desde.nombre);
    });
    C().estadias(v).forEach(e => {
      const a = datosAloj(v, e.id);
      if (a && a.checkinFecha) agregar(a.checkinFecha, a.checkinHora, '', '', e.lugar.zona, `🏨 Check-in ${a.nombre || e.nombre}`, a.codigo ? 'Código ' + a.codigo : '', a.direccion || e.nombre);
      if (a && a.checkoutFecha) agregar(a.checkoutFecha, a.checkoutHora, '', '', e.lugar.zona, `🧳 Check-out ${a.nombre || e.nombre}`, '', a.direccion || e.nombre);
    });
    (v.destinos || []).filter(d => d.soloDia && d.fecha && !d.fechaPendiente).forEach(d => agregar(d.fecha, '', '', '', '', `☀️ Escapada a ${d.nombre}`, '', d.nombre));
    (v.itinerario || []).filter(e => e.fecha && !(e.origen || '').startsWith('t_segmento__')).forEach(e => agregar(e.fecha, e.hora, '', '', '', e.titulo, [e.confirmacion && 'Código ' + e.confirmacion, e.notas].filter(Boolean).join(' · '), e.lugar));
    if (v.fechaInicio && v.fechaFin) agregar(v.fechaInicio, '', '', U.sumarDias(v.fechaFin, 1), '', `🧳 Viaje: ${v.nombre || R.viajes.destinoCompleto(v)}`, '', '');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rutenda//ES', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsTexto(v.nombre || 'Rutenda')}`].concat(ev).concat(['END:VCALENDAR']).join('\r\n');
  }

  function descargarICS(v) {
    const blob = new Blob([generarICS(v)], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tripbox-${(v.nombre || v.destino || 'viaje').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    U.toast('Abrí el archivo para sumarlo a tu calendario.');
  }

  /* ---------------------------------------------------------
     Actividades propias
     --------------------------------------------------------- */
  function editar(v, id, fechaSugerida) {
    const existente = id ? v.itinerario.find(e => e.id === id) : null;
    const e = existente || { fecha: fechaSugerida || v.fechaInicio || U.hoyISO(), hora: '', tipo: 'actividad', titulo: '', lugar: '', confirmacion: '', notas: '' };
    const acciones = [{ texto: 'Cancelar' }];
    if (existente) acciones.unshift({
      texto: 'Eliminar', clase: 'btn-texto peligro', onClick: () => {
        v.itinerario = v.itinerario.filter(x => x.id !== id);
        R.db.guardarViaje(v);
        R.app.refrescar();
        U.toast('Eliminado del itinerario.');
      }
    });
    acciones.push({
      texto: 'Guardar', clase: 'btn-primario', onClick: el => {
        const titulo = el.querySelector('#iTitulo').value.trim();
        if (!titulo) { U.toast('Poné un título.'); return false; }
        const nuevo = Object.assign({}, e, {
          id: e.id || U.id('evt'),
          fecha: el.querySelector('#iFecha').value,
          hora: el.querySelector('#iHora').value,
          tipo: el.querySelector('#iTipo').value,
          titulo,
          lugar: el.querySelector('#iLugar').value.trim(),
          confirmacion: el.querySelector('#iConf').value.trim(),
          notas: el.querySelector('#iNotas').value.trim()
        });
        if (existente) v.itinerario = v.itinerario.map(x => x.id === nuevo.id ? nuevo : x);
        else v.itinerario.push(nuevo);
        R.db.guardarViaje(v);
        R.app.refrescar();
        U.toast(existente ? 'Itinerario actualizado.' : 'Agregado al itinerario.');
      }
    });

    U.modal({
      titulo: existente ? 'Editar' : 'Agregar al itinerario',
      cuerpo: `
        ${existente && existente.origen ? `<p class="aviso-suave">🧭 Lo cargó el paso "${esc(R.motor.nombre(v, existente.origen))}". Si volvés a guardar ese paso, se actualiza.</p>` : ''}
        <div class="chips-elegir" id="iTipos">${TIPOS.map(t => `<button type="button" class="chip-op ${e.tipo === t.id ? 'activo' : ''}" data-tipo="${t.id}">${t.icono} ${t.nombre}</button>`).join('')}</div>
        <input type="hidden" id="iTipo" value="${esc(e.tipo)}">
        <label class="campo"><span>Título *</span><input id="iTitulo" value="${esc(e.titulo)}" placeholder="Ej: Cerro Catedral, cena en el centro"></label>
        <div class="grilla-2">
          <label class="campo"><span>Fecha</span><input type="date" id="iFecha" value="${esc(e.fecha)}" min="${esc(v.fechaInicio || '')}" max="${esc(v.fechaFin || '')}"></label>
          <label class="campo"><span>Hora</span><input type="time" id="iHora" value="${esc(e.hora)}"></label>
        </div>
        <div class="grilla-2">
          <label class="campo"><span>Lugar</span><input id="iLugar" value="${esc(e.lugar)}" placeholder="Dirección o referencia"></label>
          <label class="campo"><span>Código de reserva</span><input id="iConf" value="${esc(e.confirmacion)}"></label>
        </div>
        <label class="campo"><span>Notas</span><textarea id="iNotas" rows="2">${esc(e.notas)}</textarea></label>`,
      acciones,
      alAbrir: el => {
        el.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => {
          el.querySelector('#iTipo').value = b.dataset.tipo;
          el.querySelectorAll('[data-tipo]').forEach(x => x.classList.toggle('activo', x === b));
        });
      }
    });
  }

  /* ---------------------------------------------------------
     Modo viaje: el día de hoy
     --------------------------------------------------------- */
  function hoyHTML(v) {
    const hoy = U.hoyISO();
    if (!v.fechaInicio || hoy < v.fechaInicio || (v.fechaFin && hoy > v.fechaFin)) return '';
    const d = diaDe(v, hoy);
    const manana = v.fechaFin && hoy < v.fechaFin ? diaDe(v, U.sumarDias(hoy, 1)) : null;
    const proximo = manana && manana.items.find(i => i.clase === 'ev-traslado');
    return `
      <section class="modo-viaje bloque">
        <div class="mv-cab">
          <div><span class="etiqueta">Hoy en el viaje</span><h3>Día ${d.numero}${d.lugarNombre ? ' · ' + esc(d.lugarNombre) : ''}</h3><small>${U.fmtFecha(hoy, 'largo')}</small></div>
          <span class="dia-clima" data-clima-dia="${hoy}"></span>
        </div>
        ${d.items.length ? d.items.map(itemHTML).join('') : '<p class="dia-libre">Día libre ☀️ Disfrutalo.</p>'}
        ${d.dormis ? `<p class="dia-linea dia-dormis">${d.dormis.icono} ${esc(d.dormis.texto)}${d.dormis.direccion ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.dormis.direccion)}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}</p>` : ''}
        ${proximo ? `<p class="mv-manana">Mañana: ${proximo.icono} ${proximo.hora ? proximo.hora + ' · ' : ''}${esc(proximo.titulo)}</p>` : ''}
        <a class="btn btn-suave btn-chico" href="#viaje/${v.id}/itinerario">Ver todo el itinerario →</a>
      </section>`;
  }

  function enlazarHoy(cont, v) {
    cont.querySelectorAll('.modo-viaje [data-doc]').forEach(b => b.onclick = () => R.documentos.abrir(v.documentos.find(d => d.id === b.dataset.doc), v));
    const e = C().estadias(v).find(x => x.desde <= U.hoyISO() && U.hoyISO() <= x.hasta);
    if (e && e.lugar.lat != null) R.clima.obtener(e.lugar.lat, e.lugar.lon, e.desde, e.hasta).then(datos => {
      const d = datos && datos.dias.find(x => x.fecha === U.hoyISO());
      const x = cont.querySelector(`.modo-viaje [data-clima-dia]`);
      if (d && x) x.innerHTML = `${R.clima.icono(d.codigo, d.lluvia)} ${d.max}°<small>${d.min}°</small>`;
    });
  }

  return { TIPOS, render, editar, editarCronograma, diaDe, diasDelViaje, hoyHTML, enlazarHoy, textoItinerario, generarICS, compartir };
})();
