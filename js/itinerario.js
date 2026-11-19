/* =========================================================
   Rutenda — Itinerario
   Los días del viaje, uno abajo del otro. En cada día:
   lo que hacés (con hora), check-in y check-out, y dónde
   dormís esa noche. Todo lo pone el usuario: tocás algo para
   verlo o cambiarlo, lo mantenés apretado para pasarlo a otro
   día, y "+ Agregar" en cada día.
   ========================================================= */
window.R = window.R || {};

R.itinerario = (function () {
  const U = R.util;
  const { esc } = U;
  const A = () => R.agenda;

  /* ---------------------------------------------------------
     Un día, armado (también lo usan el PDF, la familia y Google Maps)
     --------------------------------------------------------- */
  function diasDelViaje(v) { return A().dias(v); }

  function detalleItem(it) {
    const t = A().tipo(it.tipo);
    const partes = [];
    if (t.traslado) {
      if (it.aeroDesde || it.aeroHasta) partes.push(`${it.aeroDesde || '?'} → ${it.aeroHasta || '?'}`);
      if (it.horaLlegada) partes.push(`llega ${it.fechaLlegada && it.fechaLlegada !== it.fecha ? U.fmtFecha(it.fechaLlegada, 'dia') + ' ' : ''}${it.horaLlegada}`);
      if (it.numero || it.empresa) partes.push([it.empresa, it.numero].filter(Boolean).join(' '));
    }
    if (it.codigo) partes.push('Cód. ' + it.codigo);
    if (!t.traslado && it.lugar) partes.push(it.lugar);
    return partes.join(' · ');
  }

  /** "🚕 Taxi o remis al aeropuerto · Falta: cómo salís del aeropuerto" */
  function conexionesTexto(it) {
    if (!A().esProgramado(it)) return null;
    const term = A().TERMINAL[it.tipo];
    const fem = term === 'terminal' || term === 'estación';
    const al = fem ? 'a la' : 'al', del = fem ? 'de la' : 'del';
    const txt = (k, prep) => { const c = A().conexion(k); return c && k !== 'no' ? `${c[1]} ${c[2]} ${prep} ${term}` : ''; };
    const hechas = [txt(it.alSalir, al), txt(it.alLlegar, del)].filter(Boolean);
    const faltan = [!it.alSalir ? `cómo llegás ${al} ${term}` : '', !it.alLlegar ? `cómo salís ${del} ${term}` : ''].filter(Boolean);
    return hechas.length || faltan.length ? { ok: hechas.join(' · '), falta: faltan.length ? 'Falta: ' + faltan.join(' y ') : '' } : null;
  }

  /** Dónde estás ese día (para el PDF y el link de la familia): adonde llegaste con el último traslado, o el único destino. */
  function ciudadDe(v, fecha) {
    const segs = A().segmentos(v).filter(s => s.sale.fecha <= fecha && s.hasta.nombre);
    if (segs.length) {
      const ult = segs[segs.length - 1];
      const casa = v.origen && v.origen.nombre && ult.hasta.nombre.toLowerCase() === v.origen.nombre.toLowerCase();
      return casa && fecha > ult.sale.fecha ? '' : ult.hasta.nombre;
    }
    const ds = (v.destinos || []).filter(d => d.nombre && !d.soloDia);
    return ds.length === 1 ? ds[0].nombre : '';
  }

  function diaDe(v, fecha) {
    const dias = A().dias(v);
    const numero = dias.indexOf(fecha) + 1;
    const anoche = A().nocheDe(v, U.sumarDias(fecha, -1));
    const noche = A().nocheDe(v, fecha);
    const items = [];
    (v.alojamientos || []).filter(a => a.hasta === fecha).forEach(a => items.push({
      id: a.id, alojamiento: true, hora: a.checkout || '', orden: a.checkout || '00', icono: '🛏️', titulo: `Check-out · ${A().nombreAlojamiento(a)}`, sub: '', lugar: a.direccion || '', clase: 'ev-aloj'
    }));
    A().delDia(v, fecha).forEach(it => {
      const t = A().tipo(it.tipo);
      items.push({
        id: it.id, hora: it.hora || '', icono: t.icono, titulo: it.titulo || t.nombre, sub: detalleItem(it), nota: it.nota || '',
        lugar: t.traslado ? '' : (it.lugar || ''), clase: t.traslado ? 'ev-traslado' : '', tipo: it.tipo,
        docs: A().docsDe(v, it.id).length, checkin: it.fecha >= U.hoyISO() ? A().checkin(it) : null, conexiones: conexionesTexto(it)
      });
    });
    (v.alojamientos || []).filter(a => a.desde === fecha).forEach(a => items.push({
      id: a.id, alojamiento: true, hora: a.checkin || '', orden: a.checkin || '98', icono: '🛏️', titulo: `Check-in · ${A().nombreAlojamiento(a)}`,
      sub: [a.direccion, a.codigo ? 'Cód. ' + a.codigo : ''].filter(Boolean).join(' · '), lugar: a.direccion || '', clase: 'ev-aloj', docs: A().docsDe(v, a.id).length
    }));
    // Sin hora: el check-out va primero, el check-in al final del día
    items.sort((a, b) => (a.orden || a.hora || '99').localeCompare(b.orden || b.hora || '99'));
    const lugarDe = a => a ? (a.direccion || a.nombre || '') : '';
    return {
      fecha, numero, items,
      dormis: noche ? { icono: '🛏️', texto: A().nombreAlojamiento(noche), direccion: noche.direccion || '', id: noche.id }
        : (v.noches || {})[fecha] === 'viaje' ? { icono: '🚌', texto: 'Viajando', viaje: true }
        : (v.noches || {})[fecha] === 'casa' ? { icono: '🏠', texto: 'En casa', casa: true } : null,
      amaneces: null, lugarNombre: ciudadDe(v, fecha), soloDia: false,
      inicioLugar: lugarDe(anoche), finLugar: lugarDe(noche),
      lugar: R.direcciones ? R.direcciones.cercaDe(v, null) : null
    };
  }

  /* ---------------------------------------------------------
     Vista
     --------------------------------------------------------- */
  function itemHTML(v, d, it) {
    const ck = it.checkin;
    return `
      <button type="button" class="it2 ${it.clase || ''}" ${it.alojamiento ? `data-aloj="${it.id}"` : `data-item="${it.id}"`} data-dia="${d.fecha}">
        <span class="it2-hora">${esc(it.hora || '')}</span>
        <span class="it2-ico" aria-hidden="true">${it.icono}</span>
        <span class="it2-texto">
          <strong>${esc(it.titulo)}</strong>
          ${it.sub ? `<small>${esc(it.sub)}</small>` : ''}
          ${it.nota ? `<small class="it2-nota">${esc(it.nota)}</small>` : ''}
          ${it.conexiones && it.conexiones.ok ? `<small class="it2-con">${esc(it.conexiones.ok)}</small>` : ''}
          ${it.conexiones && it.conexiones.falta && v.armado && R.db.puedeOrganizar(v) ? `<small class="it2-falta">${esc(it.conexiones.falta)}</small>` : ''}
          ${ck ? `<small class="it2-checkin">Check-in online desde el ${esc(U.fmtFecha(ck.fecha, 'dia'))}${ck.hora ? ' a las ' + esc(ck.hora) : ''}</small>` : ''}
        </span>
        ${it.docs ? `<span class="it2-docs" aria-label="${it.docs} archivos">📎${it.docs > 1 ? it.docs : ''}</span>` : ''}
      </button>`;
  }

  function diaHTML(v, fecha, hoy, puede) {
    const d = diaDe(v, fecha);
    const ultimo = v.fechaFin && fecha >= v.fechaFin;
    const enRango = !v.fechaInicio || (fecha >= v.fechaInicio && (!v.fechaFin || fecha <= v.fechaFin));
    const ruta = R.gmaps ? R.gmaps.enlaceDiaHTML(d) : '';
    return `
      <section class="dia2 ${fecha === hoy ? 'hoy' : ''} ${fecha < hoy ? 'pasado' : ''}" id="dia-${fecha}" data-fecha="${fecha}">
        <header class="dia2-cab">
          <strong>${esc(U.fmtFecha(fecha, 'dia'))}</strong>
          <span>${enRango ? 'Día ' + d.numero : 'Fuera de las fechas'}</span>
          ${fecha === hoy ? '<em class="dia2-hoy">Hoy</em>' : ''}
        </header>
        <div class="dia2-items">
          ${d.items.length ? d.items.map(it => itemHTML(v, d, it)).join('') : '<p class="dia2-libre">Día libre</p>'}
        </div>
        ${ruta}
        <footer class="dia2-pie">
          ${d.dormis && d.dormis.id
            ? `<button type="button" class="dia2-noche" data-aloj="${d.dormis.id}"><span aria-hidden="true">🛏️</span><span>Dormís en <strong>${esc(d.dormis.texto)}</strong></span></button>`
            : d.dormis ? `<button type="button" class="dia2-noche" ${puede ? `data-noche="${fecha}"` : 'disabled'}><span aria-hidden="true">${d.dormis.icono}</span><span>${d.dormis.viaje ? 'Esta noche, <strong>viajando</strong>' : 'Esta noche, <strong>en casa</strong>'}</span></button>`
            : ultimo ? '<span class="dia2-noche sin"><span aria-hidden="true">🏠</span><span>Volvés a casa</span></span>'
            : puede ? `<button type="button" class="dia2-noche sin" data-noche="${fecha}"><span aria-hidden="true">🛏️</span><span>¿Dónde dormís esta noche?</span></button>` : '<span></span>'}
          ${puede ? `<button type="button" class="dia2-mas" data-agregar="${fecha}">+ Agregar</button>` : ''}
        </footer>
      </section>`;
  }

  function render(v, cont) {
    const puede = R.db.puedeOrganizar(v);
    const hoy = U.hoyISO();
    const dias = A().dias(v);
    const ideas = A().ideas(v);
    cont.innerHTML = `
      <div class="itin2">
        ${R.armar ? R.armar.faltaHTML(v) : ''}
        ${puede ? `<div class="itin2-acciones">
          <button type="button" class="btn btn-primario btn-chico" data-agregar="">+ Agregar</button>
          ${R.importar ? '<button type="button" class="btn btn-suave btn-chico" data-a="pegar">🎫 Reserva</button>' : ''}
          <button type="button" class="btn btn-suave btn-chico" data-a="nuevoAloj">🛏️ Alojamiento</button>
        </div>` : ''}
        ${ideas.length ? `
          <button type="button" class="itin2-ideas" data-a="ideas">
            <span><strong>${ideas.length === 1 ? '1 idea sin día' : ideas.length + ' ideas sin día'}</strong><small>${esc(ideas.slice(0, 4).map(i => i.titulo).join(' · '))}</small></span>
            <b>Ubicar</b>
          </button>` : ''}
        ${dias.length ? dias.map(f => diaHTML(v, f, hoy, puede)).join('') : `
          ${U.vacio({ icono: '🗓️', titulo: 'Poné las fechas del viaje', texto: 'Con la ida y la vuelta se arman los días. Después cargás qué hacés cada día.', boton: puede ? 'Poner las fechas' : '', accion: 'fechas' })}`}
        ${puede && dias.length ? '<p class="ayuda itin2-ayuda">Tocá algo para verlo o cambiarlo. Mantenelo apretado para pasarlo a otro día.</p>' : ''}
      </div>`;
    enlazar(v, cont);
    // Viajando: arranca en el día de hoy
    const hoyEl = cont.querySelector('.dia2.hoy');
    if (hoyEl && !render._yaFue) { render._yaFue = v.id; setTimeout(() => hoyEl.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120); }
  }

  function enlazar(v, cont) {
    const puede = R.db.puedeOrganizar(v);
    const repintar = () => R.app.refrescar();
    cont.querySelectorAll('[data-agregar]').forEach(b => b.onclick = () => editarItem(v, null, { fecha: b.dataset.agregar }));
    cont.querySelectorAll('[data-noche]').forEach(b => b.onclick = () => elegirNoche(v, b.dataset.noche));
    cont.querySelectorAll('[data-aloj]').forEach(b => b.onclick = () => editarAlojamiento(v, b.dataset.aloj));
    const bp = cont.querySelector('[data-a="pegar"]');
    if (bp) bp.onclick = () => R.importar.elegir(v);
    const ba = cont.querySelector('[data-a="nuevoAloj"]');
    if (ba) ba.onclick = () => editarAlojamiento(v, null, {});
    const bi = cont.querySelector('[data-a="ideas"]');
    if (bi) bi.onclick = () => { location.hash = `#viaje/${v.id}/pendientes`; };
    const bf = cont.querySelector('[data-a="fechas"]');
    if (bf) bf.onclick = () => R.viajes.editar(v);
    if (R.ordenar) R.ordenar.enlazar(cont, v);
    // Tocar: ver o cambiar. Mantener apretado: pasar a otro día.
    cont.querySelectorAll('[data-item]').forEach(b => {
      let reloj = null, largo = false;
      const cancelar = () => { clearTimeout(reloj); reloj = null; };
      b.addEventListener('pointerdown', () => {
        largo = false;
        if (!puede) return;
        reloj = setTimeout(() => { largo = true; if (navigator.vibrate) navigator.vibrate(15); mover(v, b.dataset.item, repintar); }, 520);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, cancelar));
      b.addEventListener('contextmenu', e => e.preventDefault());
      b.onclick = () => { if (largo) { largo = false; return; } editarItem(v, b.dataset.item); };
    });
  }

  /* ---------------------------------------------------------
     Pasar algo a otro día (o devolverlo a "Quiero hacer")
     --------------------------------------------------------- */
  function opcionesDias(v, actual) {
    return A().dias(v).map(f => `<button type="button" class="chip-dia ${f === actual ? 'activo' : ''}" data-mover="${f}">${esc(U.fmtFecha(f, 'dia'))}</button>`).join('');
  }
  function mover(v, id, alTerminar) {
    const it = A().item(v, id);
    if (!it) return;
    const { el } = U.modal({
      titulo: 'Pasar a otro día',
      subtitulo: it.titulo,
      cuerpo: `<div class="chips-dias">${opcionesDias(v, it.fecha)}</div>
        <button type="button" class="btn btn-texto" data-mover="">↩︎ Sin día (vuelve a "Quiero hacer")</button>`
    });
    el.querySelectorAll('[data-mover]').forEach(b => b.onclick = () => {
      it.fecha = b.dataset.mover;
      A().guardarItem(v, it);
      R.db.guardarViaje(v);
      U.cerrarModal();
      U.toast(it.fecha ? `Pasó al ${U.fmtFecha(it.fecha, 'dia')}.` : 'Volvió a "Quiero hacer".');
      if (alTerminar) alTerminar(); else R.app.refrescar();
    });
  }

  /* ---------------------------------------------------------
     Agregar o cambiar algo del itinerario
     --------------------------------------------------------- */
  const CATEGORIA = { vuelo: 'transporte', micro: 'transporte', tren: 'transporte', barco: 'transporte', auto: 'transporte', traslado: 'transporte', taxi: 'transporte', otromedio: 'transporte', comida: 'comida', paseo: 'actividades', excursion: 'actividades', entrada: 'actividades', otro: 'otros' };

  /** El gasto que se cargó junto con algo del itinerario o un alojamiento. */
  function gastoDe(v, id) { return (v.movimientos || []).find(m => m.origenItem === id) || null; }
  function costoHTML(v, id) {
    const g = gastoDe(v, id);
    const varios = (v.participantes || []).length > 1;
    const yo = R.db.yoEn(v);
    const quien = g ? g.persona : yo;
    return `
      <div class="grilla-2">
        <label class="campo"><span>Cuánto salió <small>(opcional)</small></span><input id="cMonto" inputmode="decimal" value="${g ? esc(g.monto) : ''}" placeholder="$ 0"></label>
        ${varios ? `<label class="campo"><span>¿Quién pagó?</span><select id="cQuien">${v.participantes.map(p => `<option value="${p}" ${p === quien ? 'selected' : ''}>${esc((R.db.persona(p) || {}).nombre || 'Viajero')}</option>`).join('')}</select></label>` : ''}
      </div>
      <p class="ayuda">Se suma solo a Gastos${varios ? ', dividido entre todos' : ''}.</p>`;
  }
  function guardarCosto(v, el, id, concepto, categoria) {
    const monto = U.numero((el.querySelector('#cMonto') || {}).value);
    const g = gastoDe(v, id);
    if (!monto) { if (g) v.movimientos = v.movimientos.filter(m => m !== g); return; }
    const persona = (el.querySelector('#cQuien') || {}).value || (g && g.persona) || R.db.yoEn(v);
    const nuevo = Object.assign(g || { id: U.id('mov'), tipo: 'gasto', fecha: U.hoyISO(), creado: new Date().toISOString(), moneda: v.monedaBase, cotizacion: 1, division: { modo: 'igual', entre: v.participantes.slice(), montos: {} } }, {
      origenItem: id, concepto, categoria, monto, persona
    });
    if (!g) v.movimientos.push(nuevo);
  }
  function datalist(id, lista) { return `<datalist id="${id}">${lista.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`; }

  function editarItem(v, id, op) {
    const o = op || {};
    const puede = R.db.puedeOrganizar(v);
    const existente = id ? A().item(v, id) : null;
    const it = existente ? Object.assign({}, existente) : A().nuevoItem({ fecha: o.fecha || '', tipo: o.tipo || 'paseo', titulo: o.titulo || '' });
    const archivos = [];
    const docs = existente ? A().docsDe(v, it.id) : [];
    const dias = A().dias(v);
    const tiposBtn = A().ORDEN_TIPOS.filter(k => A().TIPOS_A_LA_VISTA.includes(k) || k === it.tipo).map(k => `<button type="button" class="chip-op ${it.tipo === k ? 'activo' : ''}" data-tipo="${k}">${A().TIPOS[k].icono} ${A().TIPOS[k].nombre}</button>`).join('');
    const { el } = U.modal({
      titulo: existente ? (puede ? 'Cambiar' : 'Detalle') : 'Agregar al itinerario',
      cuerpo: `
        <div class="form-item ${puede ? '' : 'solo-ver'}">
          <div class="chips-elegir chips-chicos tipos-item">${tiposBtn}</div>
          <div class="si-traslado">
            <div class="grilla-2">
              <label class="campo"><span>Desde</span><input id="iDesde" value="${esc(it.desde || '')}" placeholder="Ej: Buenos Aires"></label>
              <label class="campo"><span>Hasta</span><input id="iHasta" value="${esc(it.hasta || '')}" placeholder="Ej: Bariloche"></label>
            </div>
          </div>
          <label class="campo no-traslado"><span>¿Qué?</span><input id="iTitulo" value="${esc(it.titulo || '')}" placeholder="Ej: Cerro Campanario"></label>
          <div class="grilla-2">
            <label class="campo"><span>Día</span><select id="iFecha">
              <option value="">Sin día (Quiero hacer)</option>
              ${dias.map(f => `<option value="${f}" ${f === it.fecha ? 'selected' : ''}>${esc(U.fmtFecha(f, 'dia'))}</option>`).join('')}
              ${it.fecha && !dias.includes(it.fecha) ? `<option value="${it.fecha}" selected>${esc(U.fmtFecha(it.fecha, 'dia'))}</option>` : ''}
            </select></label>
            <label class="campo"><span class="lbl-hora">Hora</span><input type="time" id="iHora" value="${esc(it.hora || '')}"></label>
          </div>
          <div class="si-traslado grilla-2">
            <label class="campo"><span>Llega</span><input type="time" id="iLlega" value="${esc(it.horaLlegada || '')}"></label>
            <label class="campo"><span>N° <small>(vuelo, servicio)</small></span><input id="iNumero" value="${esc(it.numero || '')}" autocapitalize="characters" placeholder="Ej: AR1672"></label>
          </div>
          <div class="si-vuelo grilla-2">
            <label class="campo"><span>Aeropuerto de salida</span><input id="iAeroDesde" value="${esc(it.aeroDesde || '')}" maxlength="3" autocapitalize="characters" placeholder="Sigla, ej: AEP"></label>
            <label class="campo"><span>Aeropuerto de llegada</span><input id="iAeroHasta" value="${esc(it.aeroHasta || '')}" maxlength="3" autocapitalize="characters" placeholder="Sigla, ej: BRC"></label>
          </div>
          <div class="si-programado grilla-2">
            <label class="campo"><span class="lbl-con-salir">Hasta la terminal</span><select id="iAlSalir"><option value="">Sin resolver</option>${A().CONEXIONES.map(([k, ic, n]) => `<option value="${k}" ${it.alSalir === k ? 'selected' : ''}>${ic} ${n}</option>`).join('')}</select></label>
            <label class="campo"><span class="lbl-con-llegar">Desde la terminal</span><select id="iAlLlegar"><option value="">Sin resolver</option>${A().CONEXIONES.map(([k, ic, n]) => `<option value="${k}" ${it.alLlegar === k ? 'selected' : ''}>${ic} ${n}</option>`).join('')}</select></label>
          </div>
          <label class="campo no-traslado"><span>Dónde</span><input id="iLugar" value="${esc(it.lugar || '')}" placeholder="Escribí el lugar y elegí de la lista"></label>
          <div class="form-opcional">
            <div class="grilla-2 si-traslado">
              <label class="campo"><span>Empresa <small>(opcional)</small></span><input id="iEmpresa" value="${esc(it.empresa || '')}" list="dlEmpresas" autocomplete="off"></label>
              <label class="campo"><span>Llega otro día <small>(opcional)</small></span><input type="date" id="iFechaLlega" value="${esc(it.fechaLlegada && it.fechaLlegada !== it.fecha ? it.fechaLlegada : '')}" ${it.fecha ? `min="${it.fecha}"` : ''}></label>
            </div>
            <label class="campo"><span>Código de reserva <small>(opcional)</small></span><input id="iCodigo" value="${esc(it.codigo || '')}" autocapitalize="characters"></label>
            <label class="campo"><span>Notas <small>(opcional)</small></span><textarea id="iNota" rows="2" placeholder="Ej: llevar efectivo, asientos 14A y 14B">${esc(it.nota || '')}</textarea></label>
            ${puede ? costoHTML(v, it.id) : ''}
            ${docs.length ? `<div class="docs-item">${docs.map(d => `<button type="button" class="chip-doc" data-doc="${d.id}">📎 ${esc(d.nombre)}</button>`).join('')}</div>` : ''}
            ${puede ? U.zonaArchivos('item', archivos, 'Sumar el pasaje, voucher o entrada', true) : ''}
          </div>
          ${datalist('dlEmpresas', A().usados('empresa'))}
        </div>`,
      acciones: puede ? [
        ...(existente ? [{ texto: 'Borrar', clase: 'btn-texto peligro', onClick: () => { borrar(v, existente); return false; } }] : []),
        { texto: 'Cancelar' },
        { texto: 'Guardar', clase: 'btn-primario', onClick: el2 => guardar(el2) }
      ] : [{ texto: 'Cerrar' }]
    });
    const form = el.querySelector('.form-item');
    const pintarTipo = () => {
      const tr = A().tipo(it.tipo).traslado;
      form.classList.toggle('es-traslado', !!tr);
      form.classList.toggle('es-vuelo', it.tipo === 'vuelo');
      form.classList.toggle('es-programado', A().esProgramado(it));
      const term = A().TERMINAL[it.tipo] || 'terminal';
      el.querySelector('.lbl-con-salir').textContent = `Cómo llegás ${term === 'terminal' || term === 'estación' ? 'a la' : 'al'} ${term}`;
      el.querySelector('.lbl-con-llegar').textContent = `Cómo salís ${term === 'terminal' || term === 'estación' ? 'de la' : 'del'} ${term}`;
      el.querySelector('.lbl-hora').textContent = tr ? 'Sale' : 'Hora';
      el.querySelectorAll('[data-tipo]').forEach(b => b.classList.toggle('activo', b.dataset.tipo === it.tipo));
    };
    pintarTipo();
    el.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { if (!puede) return; it.tipo = b.dataset.tipo; pintarTipo(); });
    const fSale = el.querySelector('#iFecha'), fLlega = el.querySelector('#iFechaLlega');
    fSale.addEventListener('change', () => { fLlega.min = fSale.value || ''; if (fLlega.value && fLlega.value < fSale.value) fLlega.value = ''; });
    const num = el.querySelector('#iNumero'), emp = el.querySelector('#iEmpresa');
    num.addEventListener('change', () => { const a = A().aerolineaDe(num.value); if (a && !emp.value.trim()) emp.value = a; });
    el.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => R.documentos.abrir((v.documentos || []).find(d => d.id === b.dataset.doc), v));
    if (puede) U.enlazarArchivos(el, 'item', archivos, () => U.repintarArchivos(el, 'item', archivos, 'Sumar el pasaje, voucher o entrada', true));
    if (R.direcciones) R.direcciones.enlazar(el.querySelector('#iLugar'), { cerca: R.direcciones.cercaDe(v, null) });
    if (!puede) el.querySelectorAll('input, select, textarea').forEach(x => { x.disabled = true; });
    if (!existente) setTimeout(() => { const f = A().tipo(it.tipo).traslado ? el.querySelector('#iDesde') : el.querySelector('#iTitulo'); if (f) f.focus(); }, 80);

    function guardar(f) {
      const val = s => (f.querySelector(s) || {}).value || '';
      const tr = A().tipo(it.tipo).traslado;
      it.fecha = val('#iFecha'); it.hora = val('#iHora');
      it.lugar = tr ? '' : val('#iLugar').trim();
      it.nota = val('#iNota').trim(); it.codigo = val('#iCodigo').trim().toUpperCase();
      if (tr) {
        it.desde = val('#iDesde').trim(); it.hasta = val('#iHasta').trim();
        it.horaLlegada = val('#iLlega'); it.numero = val('#iNumero').trim().toUpperCase();
        it.empresa = val('#iEmpresa').trim() || A().aerolineaDe(it.numero);
        it.aeroDesde = it.tipo === 'vuelo' ? val('#iAeroDesde').trim().toUpperCase() : '';
        it.aeroHasta = it.tipo === 'vuelo' ? val('#iAeroHasta').trim().toUpperCase() : '';
        it.alSalir = A().esProgramado(it) ? val('#iAlSalir') : '';
        it.alLlegar = A().esProgramado(it) ? val('#iAlLlegar') : '';
        it.sinMedio = false;
        if (it.fecha) it.pendiente = false;
        it.fechaLlegada = val('#iFechaLlega');
        it.titulo = it.desde || it.hasta ? `${it.desde || '?'} → ${it.hasta || '?'}` : A().tipo(it.tipo).nombre;
      } else {
        it.titulo = val('#iTitulo').trim();
        ['desde', 'hasta', 'horaLlegada', 'numero', 'empresa', 'fechaLlegada'].forEach(k => delete it[k]);
        if (!it.titulo) { U.toast('Escribí qué es.'); return false; }
      }
      A().guardarItem(v, it);
      guardarCosto(v, f, it.id, it.titulo, CATEGORIA[it.tipo] || 'otros');
      const terminar = () => { R.db.guardarViaje(v); U.toast(it.fecha ? 'Guardado ✓' : 'Guardado en "Quiero hacer".'); R.app.refrescar(); };
      if (archivos.length) R.documentos.guardarArchivos(v, archivos, { categoria: 'reserva', itemId: it.id }).then(terminar).catch(e => { U.toast(e.message); terminar(); });
      else terminar();
      return true;
    }
  }

  async function borrar(v, it) {
    const ok = await U.confirmar(`Se borra "${it.titulo}" del itinerario${gastoDe(v, it.id) ? ' y su gasto' : ''}.`, { titulo: 'Borrar', textoSi: 'Borrar', peligro: true });
    if (!ok) return;
    A().borrarItem(v, it.id);
    R.db.guardarViaje(v);
    R.app.refrescar();
  }

  /* ---------------------------------------------------------
     Dónde dormís
     --------------------------------------------------------- */
  /** "¿Dónde dormís esta noche?": un alojamiento que ya cargaste (le suma la noche) o uno nuevo. */
  function elegirNoche(v, fecha) {
    const lista = v.alojamientos || [];
    const { el } = U.modal({
      titulo: '¿Dónde dormís?',
      subtitulo: 'La noche del ' + U.fmtFecha(fecha, 'largo'),
      cuerpo: `<div class="menu-acciones">${lista.map(a => `<button type="button" class="menu-op" data-usar="${a.id}"><span>🛏️</span>${esc(A().nombreAlojamiento(a))}</button>`).join('')}
        <button type="button" class="menu-op" data-usar=""><span>＋</span>Otro alojamiento</button>
        <button type="button" class="menu-op" data-usar="viaje"><span>🚌</span>Viajando (micro, avión…)</button>
        <button type="button" class="menu-op" data-usar="casa"><span>🏠</span>En casa</button></div>`
    });
    el.querySelectorAll('[data-usar]').forEach(b => b.onclick = () => {
      if (b.dataset.usar === 'viaje' || b.dataset.usar === 'casa') {
        v.noches = Object.assign({}, v.noches, { [fecha]: b.dataset.usar });
        R.db.guardarViaje(v); U.cerrarModal(); R.app.refrescar();
        return;
      }
      if (v.noches) delete v.noches[fecha];
      const a = A().alojamiento(v, b.dataset.usar);
      if (!a) { editarAlojamiento(v, null, { desde: fecha }); return; }
      if (!a.desde || fecha < a.desde) a.desde = fecha;
      if (!a.hasta || fecha >= a.hasta) a.hasta = U.sumarDias(fecha, 1);
      A().guardarAlojamiento(v, a);
      R.db.guardarViaje(v);
      U.cerrarModal();
      R.app.refrescar();
      U.toast(`Esa noche: ${A().nombreAlojamiento(a)} ✓`);
    });
  }

  function editarAlojamiento(v, id, op) {
    const o = op || {};
    const puede = R.db.puedeOrganizar(v);
    const existente = id ? A().alojamiento(v, id) : null;
    const a = existente ? Object.assign({}, existente) : { id: U.id('al'), nombre: '', direccion: '', desde: o.desde || v.fechaInicio || '', hasta: o.desde ? U.sumarDias(o.desde, 1) : (v.fechaFin || ''), checkin: '', checkout: '', codigo: '', nota: '' };
    const archivos = [];
    const docs = existente ? A().docsDe(v, a.id) : [];
    const noches = () => { const n = el.querySelector('#aDesde').value && el.querySelector('#aHasta').value ? U.diasEntre(el.querySelector('#aDesde').value, el.querySelector('#aHasta').value) : 0; return n > 0 ? U.plural(n, 'noche', 'noches') : ''; };
    const { el } = U.modal({
      titulo: existente ? A().nombreAlojamiento(a) : 'Alojamiento',
      cuerpo: `
        <div class="form-item">
          <label class="campo"><span>Nombre${a.ciudad ? ' <small>(opcional)</small>' : ''}</span><input id="aNombre" value="${esc(a.nombre)}" list="dlAloj" autocomplete="off" placeholder="${esc(a.ciudad ? 'Alojamiento en ' + a.ciudad : 'Ej: Hotel Patagonia, depto de Airbnb')}"></label>
          <label class="campo"><span>Dirección <small>(opcional)</small></span><input id="aDir" value="${esc(a.direccion)}" placeholder="Escribí el hotel o la calle y elegí de la lista"></label>
          <div class="grilla-2">
            <label class="campo"><span>Entrás <small>(check-in)</small></span><input type="date" id="aDesde" value="${esc(a.desde)}"></label>
            <label class="campo"><span>Salís <small>(check-out)</small></span><input type="date" id="aHasta" value="${esc(a.hasta)}" ${a.desde ? `min="${a.desde}"` : ''}></label>
          </div>
          <p class="ayuda" id="aNoches">${esc(a.desde && a.hasta && a.hasta > a.desde ? U.plural(U.diasEntre(a.desde, a.hasta), 'noche', 'noches') : '')}</p>
          <div class="form-opcional">
            <div class="grilla-2">
              <label class="campo"><span>Hora de check-in</span><input type="time" id="aIn" value="${esc(a.checkin)}"></label>
              <label class="campo"><span>Hora de check-out</span><input type="time" id="aOut" value="${esc(a.checkout)}"></label>
            </div>
            <label class="campo"><span>Código de reserva <small>(opcional)</small></span><input id="aCodigo" value="${esc(a.codigo)}"></label>
            <label class="campo"><span>Notas <small>(opcional)</small></span><textarea id="aNota" rows="2" placeholder="Ej: teléfono, desayuno, cómo retirar la llave">${esc(a.nota)}</textarea></label>
            ${puede ? costoHTML(v, a.id) : ''}
            ${docs.length ? `<div class="docs-item">${docs.map(d => `<button type="button" class="chip-doc" data-doc="${d.id}">📎 ${esc(d.nombre)}</button>`).join('')}</div>` : ''}
            ${puede ? U.zonaArchivos('aloj', archivos, 'Sumar la reserva o el voucher', true) : ''}
          </div>
          ${datalist('dlAloj', A().usados('alojamiento'))}
        </div>`,
      acciones: puede ? [
        ...(existente ? [{ texto: 'Borrar', clase: 'btn-texto peligro', onClick: () => { borrarAloj(v, existente); return false; } }] : []),
        { texto: 'Cancelar' },
        { texto: 'Guardar', clase: 'btn-primario', onClick: el2 => guardar(el2) }
      ] : [{ texto: 'Cerrar' }]
    });
    ['#aDesde', '#aHasta'].forEach(s => el.querySelector(s).addEventListener('change', () => { el.querySelector('#aNoches').textContent = noches(); }));
    el.querySelector('#aDesde').addEventListener('change', e => { el.querySelector('#aHasta').min = e.target.value || ''; });
    el.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => R.documentos.abrir((v.documentos || []).find(d => d.id === b.dataset.doc), v));
    if (puede) U.enlazarArchivos(el, 'aloj', archivos, () => U.repintarArchivos(el, 'aloj', archivos, 'Sumar la reserva o el voucher', true));
    if (R.direcciones) R.direcciones.enlazar(el.querySelector('#aDir'), { cerca: R.direcciones.cercaDe(v, null) });
    if (!puede) el.querySelectorAll('input, select, textarea').forEach(x => { x.disabled = true; });

    function guardar(f) {
      const val = s => (f.querySelector(s) || {}).value || '';
      a.nombre = val('#aNombre').trim(); a.direccion = val('#aDir').trim();
      a.desde = val('#aDesde'); a.hasta = val('#aHasta');
      a.checkin = val('#aIn'); a.checkout = val('#aOut'); a.codigo = val('#aCodigo').trim(); a.nota = val('#aNota').trim();
      if (!a.nombre && !a.ciudad) { U.toast('Escribí el nombre del alojamiento.'); return false; }
      if (a.desde && a.hasta && a.hasta <= a.desde) { U.toast('La salida tiene que ser después de la entrada.'); return false; }
      A().guardarAlojamiento(v, a);
      guardarCosto(v, f, a.id, A().nombreAlojamiento(a), 'alojamiento');
      const terminar = () => { R.db.guardarViaje(v); U.toast('Guardado ✓'); R.app.refrescar(); };
      if (archivos.length) R.documentos.guardarArchivos(v, archivos, { categoria: 'reserva', itemId: a.id }).then(terminar).catch(e => { U.toast(e.message); terminar(); });
      else terminar();
      return true;
    }
  }

  async function borrarAloj(v, a) {
    const ok = await U.confirmar(`Se borra "${A().nombreAlojamiento(a)}"${gastoDe(v, a.id) ? ' y su gasto' : ''}.`, { titulo: 'Borrar alojamiento', textoSi: 'Borrar', peligro: true });
    if (!ok) return;
    A().borrarAlojamiento(v, a.id);
    R.db.guardarViaje(v);
    R.app.refrescar();
  }

  /* ---------------------------------------------------------
     Hoy, en el inicio (cuando estás viajando)
     --------------------------------------------------------- */
  function hoyHTML(v) {
    const hoy = U.hoyISO();
    const d = diaDe(v, hoy);
    return `
      <section class="hoy2" data-hoy="${v.id}">
        <div class="hoy2-cab"><strong>Hoy · Día ${d.numero || 1}</strong><a href="#viaje/${v.id}/itinerario">Ver todo →</a></div>
        ${d.items.length ? d.items.slice(0, 5).map(it => `<a class="hoy2-fila" href="#viaje/${v.id}/itinerario"><span class="it2-hora">${esc(it.hora || '')}</span><span aria-hidden="true">${it.icono}</span><span>${esc(it.titulo)}</span></a>`).join('') : '<p class="dia2-libre">Día libre</p>'}
        ${d.dormis && !d.dormis.id ? `<p class="hoy2-noche">${d.dormis.icono} Esta noche, <strong>${esc(d.dormis.texto.toLowerCase())}</strong></p>` : ''}
        ${d.dormis && d.dormis.id ? `<p class="hoy2-noche">🛏️ Dormís en <strong>${esc(d.dormis.texto)}</strong>${d.dormis.direccion && R.gmaps ? ` · <a href="${esc(R.gmaps.comoLlegar(d.dormis.direccion))}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}</p>` : ''}
      </section>`;
  }
  function enlazarHoy() { /* los enlaces van directo al itinerario */ }

  return { render, diaDe, diasDelViaje, editarItem, editarAlojamiento, elegirNoche, mover, hoyHTML, enlazarHoy, gastoDe };
})();
