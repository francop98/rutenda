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
  const normal = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // ¿Es algo al aire libre? (para avisar si llueve)
  const AIRE_LIBRE = /cerro|playa|parque|caminata|trekking|treking|sendero|excursi|paseo|cataratas|navegaci|kayak|bici|mirador|glaciar|isla|lago|r[ií]o\b|cascada|rafting|cabalgata|safari|picnic|bosque|monta[ñn]a|volc[aá]n|jard[ií]n|aire libre|city ?tour|bote|lancha|surf|snorkel|esqu[ií]/i;
  function esAireLibre(tipoId, titulo) {
    if (['naturaleza', 'aventura', 'excursion'].includes(tipoId)) return true;
    if (['gastronomia', 'compras', 'noche', 'comida', 'alojamiento', 'vuelo', 'traslado'].includes(tipoId)) return false;
    return AIRE_LIBRE.test(titulo || '');
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
    // Para Google Maps: cada lugar con su ciudad, así se encuentra bien
    const ciudad = (durmiendo || enEstadia || {}).nombre || '';
    const conCiudad = (x, c) => x ? (c && !normal(x).includes(normal(c)) ? `${x}, ${c}` : x) : '';
    const lugarAloj = (a, e) => a && (a.direccion || a.nombre) ? conCiudad(a.direccion || a.nombre, e.nombre) : '';

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
      if (a && a.checkinFecha === fecha) items.push({ hora: a.checkinHora, icono: '🏨', clase: 'ev-aloj', titulo: `Check-in · ${a.nombre || e.nombre}`, sub: [a.direccion, a.codigo ? 'Cód. ' + a.codigo : ''].filter(Boolean).join(' · '), docs: documentosDe(v, 'a_reserva__' + e.id), lugar: lugarAloj(a, e) });
      if (a && a.checkoutFecha === fecha) items.push({ hora: a.checkoutHora, icono: '🧳', clase: 'ev-aloj', titulo: `Check-out · ${a.nombre || e.nombre}`, sub: a.direccion || '', docs: [], lugar: lugarAloj(a, e) });
    });

    (v.destinos || []).filter(d => d.soloDia && d.nombre && d.fecha === fecha && !d.fechaPendiente).forEach(d => {
      items.push({ hora: '', icono: '☀️', clase: 'ev-escapada', aire: true, titulo: `Escapada a ${d.nombre}`, sub: 'Volvés en el día', docs: documentosDe(v, 'e_escapada__' + d.id), lugar: R.gmaps ? R.gmaps.textoLugar(d) : d.nombre });
    });

    (v.itinerario || []).filter(e => e.fecha === fecha && !(e.origen || '').startsWith('t_segmento__')).forEach(e => {
      items.push({ hora: e.hora, icono: tipo(e.tipo).icono, clase: 'ev-propio', titulo: e.titulo, sub: [e.lugar && '📍 ' + e.lugar, e.confirmacion && 'Cód. ' + e.confirmacion, e.notas].filter(Boolean).join(' · '), evento: e.id, origen: e.origen, docs: [], lugar: conCiudad(e.lugar, ciudad), aire: esAireLibre(e.tipo, e.titulo + ' ' + (e.lugar || '')) });
    });

    // Lo que decidiste hacer ese día (desde "Qué hacer")
    if (R.ideas) R.ideas.delDia(v, fecha).forEach(p => items.push({ hora: p.hora, icono: R.ideas.ICONOS[p.tipo] || '📍', clase: 'ev-plan', titulo: p.titulo, sub: [p.zona && '📍 ' + p.zona, p.reserva && '🎟️ con reserva', p.nota].filter(Boolean).join(' · '), plan: p.destId + '|' + p.id, aire: esAireLibre(p.tipo, p.titulo + ' ' + (p.lugar || '')), docs: [], lugar: conCiudad(p.lugar || p.titulo, ((v.destinos || []).find(x => x.id === p.destId) || {}).nombre || ciudad) }));

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
    // Dónde arranca y termina el día (para el recorrido en Google Maps)
    const inicioLugar = enEstadia ? lugarAloj(datosAloj(v, enEstadia.id), enEstadia) : '';
    const finLugar = durmiendo ? lugarAloj(datosAloj(v, durmiendo.id), durmiendo) : '';
    return { fecha, numero: v.fechaInicio ? U.diasEntre(v.fechaInicio, fecha) + 1 : null, amaneces, dormis, items, lugar: lugarPrincipal, lugarNombre: (durmiendo || enEstadia || {}).nombre || '', inicioLugar, finLugar };
  }

  /* ---------------------------------------------------------
     Render
     --------------------------------------------------------- */
  let subvista = (() => { try { return localStorage.getItem('rutenda_sub_itinerario') || 'dias'; } catch (e) { return 'dias'; } })();

  function render(v, cont) {
    if (R.ideas) R.ideas.migrar(v);
    const dias = diasDelViaje(v);
    const avisos = C().validar(v).filter(a => a.nivel !== 'info' || /Faltan|Falta/.test(a.texto));
    const hoy = U.hoyISO();
    const fuera = (v.itinerario || []).filter(e => !(e.origen || '').startsWith('t_segmento__') && (!e.fecha || !dias.includes(e.fecha)));
    const sinDia = R.ideas ? R.ideas.sinDia(v) : [];
    const nQue = R.ideas ? R.ideas.cuenta(v) : 0;
    if (!['dias', 'que'].includes(subvista)) subvista = 'dias';

    cont.innerHTML = `
      <div class="itin-cab">
        <div class="itin-titulo">
          <h2 class="titulo-seccion">Itinerario</h2>
          <p class="texto-suave">${dias.length ? U.plural(dias.length, 'día', 'días') + ' de viaje' : 'Cargá las fechas y te armo los días.'}</p>
        </div>
        <div class="itin-acciones">
          <button class="itin-accion" data-a="pdf"><span>📄</span>PDF</button>
          <button class="itin-accion" data-a="compartir"><span>↗</span>Compartir</button>
          <button class="itin-accion" data-a="ics"><span>📆</span>Calendario</button>
          <button class="itin-accion" data-a="mapa"><span>🗺️</span>Mapa</button>
        </div>
      </div>

      <div class="segmentado segmentado-itin" role="tablist">
        <button type="button" data-subvista="dias" class="${subvista === 'dias' ? 'activo' : ''}">🗓️ Días</button>
        <button type="button" data-subvista="que" class="${subvista === 'que' ? 'activo' : ''}">📝 Qué hacer${nQue ? ` <i class="punto-aviso">${nQue}</i>` : ''}</button>
      </div>

      ${subvista === 'que' ? `<div class="vista-que">${R.ideas ? R.ideas.vistaHTML(v) : ''}</div>` : `
      ${avisos.length ? `<div class="cr-avisos bloque">${avisos.map(a => `<p class="cr-aviso cr-${a.nivel}">${a.nivel === 'error' ? '⛔' : a.nivel === 'aviso' ? '⚠️' : 'ℹ️'} ${esc(a.texto)}</p>`).join('')}
        <button class="btn btn-texto btn-chico solo-org" data-a="cronograma2">Corregir las fechas →</button></div>` : ''}
      <div class="acciones-fila itin-crear solo-org">
        <button class="btn btn-primario btn-chico" data-a="nuevo">+ Actividad</button>
        <button class="btn btn-suave btn-chico" data-a="cronograma">📅 Fechas y traslados</button>
      </div>
      ${dias.length ? `<div class="linea-tiempo">${agruparDias(v, dias, hoy)}</div>` : ''}
      ${fuera.length || sinDia.length ? `<section class="dia fuera"><header class="dia-cab"><div><strong>Para hacer, sin día</strong><small>Tocá cada una para elegirle el día</small></div></header>
        ${sinDia.map(p => itemHTML({ hora: p.hora, icono: (R.ideas.ICONOS[p.tipo] || '📍'), titulo: p.titulo, sub: [p.zona, p.nota].filter(Boolean).join(' · '), plan: p.destId + '|' + p.id, docs: [] })).join('')}
        ${fuera.map(e => itemHTML({ hora: e.hora, icono: tipo(e.tipo).icono, titulo: e.titulo, sub: [e.fecha ? U.fmtFecha(e.fecha, 'corto') : '', e.lugar].filter(Boolean).join(' · '), evento: e.id, docs: [] })).join('')}</section>` : ''}
      ${!dias.length && !fuera.length && !sinDia.length ? `
        <div class="vacio vacio-chico">
          <div class="vacio-icono">🗓️</div>
          <p>Cargá las fechas y acá aparece cada día del viaje.</p>
          <button class="btn btn-primario solo-org" data-a="cronograma3">Cargar las fechas</button>
        </div>` : ''}`}`;

    cont.querySelectorAll('[data-subvista]').forEach(b => b.onclick = () => {
      subvista = b.dataset.subvista;
      try { localStorage.setItem('rutenda_sub_itinerario', subvista); } catch (e) { /* nada */ }
      render(v, cont);
    });
    cont.querySelectorAll('[data-a^="cronograma"]').forEach(b => b.onclick = () => editarCronograma(v));
    const bNuevo = cont.querySelector('[data-a="nuevo"]');
    if (bNuevo) bNuevo.onclick = () => editar(v);
    cont.querySelector('[data-a="compartir"]').onclick = () => compartir(v);
    cont.querySelector('[data-a="pdf"]').onclick = () => R.itinerarioPdf.descargar(v);
    cont.querySelector('[data-a="ics"]').onclick = () => descargarICS(v);
    cont.querySelector('[data-a="mapa"]').onclick = () => {
      const { el } = U.modal({ titulo: 'Mapa del recorrido', ancho: true, cuerpo: `<div class="mapa-cont"></div>${R.gmaps && R.gmaps.paradasViaje(v).length > 1 ? '<button type="button" class="btn btn-suave btn-bloque mapa-gm" data-a="gmRuta">🗺️ Ver la ruta en Google Maps</button>' : ''}` });
      R.mapa.mostrar(el.querySelector('.mapa-cont'), v);
      const bGm = el.querySelector('[data-a="gmRuta"]');
      if (bGm) bGm.onclick = () => { U.cerrarModal(); R.gmaps.abrirRutaViaje(v); };
    };
    cont.querySelectorAll('[data-agregar]').forEach(b => b.onclick = () => editar(v, null, b.dataset.agregar));
    cont.querySelectorAll('[data-evento]').forEach(b => b.onclick = () => editar(v, b.dataset.evento));
    cont.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { const [d, id] = b.dataset.plan.split('|'); R.ideas.editar(v, d, id, () => render(v, cont)); });
    cont.querySelectorAll('[data-doc]').forEach(b => b.onclick = e => { e.stopPropagation(); R.documentos.abrir(v.documentos.find(d => d.id === b.dataset.doc), v); });
    if (R.ordenar) R.ordenar.enlazar(cont, v);
    if (subvista === 'que' && R.ideas) R.ideas.enlazar(v, cont, () => render(v, cont));
    else { cargarClima(v, cont); cargarFeriados(v, cont); }
  }

  /** Abre el itinerario directo en "Qué hacer". */
  function irAQueHacer(v) {
    subvista = 'que';
    try { localStorage.setItem('rutenda_sub_itinerario', 'que'); } catch (e) { /* nada */ }
    // Desde la pestaña Itinerario de abajo, se queda ahí
    if (!/^#itinerario/.test(location.hash)) location.hash = `#viaje/${v.id}/itinerario`;
    R.app.refrescar();
  }

  function itemHTML(it) {
    return `
      <article class="evento ${it.clase || ''}" ${it.evento ? `data-evento="${it.evento}"` : ''} ${it.plan ? `data-plan="${it.plan}"` : ''}>
        <span class="ev-hora">${esc(it.hora || '—')}</span>
        <span class="ev-icono">${it.icono}</span>
        <div class="ev-texto">
          <strong>${esc(it.titulo)}</strong>
          ${it.sub ? `<small>${esc(it.sub)}</small>` : ''}
          ${it.lugar && R.gmaps ? R.gmaps.enlaceItemHTML(it.lugar) : ''}
          ${it.docs && it.docs.length ? `<span class="ev-docs">${it.docs.map(d => `<button class="doc-mini" data-doc="${d.id}">${R.documentos.iconoDoc(d)} ${esc(d.nombre)}</button>`).join('')}</span>` : ''}
        </div>
      </article>`;
  }

  /**
   * Días seguidos sin nada en el mismo lugar se muestran juntos ("Días 2 a 4 · Iguazú").
   * El alojamiento aparece una vez por lugar, no todos los días.
   */
  function agruparDias(v, dias, hoy) {
    const ds = dias.map(f => diaDe(v, f));
    const libre = d => !d.items.length && d.fecha !== hoy && d.lugarNombre && (!d.amaneces || d.amaneces === 'Amanecés en ' + d.lugarNombre);
    const html = [];
    let ultimoDormis = '';
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i];
      const dormisTxt = d.dormis ? d.dormis.texto : '';
      const mostrarDormis = dormisTxt && dormisTxt !== ultimoDormis;
      if (libre(d)) {
        let j = i;
        while (j + 1 < ds.length && libre(ds[j + 1]) && ds[j + 1].lugarNombre === d.lugarNombre && (ds[j + 1].dormis || {}).texto === dormisTxt) j++;
        if (j > i) {
          html.push(grupoHTML(d, ds[j], mostrarDormis ? d.dormis : null));
          ultimoDormis = dormisTxt;
          i = j;
          continue;
        }
      }
      html.push(diaHTML(v, d, d.fecha === hoy, mostrarDormis));
      ultimoDormis = dormisTxt || ultimoDormis;
    }
    return html.join('');
  }

  function dormisHTML(dm) {
    return dm ? `<p class="dia-linea dia-dormis ${dm.falta ? 'falta' : ''}">${dm.icono} ${esc(dm.texto)}${dm.direccion ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dm.direccion)}" target="_blank" rel="noopener">${esc(dm.direccion)}</a>` : ''}</p>` : '';
  }

  function grupoHTML(a, b, dormis) {
    return `
      <section class="dia dia-grupo" id="dia-${a.fecha}">
        <header class="dia-cab">
          <div>
            <strong>Días ${a.numero} a ${b.numero} · ${esc(a.lugarNombre)}</strong>
            <small>${U.fmtRango(a.fecha, b.fecha)} · días libres ☀️</small>
          </div>
          <button class="btn-icono solo-org" data-agregar="${a.fecha}" title="Agregar una actividad">+</button>
        </header>
        ${dormisHTML(dormis)}
      </section>`;
  }

  function diaHTML(v, d, esHoy, mostrarDormis) {
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
        ${d.amaneces && d.amaneces !== 'Amanecés en ' + d.lugarNombre ? `<p class="dia-linea">🌅 ${esc(d.amaneces)}</p>` : ''}
        ${enArgentina(v, d) ? `<p class="dia-linea dia-feriado" data-feriado-dia="${d.fecha}" hidden></p>` : ''}
        ${alertaHTML(d)}
        ${d.items.length ? d.items.map(itemHTML).join('') : '<p class="dia-libre">Día libre ☀️</p>'}
        ${R.gmaps ? R.gmaps.enlaceDiaHTML(d) : ''}
        ${mostrarDormis === false ? '' : dormisHTML(d.dormis)}
      </section>`;
  }

  /** El día transcurre en Argentina (para marcar feriados). */
  function enArgentina(v, d) {
    const pais = d.lugar && d.lugar.codigoPais ? d.lugar.codigoPais : ((v.origen || {}).codigoPais || 'AR');
    return pais === 'AR';
  }
  /** Marca los feriados de Argentina en los días del viaje. */
  function cargarFeriados(v, cont) {
    if (!R.feriados || !v.fechaInicio || !cont.querySelector('[data-feriado-dia]')) return;
    R.feriados.entre(v.fechaInicio, v.fechaFin || v.fechaInicio).then(lista => lista.forEach(f => {
      const x = cont.querySelector(`[data-feriado-dia="${f.fecha}"]`);
      if (!x) return;
      x.textContent = /puente/i.test(f.nombre) ? '📌 Día no laborable (puente turístico): puede haber comercios cerrados.' : `📌 Feriado: ${f.nombre}. Puede haber comercios cerrados.`;
      x.hidden = false;
    }));
  }

  /** Lugar para el aviso de lluvia (se completa cuando llega el pronóstico). */
  function alertaHTML(d) {
    const aire = d.items.filter(i => i.aire);
    if (!aire.length) return '';
    const mover = aire.find(i => i.evento || i.plan);
    return `<div class="dia-alerta" data-clima-alerta="${d.fecha}" data-que="${esc(aire.map(i => i.titulo).slice(0, 2).join(' y '))}" hidden>
      <p></p>${mover ? `<button type="button" class="btn-texto-mini solo-org" ${mover.evento ? `data-evento="${mover.evento}"` : `data-plan="${mover.plan}"`}>Cambiar de día</button>` : ''}</div>`;
  }
  /** ¿Ese día se espera lluvia de verdad? (solo con pronóstico, no con la referencia del año pasado) */
  function llueve(d) { return d && ((d.lluvia != null && d.lluvia >= 4) || (d.codigo != null && ((d.codigo >= 61 && d.codigo <= 67) || (d.codigo >= 80 && d.codigo <= 99)))); }

  /** Completa el clima de cada día cuando llega (sin redibujar la pantalla). */
  function cargarClima(v, cont) {
    C().estadias(v).forEach(e => {
      if (!e.desde || !e.hasta || e.lugar.lat == null) return;
      R.clima.obtener(e.lugar.lat, e.lugar.lon, e.desde, e.hasta).then(datos => {
        if (!datos) return;
        datos.dias.forEach(d => {
          const x = cont.querySelector(`[data-clima-dia="${d.fecha}"]`);
          if (x && !x.textContent) x.innerHTML = `${R.clima.icono(d.codigo, d.lluvia)} ${d.max != null ? d.max + '°' : ''}<small>${d.min != null ? d.min + '°' : ''}</small>${datos.tipo === 'referencia' ? '<i title="Referencia: mismas fechas del año pasado">*</i>' : ''}`;
          // Lluvia pronosticada + algo al aire libre: avisar
          const al = cont.querySelector(`[data-clima-alerta="${d.fecha}"]`);
          if (al && datos.tipo === 'pronostico' && llueve(d)) {
            al.querySelector('p').textContent = `${d.codigo >= 95 ? '⛈️ Se esperan tormentas' : '🌧️ Se espera lluvia'}${d.lluvia ? ` (${Math.round(d.lluvia)} mm)` : ''} y tenés ${al.dataset.que} al aire libre. ¿Lo pasás a otro día o vas con piloto?`;
            al.hidden = false;
          }
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
          ${R.familia && R.db.modo() === 'nube' ? `<button class="btn btn-primario btn-bloque" data-a="familia">👪 Link para la familia${v.linkFamilia && v.linkFamilia.activo ? ' · activo' : ''}</button>` : ''}
          <button class="btn ${R.familia && R.db.modo() === 'nube' ? 'btn-suave' : 'btn-primario'} btn-bloque" data-a="nativo">↗ Mandar el itinerario como texto</button>
          <button class="btn btn-suave btn-bloque" data-a="copiar">📋 Copiar texto</button>
          <button class="btn btn-suave btn-bloque" data-a="pdf">📄 Descargar PDF</button>
          ${navigator.canShare ? '<button class="btn btn-suave btn-bloque" data-a="pdfCompartir">📤 Compartir el PDF</button>' : ''}
          <button class="btn btn-suave btn-bloque" data-a="ics">📆 Agregar al calendario</button>
        </div>
        <pre class="vista-texto">${esc(texto)}</pre>`
    });
    const bFam = el.querySelector('[data-a="familia"]');
    if (bFam) bFam.onclick = () => { U.cerrarModal(); R.familia.abrir(v); };
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
      const uid = `${U.id('ics')}@rutenda`;
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
    a.download = `rutenda-${(v.nombre || v.destino || 'viaje').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.ics`;
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
        <label class="campo"><span>Título *</span><input id="iTitulo" value="${esc(e.titulo)}" placeholder="Ej: visita guiada, cena especial"></label>
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
  /** "🕒 Hora local 15:30 · en casa 10:30" (solo si hay diferencia). */
  function horaLocalHTML(v, d) {
    const lugar = d.lugar;
    const dif = C().difConCasa(v, lugar, d.fecha);
    if (!dif) return '';
    return `<p class="hora-local">🕒 Hora local <strong>${C().horaEn(lugar.zona)}</strong> · en casa ${C().horaEn(C().zonaCasa(v))} (${C().fmtDif(-dif)})</p>`;
  }

  function hoyHTML(v) {
    const hoy = U.hoyISO();
    if (!v.fechaInicio || hoy < v.fechaInicio || (v.fechaFin && hoy > v.fechaFin)) return '';
    const d = diaDe(v, hoy);
    const manana = v.fechaFin && hoy < v.fechaFin ? diaDe(v, U.sumarDias(hoy, 1)) : null;
    const proximo = manana && manana.items.find(i => i.clase === 'ev-traslado');
    return `
      <section class="modo-viaje bloque">
        <div class="mv-cab">
          <div><span class="etiqueta">Hoy en el viaje</span><h3>Día ${d.numero}${d.lugarNombre ? ' · ' + esc(d.lugarNombre) : ''}</h3><small>${U.fmtFecha(hoy, 'largo')}</small>${horaLocalHTML(v, d)}</div>
          <span class="dia-clima" data-clima-dia="${hoy}"></span>
        </div>
        ${d.items.length ? d.items.map(itemHTML).join('') : '<p class="dia-libre">Día libre ☀️ Disfrutalo.</p>'}
          ${R.gmaps ? R.gmaps.enlaceDiaHTML(d) : ''}
        ${d.dormis ? `<p class="dia-linea dia-dormis">${d.dormis.icono} ${esc(d.dormis.texto)}${d.dormis.direccion ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.dormis.direccion)}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}</p>` : ''}
        ${proximo ? `<p class="mv-manana">Mañana: ${proximo.icono} ${proximo.hora ? proximo.hora + ' · ' : ''}${esc(proximo.titulo)}</p>` : ''}
        <a class="btn btn-suave btn-chico" href="#viaje/${v.id}/itinerario">Ver todo el itinerario →</a>
      </section>`;
  }

  /* ---------------------------------------------------------
     Pestaña "Hoy": lo útil del día mientras viajás
     --------------------------------------------------------- */
  function renderHoy(v, cont) {
    const hoy = U.hoyISO();
    const dias = diasDelViaje(v);
    const d = diaDe(v, hoy);
    const ultimo = v.fechaFin === hoy;
    const manana = !ultimo && v.fechaFin ? diaDe(v, U.sumarDias(hoy, 1)) : null;
    const gastoHoy = v.movimientos.filter(m => m.fecha === hoy).reduce((a, m) => a + (m.tipo === 'gasto' ? R.gastos.montoBase(v, m) : m.tipo === 'ingreso' ? -R.gastos.montoBase(v, m) : 0), 0);
    // Lo de la guía que conviene hacer hoy (por ejemplo, el check-in que se habilitó)
    const paraHoy = R.motor.analizar(v).filter(t => !t.resuelta && !t.esperaVentana && !t.rec && t.fechaLimite && t.fechaLimite >= hoy && t.fechaLimite <= U.sumarDias(hoy, 1)).slice(0, 3);
    const dm = d.dormis;
    cont.innerHTML = `
      <div class="hoy-vista">
        <section class="hoy-cab">
          <div>
            <span class="etiqueta">Día ${d.numero} de ${dias.length}</span>
            <h2>${d.lugarNombre ? esc(d.lugarNombre) : 'Hoy'}</h2>
            <small>${U.fmtFecha(hoy, 'largo')}</small>
            ${horaLocalHTML(v, d)}
          </div>
          <span class="dia-clima hoy-clima" data-clima-dia="${hoy}"></span>
        </section>

        ${R.salida ? R.salida.tarjetaHTML(v) : ''}
        ${R.pasaje ? R.pasaje.html(v) : ''}
        ${R.vuelta ? R.vuelta.tarjetaHTML(v) : ''}
        ${paraHoy.length ? `
          <section class="bloque hoy-pendiente">
            <h3 class="bloque-titulo">Para hacer hoy</h3>
            ${paraHoy.map(t => `<button class="fila-siguiente" data-tarea-hoy="${t.id}"><span class="num">${R.guia.fase(t.fase).icono}</span><span class="fs-texto"><strong>${esc(t.titulo)}</strong></span></button>`).join('')}
          </section>` : ''}

        <section class="bloque">
          <h3 class="bloque-titulo">Hoy</h3>
          ${d.amaneces && d.amaneces !== 'Amanecés en ' + d.lugarNombre ? `<p class="dia-linea">🌅 ${esc(d.amaneces)}</p>` : ''}
          ${enArgentina(v, d) ? `<p class="dia-linea dia-feriado" data-feriado-dia="${d.fecha}" hidden></p>` : ''}
          ${alertaHTML(d)}
          ${d.items.length ? d.items.map(itemHTML).join('') : '<p class="dia-libre">Día libre ☀️ Disfrutalo.</p>'}
          ${R.gmaps ? R.gmaps.enlaceDiaHTML(d) : ''}
          <button class="btn btn-texto btn-chico solo-org" data-a="actividad">+ Agregar algo a hoy</button>
        </section>

        ${dm ? `
          <section class="bloque hoy-dormis ${dm.falta ? 'falta' : ''}">
            <h3 class="bloque-titulo">Esta noche dormís en</h3>
            <p><strong>${esc(dm.texto)}</strong></p>
            ${dm.direccion ? `<a class="btn btn-suave btn-chico" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dm.direccion)}" target="_blank" rel="noopener">📍 Cómo llegar</a>` : ''}
          </section>` : ''}

        <section class="bloque hoy-gastos">
          <div><small>Gastado hoy</small><strong>${U.fmtMoneda(gastoHoy, v.monedaBase)}</strong></div>
          <button class="btn btn-primario" data-a="gasto">− Cargar gasto</button>
        </section>
        <button type="button" class="btn btn-texto btn-chico hoy-algo-mal" data-a="algoMal">🧭 ¿Algo salió mal? Qué hacer si…</button>
        ${R.preguntar && R.db.modo() === 'nube' ? '<button type="button" class="barra-preguntar" data-a="preguntar"><span>✨</span><span><strong>Preguntale a Rutenda</strong><small>¿Qué hay mañana? ¿Cuánto llevo gastado?</small></span><b>Preguntar →</b></button>' : ''}

        ${ultimo && !(R.vuelta && R.vuelta.aplica(v)) ? `
          <section class="bloque">
            <h3 class="bloque-titulo">🏠 Hoy volvés</h3>
            <p class="texto-suave">Revisá que no quede nada en el alojamiento.</p>
            <a class="btn btn-suave btn-chico" href="#viaje/${v.id}/valija">🧳 Valija de vuelta</a>
          </section>` : manana ? `
          <section class="bloque hoy-manana">
            <h3 class="bloque-titulo">Mañana${manana.lugarNombre && manana.lugarNombre !== d.lugarNombre ? ' · ' + esc(manana.lugarNombre) : ''}</h3>
            ${alertaHTML(manana)}
            ${manana.items.length ? manana.items.slice(0, 3).map(itemHTML).join('') : '<p class="dia-libre">Día libre ☀️</p>'}
          </section>` : ''}
      </div>`;

    cont.querySelector('[data-a="gasto"]').onclick = () => R.gastos.nuevo(v);
    const bPreg = cont.querySelector('[data-a="preguntar"]');
    if (bPreg) bPreg.onclick = () => R.preguntar.abrir(v);
    const bMal = cont.querySelector('[data-a="algoMal"]');
    if (bMal) bMal.onclick = () => R.queHacerSi.ir(v);
    if (R.salida) R.salida.enlazar(cont, v);
    if (R.pasaje) R.pasaje.enlazar(cont, v);
    if (R.ordenar) R.ordenar.enlazar(cont, v);
    if (R.vuelta) R.vuelta.enlazar(cont, v);
    cargarFeriados(v, cont);
    const bAct = cont.querySelector('[data-a="actividad"]');
    if (bAct) bAct.onclick = () => editar(v, null, hoy);
    cont.querySelectorAll('[data-tarea-hoy]').forEach(b => b.onclick = () => R.vistaGuia.abrirTarea(v, b.dataset.tareaHoy));
    cont.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => { const [d, id] = b.dataset.plan.split('|'); R.ideas.editar(v, d, id, () => renderHoy(v, cont)); });
    cont.querySelectorAll('[data-evento]').forEach(b => b.onclick = () => editar(v, b.dataset.evento));
    cont.querySelectorAll('[data-doc]').forEach(b => b.onclick = e => { e.stopPropagation(); R.documentos.abrir(v.documentos.find(x => x.id === b.dataset.doc), v); });
    // Clima de hoy y de mañana (y aviso si llueve con planes al aire libre)
    cargarClima(v, cont);
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

  return { TIPOS, render, renderHoy, irAQueHacer, editar, editarCronograma, diaDe, diasDelViaje, hoyHTML, enlazarHoy, textoItinerario, generarICS, compartir };
})();
