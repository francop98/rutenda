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

  function detalleItem(it, v) {
    const t = A().tipo(it.tipo);
    const partes = [];
    if (t.traslado) {
      if (it.aeroDesde || it.aeroHasta) partes.push(`${it.aeroDesde || '?'} → ${it.aeroHasta || '?'}`);
      // Si cruza husos: la hora de llegada es la local, y se muestra también la del lugar de salida
      const hu = R.husos && v && A().esProgramado(it) ? R.husos.delTraslado(v, it) : null;
      if (it.horaLlegada) partes.push(`llega ${it.fechaLlegada && it.fechaLlegada !== it.fecha ? U.fmtFecha(it.fechaLlegada, 'dia') + ' ' : ''}${it.horaLlegada}${hu && hu.cambia && hu.horaOrigen ? ` hora de ${hu.hasta} (en ${hu.desde} son las ${hu.horaOrigen})` : ''}`);
      if (hu && hu.cambia && hu.duracion) partes.push(`${R.husos.fmtDuracion(hu.duracion)} de viaje`);
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
    const txt = (k, prep) => { const c = A().conexion(k); return c && A().conexionResuelta(k) && k !== 'no' ? `${c[1]} ${c[2]} ${prep} ${term}` : ''; };
    const hechas = [txt(it.alSalir, al), txt(it.alLlegar, del)].filter(Boolean);
    const faltan = [!A().conexionResuelta(it.alSalir) ? `cómo llegás ${al} ${term}` : '', !A().conexionResuelta(it.alLlegar) ? `cómo salís ${del} ${term}` : ''].filter(Boolean);
    return hechas.length || faltan.length ? { ok: hechas.join(' · '), falta: faltan.length ? 'Falta: ' + faltan.join(' y ') : '' } : null;
  }

  /** Duraciones para elegir (en minutos). */
  const DURACIONES = [[30, '30 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h'], [180, '3 h'], [240, '4 h'], [300, 'Medio día (5 h)'], [480, 'Todo el día (8 h)']];
  const aMin = h => { const m = /^(\d{1,2}):(\d{2})/.exec(h || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const aHora = n => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  /**
   * Horarios que se pisan: cada cosa con hora termina a su hora + duración
   * (o a la hora de llegada si es un traslado del mismo día). Si la siguiente
   * empieza antes, se marcan las dos.
   */
  function marcarChoques(items) {
    const con = items.filter(i => !i.alojamiento && aMin(i.hora) != null);
    for (let a = 0; a < con.length; a++) {
      const fin = con[a].finMin;
      if (fin == null) continue;
      for (let b = a + 1; b < con.length; b++) {
        const ini = aMin(con[b].hora);
        if (ini >= fin) break;
        con[a].choque = con[a].choque || `Se pisa con ${con[b].titulo}`;
        con[b].choque = con[b].choque || `Se pisa con ${con[a].titulo}`;
      }
    }
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
        id: it.id, hora: it.hora || '', icono: t.icono, titulo: it.titulo || t.nombre, sub: detalleItem(it, v), nota: it.nota || '',
        lugar: t.traslado ? '' : (it.lugar || ''), clase: t.traslado ? 'ev-traslado' : '', tipo: it.tipo,
        docs: A().docsDe(v, it.id).length, checkin: it.fecha >= U.hoyISO() ? A().checkin(it) : null, conexiones: conexionesTexto(it),
        favorito: !!it.favorito,
        finMin: aMin(it.hora) == null ? null : it.duracion ? aMin(it.hora) + Number(it.duracion) : (t.traslado && it.horaLlegada && !it.fechaLlegada && aMin(it.horaLlegada) > aMin(it.hora) ? aMin(it.horaLlegada) : null),
        horaFin: aMin(it.hora) != null && it.duracion ? aHora(aMin(it.hora) + Number(it.duracion)) : ''
      });
    });
    (v.alojamientos || []).filter(a => a.desde === fecha).forEach(a => items.push({
      id: a.id, alojamiento: true, hora: a.checkin || '', orden: a.checkin || '98', icono: '🛏️', titulo: `Check-in · ${A().nombreAlojamiento(a)}`,
      sub: [a.direccion, a.codigo ? 'Cód. ' + a.codigo : ''].filter(Boolean).join(' · '), lugar: a.direccion || '', clase: 'ev-aloj', docs: A().docsDe(v, a.id).length
    }));
    // Sin hora: el check-out va primero, el check-in al final del día
    items.sort((a, b) => (a.orden || a.hora || '99').localeCompare(b.orden || b.hora || '99'));
    marcarChoques(items);
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
        <span class="it2-hora">${esc(it.hora || '')}${it.horaFin ? `<small>${esc(it.horaFin)}</small>` : ''}</span>
        <span class="it2-ico" aria-hidden="true">${it.icono}</span>
        <span class="it2-texto">
          <strong>${esc(it.titulo)}${it.favorito ? ' <span class="it2-fav" title="Favorito">⭐</span>' : ''}</strong>
          ${it.choque ? `<small class="it2-choque">⚠️ ${esc(it.choque)}</small>` : ''}
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
          ${puede ? `<button type="button" class="dia2-menu" data-dia-menu="${fecha}" aria-label="Opciones del día" title="Plantillas del día">⋯</button>` : ''}
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
        ${quieroHTML(v, puede, dias)}
        ${dias.length ? dias.map(f => diaHTML(v, f, hoy, puede)).join('') : `
          ${U.vacio({ icono: '🗓️', titulo: 'Poné las fechas del viaje', texto: 'Con la ida y la vuelta se arman los días. Después cargás qué hacés cada día.', boton: puede ? 'Poner las fechas' : '', accion: 'fechas' })}`}
        ${puede && dias.length ? '<p class="ayuda itin2-ayuda">Tocá algo para verlo o cambiarlo. Mantenelo apretado para pasarlo a otro día.</p>' : ''}
      </div>`;
    enlazar(v, cont);
    // Viajando: arranca en el día de hoy
    const hoyEl = cont.querySelector('.dia2.hoy');
    if (hoyEl && !render._yaFue) { render._yaFue = v.id; setTimeout(() => hoyEl.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120); }
  }

  /* ---------------------------------------------------------
     "Quiero hacer": el anotador de ideas, arriba del itinerario
     --------------------------------------------------------- */
  let verTodasIdeas = false;
  function quieroHTML(v, puede, dias) {
    const ideas = A().ideas(v);
    if (!puede && !ideas.length) return '';
    const mostrar = verTodasIdeas ? ideas : ideas.slice(0, 3);
    const favs = puede ? favoritosPara(v) : [];
    return `
      <section class="quiero2">
        <div class="quiero2-cab"><strong>💡 Quiero hacer</strong><small>${ideas.length ? U.plural(ideas.length, 'idea sin día', 'ideas sin día') : 'Anotá lo que te gustaría hacer'}</small></div>
        ${puede ? `<form class="quiero2-nuevo" data-form="idea">
          <input id="iIdeaRapida" placeholder="Lugar, actividad o comida para el viaje" aria-label="Nueva idea" autocomplete="off">
          <button type="submit" class="btn btn-terracota" aria-label="Anotar">+</button>
        </form>` : ''}
        ${ideas.length ? `<div class="quiero2-lista">${mostrar.map(i => `
          <div class="quiero2-idea">
            <button type="button" class="quiero2-texto" data-item="${i.id}"><span aria-hidden="true">${A().tipo(i.tipo).icono}</span><span>${esc(i.titulo)}${i.lugar ? `<small>${esc(i.lugar)}</small>` : ''}</span></button>
            ${puede && dias.length ? `<button type="button" class="btn btn-suave btn-chico" data-elegir-dia="${i.id}">Elegir día</button>` : ''}
          </div>`).join('')}</div>
          ${ideas.length > 3 ? `<button type="button" class="btn-texto-mini" data-a="todasIdeas">${verTodasIdeas ? 'Ver menos' : `Ver las ${ideas.length}`}</button>` : ''}
          ${puede && dias.length && ideas.length >= 2 ? '<button type="button" class="btn btn-suave btn-bloque quiero2-repartir" data-a="repartir">✨ Repartir mis ideas en los días</button>' : ''}` : ''}
        ${puede && R.queHacer && (v.destinos || []).some(d => d.nombre && !d.paso) ? `<button type="button" class="btn btn-suave btn-bloque quiero2-quehacer" data-a="queHacer">🧭 Qué hacer en ${esc(nombresQueHacer(v))}</button>` : ''}
        ${favs.length ? `<div class="quiero2-favs"><small>⭐ Tus favoritos de viajes anteriores:</small>
          <div class="chips-elegir chips-chicos">${favs.slice(0, 8).map((f, n) => `<button type="button" class="chip-op" data-fav="${n}">+ ${esc(f.titulo)}</button>`).join('')}</div></div>` : ''}
      </section>`;
  }
  function nombresQueHacer(v) {
    const ds = (v.destinos || []).filter(d => d.nombre && !d.paso).map(d => d.nombre);
    return ds.length > 2 ? ds.slice(0, 2).join(', ') + '…' : ds.join(' y ');
  }
  /** Lo que marcaste con ⭐ en otros viajes al mismo destino y todavía no está en este. */
  function favoritosPara(v) {
    const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const destinos = new Set((v.destinos || []).map(d => norm(d.nombre)).filter(Boolean));
    const ya = new Set(A().items(v).map(i => norm(i.titulo)));
    const r = [];
    R.db.viajes().filter(x => x.id !== v.id && (x.destinos || []).some(d => destinos.has(norm(d.nombre)))).forEach(x => {
      (x.agenda || []).filter(i => i.favorito && !ya.has(norm(i.titulo))).forEach(i => { ya.add(norm(i.titulo)); r.push(i); });
    });
    return r;
  }
  function enlazarQuiero(v, cont) {
    const favs = favoritosPara(v);
    cont.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => {
      const f = favs[Number(b.dataset.fav)];
      if (!f) return;
      A().guardarItem(v, A().nuevoItem(Object.assign({ titulo: f.titulo, tipo: f.tipo, lugar: f.lugar || '', nota: f.nota || '', favorito: true, fecha: '' }, f.lat != null ? { lat: f.lat, lon: f.lon } : {})));
      R.db.guardarViaje(v);
      render(v, cont);
      U.toast(`"${f.titulo}" quedó en tus ideas.`);
    });
    const f = cont.querySelector('[data-form="idea"]');
    if (f) f.onsubmit = e => {
      e.preventDefault();
      const t = f.querySelector('input').value.trim();
      if (!t) return;
      A().guardarItem(v, A().nuevoItem({ titulo: t, fecha: '' }));
      R.db.guardarViaje(v);
      render(v, cont);
      const i = cont.querySelector('#iIdeaRapida'); if (i) i.focus();
    };
    const bt = cont.querySelector('[data-a="todasIdeas"]');
    if (bt) bt.onclick = () => { verTodasIdeas = !verTodasIdeas; render(v, cont); };
    cont.querySelectorAll('[data-elegir-dia]').forEach(b => b.onclick = () => mover(v, b.dataset.elegirDia, () => R.app.refrescar()));
    const bq = cont.querySelector('[data-a="queHacer"]');
    if (bq) bq.onclick = () => R.queHacer.abrir(v, () => R.app.refrescar());
    const br = cont.querySelector('[data-a="repartir"]');
    if (br) br.onclick = () => repartir(v);
  }

  /* ---------------------------------------------------------
     Repartir las ideas en los días (sin IA): cada idea va a un
     día que pasás en su destino, las que quedan cerca entre sí
     van juntas, y se cargan primero los días más libres.
     No toca los días de viaje (con vuelo, micro…) si hay otros.
     --------------------------------------------------------- */
  async function repartir(v) {
    const ideas = A().ideas(v);
    const dias = A().dias(v);
    if (!ideas.length || !dias.length) return;
    const quedas = (v.destinos || []).filter(d => d.nombre && !d.soloDia && !d.paso);
    const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    // 1) Dónde queda cada idea (lo que ya sabemos, o lo buscamos cerca del destino)
    U.toast('Buscando dónde queda cada idea… 🔎');
    const cerca = (quedas.find(d => d.lat != null) || null);
    let buscadas = 0;
    for (const i of ideas) {
      if (i.lat != null || !R.ordenar || buscadas >= 12) continue;
      const q = [i.lugar || i.titulo, ...(quedas.length === 1 ? [quedas[0].nombre] : [])].join(', ');
      const t0 = Date.now();
      const p = await R.ordenar.ubicar(q, cerca);
      buscadas++;
      // El buscador de mapas pide una consulta por segundo (si ya la tenía guardada, no hace falta esperar)
      if (Date.now() - t0 > 60) await new Promise(r => setTimeout(r, 1050));
      if (p) { i.lat = p.lat; i.lon = p.lon; }
    }
    // 2) A qué destino pertenece: el más cercano, o el que se nombra
    const km = (a, b) => R.ordenar.km({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon });
    const destinoDe = i => {
      const nombrado = quedas.find(d => norm(i.titulo + ' ' + (i.lugar || '')).includes(norm(d.nombre)));
      if (nombrado) return nombrado;
      const conCoord = quedas.filter(d => d.lat != null);
      if (i.lat != null && conCoord.length) return conCoord.slice().sort((a, b) => km(i, a) - km(i, b))[0];
      return quedas.length === 1 ? quedas[0] : null;
    };
    // 3) Días disponibles en cada destino (sin traslados con horario si hay otros)
    const carga = f => A().delDia(v, f).length;
    const deViaje = f => A().delDia(v, f).some(it => A().esProgramado(it));
    const diasDe = d => {
      const todos = dias.filter(f => !d || norm(ciudadDe(v, f)) === norm(d.nombre));
      const libres = todos.filter(f => !deViaje(f));
      return (libres.length ? libres : todos.length ? todos : dias).slice();
    };
    // 4) Por destino: ordenar las ideas por cercanía y cortarlas en tantos días como haya
    const plan = {};
    const grupos = new Map();
    ideas.forEach(i => { const d = destinoDe(i); const k = d ? d.id : ''; if (!grupos.has(k)) grupos.set(k, { d, ideas: [] }); grupos.get(k).ideas.push(i); });
    grupos.forEach(({ d, ideas: lista }) => {
      const ds = diasDe(d).sort((a, b) => carga(a) - carga(b) || a.localeCompare(b));
      const conPos = lista.filter(i => i.lat != null).map(i => ({ i, pos: { lat: i.lat, lon: i.lon } }));
      const sinPos = lista.filter(i => i.lat == null);
      // Por cercanía: las que quedan cerca van el mismo día
      const orden = (conPos.length > 1 && R.ordenar ? R.ordenar.ordenCorto(null, conPos, null) : conPos).map(x => x.i).concat(sinPos);
      const porDia = Math.max(1, Math.ceil(orden.length / ds.length));
      orden.forEach((i, n) => {
        const f = ds[Math.min(Math.floor(n / porDia), ds.length - 1)];
        (plan[f] = plan[f] || []).push(i);
      });
    });
    const fechas = Object.keys(plan).sort();
    const { el } = U.modal({
      titulo: '✨ Así quedarían tus ideas',
      subtitulo: 'Las que quedan cerca entre sí van el mismo día, en los días más libres. Después las movés como quieras.',
      cuerpo: `<div class="reparto">${fechas.map(f => `
        <div class="reparto-dia"><strong>${esc(U.fmtFecha(f, 'dia'))}</strong>${ciudadDe(v, f) ? `<small>${esc(ciudadDe(v, f))}</small>` : ''}
          <ul>${plan[f].map(i => `<li>${A().tipo(i.tipo).icono} ${esc(i.titulo)}</li>`).join('')}</ul></div>`).join('')}</div>`,
      acciones: [{ texto: 'Cancelar' }, { texto: 'Pasarlas al itinerario', clase: 'btn-primario', onClick: () => {
        fechas.forEach(f => plan[f].forEach(i => { i.fecha = f; A().guardarItem(v, i); }));
        R.db.guardarViaje(v);
        R.app.refrescar();
        U.toast('Listo, tus ideas ya están en los días. 🗓️');
      } }]
    });
    void el;
  }

  /* ---------------------------------------------------------
     Plantillas de día: guardás un día armado y lo reusás
     (se guardan en tu cuenta, sirven para cualquier viaje)
     --------------------------------------------------------- */
  function menuDia(v, fecha) {
    const plantillas = R.db.prefs().plantillasDia || [];
    const delDia = A().delDia(v, fecha).filter(it => !A().esTraslado(it));
    const { el } = U.modal({
      titulo: U.fmtFecha(fecha, 'dia').replace(/^./, c => c.toUpperCase()),
      subtitulo: 'Plantillas: un día armado que podés reusar en cualquier viaje.',
      cuerpo: `
        ${delDia.length ? `<form class="fila-agregar" data-form="plantilla">
          <input id="plNombre" placeholder="Nombre de la plantilla" aria-label="Nombre de la plantilla" autocomplete="off">
          <button type="submit" class="btn btn-suave">💾 Guardar este día</button>
        </form>
        <p class="ayuda">Se guardan ${U.plural(delDia.length, 'actividad', 'actividades')} con su hora y duración (sin traslados).</p>` : '<p class="texto-suave">Este día está vacío: podés usar una plantilla.</p>'}
        ${plantillas.length ? `<h4 class="titulo-paso">Usar una plantilla</h4>
          <div class="plantillas">${plantillas.map(p => `
            <div class="plantilla">
              <button type="button" class="plantilla-usar" data-usar-plantilla="${p.id}"><strong>${esc(p.nombre)}</strong><small>${esc(p.items.map(i => (i.hora ? i.hora + ' ' : '') + i.titulo).join(' · '))}</small></button>
              <button type="button" class="btn-icono" data-borrar-plantilla="${p.id}" aria-label="Borrar plantilla">×</button>
            </div>`).join('')}</div>` : ''}`
    });
    const f = el.querySelector('[data-form="plantilla"]');
    if (f) f.onsubmit = e => {
      e.preventDefault();
      const nombre = f.querySelector('#plNombre').value.trim();
      if (!nombre) { U.toast('Poné un nombre a la plantilla.'); return; }
      const items = delDia.map(i => ({ hora: i.hora || '', duracion: i.duracion || '', tipo: i.tipo, titulo: i.titulo, lugar: i.lugar || '', nota: i.nota || '' }));
      R.db.guardarPrefs({ plantillasDia: plantillas.concat({ id: U.id('pl'), nombre, items }) });
      U.cerrarModal();
      U.toast(`Plantilla "${nombre}" guardada.`);
    };
    el.querySelectorAll('[data-usar-plantilla]').forEach(b => b.onclick = () => {
      const p = plantillas.find(x => x.id === b.dataset.usarPlantilla);
      if (!p) return;
      p.items.forEach(i => A().guardarItem(v, A().nuevoItem(Object.assign({}, i, { fecha }))));
      R.db.guardarViaje(v);
      U.cerrarModal();
      R.app.refrescar();
      U.toast(`Sumé ${U.plural(p.items.length, 'actividad', 'actividades')} de "${p.nombre}".`);
    });
    el.querySelectorAll('[data-borrar-plantilla]').forEach(b => b.onclick = async () => {
      if (!await U.confirmar('Se borra la plantilla (lo que ya usaste en tus viajes queda).', { titulo: 'Borrar plantilla', textoSi: 'Borrar', peligro: true })) return;
      R.db.guardarPrefs({ plantillasDia: plantillas.filter(x => x.id !== b.dataset.borrarPlantilla) });
      U.cerrarModal();
      menuDia(v, fecha);
    });
  }

  function enlazar(v, cont) {
    const puede = R.db.puedeOrganizar(v);
    const repintar = () => R.app.refrescar();
    cont.querySelectorAll('[data-agregar]').forEach(b => b.onclick = () => editarItem(v, null, { fecha: b.dataset.agregar }));
    cont.querySelectorAll('[data-noche]').forEach(b => b.onclick = () => elegirNoche(v, b.dataset.noche));
    cont.querySelectorAll('[data-aloj]').forEach(b => b.onclick = () => editarAlojamiento(v, b.dataset.aloj));
    enlazarQuiero(v, cont);
    cont.querySelectorAll('[data-dia-menu]').forEach(b => b.onclick = () => menuDia(v, b.dataset.diaMenu));
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
              <label class="campo"><span>Desde</span><input id="iDesde" value="${esc(it.desde || '')}" placeholder="Ciudad de salida"></label>
              <label class="campo"><span>Hasta</span><input id="iHasta" value="${esc(it.hasta || '')}" placeholder="Ciudad de llegada"></label>
            </div>
          </div>
          <label class="campo no-traslado"><span>¿Qué?</span><input id="iTitulo" value="${esc(it.titulo || '')}" placeholder="Nombre del lugar o actividad"></label>
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
            <label class="campo"><span>N° <small>(vuelo, servicio)</small></span><input id="iNumero" value="${esc(it.numero || '')}" autocapitalize="characters" placeholder="Como figura en el pasaje"></label>
          </div>
          <div class="si-vuelo grilla-2">
            <label class="campo"><span>Aeropuerto de salida</span><input id="iAeroDesde" value="${esc(it.aeroDesde || '')}" maxlength="3" autocapitalize="characters" placeholder="Sigla de 3 letras"></label>
            <label class="campo"><span>Aeropuerto de llegada</span><input id="iAeroHasta" value="${esc(it.aeroHasta || '')}" maxlength="3" autocapitalize="characters" placeholder="Sigla de 3 letras"></label>
          </div>
          <div class="si-programado grilla-2">
            <label class="campo"><span class="lbl-con-salir">Hasta la terminal</span><select id="iAlSalir"><option value="">Sin resolver</option>${A().CONEXIONES.map(([k, ic, n]) => `<option value="${k}" ${(A().conexion(it.alSalir) || [])[0] === k ? 'selected' : ''}>${ic} ${n}</option>`).join('')}</select></label>
            <label class="campo"><span class="lbl-con-llegar">Desde la terminal</span><select id="iAlLlegar"><option value="">Sin resolver</option>${A().CONEXIONES.map(([k, ic, n]) => `<option value="${k}" ${(A().conexion(it.alLlegar) || [])[0] === k ? 'selected' : ''}>${ic} ${n}</option>`).join('')}</select></label>
          </div>
          <label class="campo no-traslado"><span>Dónde</span><input id="iLugar" value="${esc(it.lugar || '')}" placeholder="Escribí el lugar y elegí de la lista"></label>
          <label class="campo no-traslado"><span>¿Cuánto dura? <small>(opcional)</small></span><select id="iDuracion"><option value="">Sin indicar</option>${DURACIONES.map(([m, t]) => `<option value="${m}" ${Number(it.duracion) === m ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <div class="form-opcional">
            <div class="grilla-2 si-traslado">
              <label class="campo"><span>Empresa <small>(opcional)</small></span><input id="iEmpresa" value="${esc(it.empresa || '')}" list="dlEmpresas" autocomplete="off"></label>
              <label class="campo"><span>Llega otro día <small>(opcional)</small></span><input type="date" id="iFechaLlega" value="${esc(it.fechaLlegada && it.fechaLlegada !== it.fecha ? it.fechaLlegada : '')}" ${it.fecha ? `min="${it.fecha}"` : ''}></label>
            </div>
            <div class="grilla-2">
              <label class="campo"><span>Código de reserva <small>(opcional)</small></span><input id="iCodigo" value="${esc(it.codigo || '')}" autocapitalize="characters"></label>
              <label class="campo"><span>Cancelación gratis hasta <small>(opcional)</small></span><input type="date" id="iCancela" value="${esc(it.cancelaHasta || '')}"></label>
            </div>
            <div class="grilla-2">
              <label class="campo"><span>Falta pagar antes del <small>(opcional)</small></span><input type="date" id="iPagar" value="${esc(it.pagarHasta || '')}"></label>
              <label class="campo"><span>¿Cuánto falta? <small>(opcional)</small></span><input id="iPagarMonto" value="${esc(it.pagarMonto || '')}" placeholder="Por ej.: USD 300" autocomplete="off"></label>
            </div>
            <label class="check no-traslado"><input type="checkbox" id="iFavorito" ${it.favorito ? 'checked' : ''}> ⭐ Favorito: sugerímelo cuando vuelva a este destino</label>
            <label class="campo"><span>Notas <small>(opcional)</small></span><textarea id="iNota" rows="2" placeholder="Datos útiles para ese momento">${esc(it.nota || '')}</textarea></label>
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
    U.calendarioDesde(fLlega, () => fSale.value);
    fSale.addEventListener('change', () => { fLlega.min = fSale.value || ''; if (fLlega.value && fLlega.value < fSale.value) fLlega.value = ''; });
    const num = el.querySelector('#iNumero'), emp = el.querySelector('#iEmpresa');
    num.addEventListener('input', () => { const a = A().aerolineaDe(num.value); if (a && (!emp.value.trim() || emp.dataset.auto === '1')) { emp.value = a; emp.dataset.auto = '1'; } });
    emp.addEventListener('input', () => { emp.dataset.auto = ''; });
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
      it.duracion = tr ? '' : val('#iDuracion');
      it.cancelaHasta = val('#iCancela');
      it.pagarHasta = val('#iPagar'); it.pagarMonto = val('#iPagarMonto').trim();
      it.favorito = !tr && !!(f.querySelector('#iFavorito') || {}).checked;
      const inpLugar = f.querySelector('#iLugar');
      if (!tr && inpLugar && inpLugar.dataset.lat) { it.lat = Number(inpLugar.dataset.lat); it.lon = Number(inpLugar.dataset.lon); }
      else if (!it.lugar) { delete it.lat; delete it.lon; }
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
        // La llegada no puede ser antes que la salida; si la hora es menor el mismo día, es al día siguiente
        if (it.fechaLlegada && it.fecha && it.fechaLlegada < it.fecha) { U.toast('La llegada es antes que la salida. Revisá las fechas.'); return false; }
        if (it.fecha && it.hora && it.horaLlegada && it.horaLlegada < it.hora && (!it.fechaLlegada || it.fechaLlegada === it.fecha)) {
          it.fechaLlegada = U.sumarDias(it.fecha, 1);
          U.toast(`Llega al día siguiente (${U.fmtFecha(it.fechaLlegada, 'dia')}).`);
        }
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
          <label class="campo"><span>Nombre${a.ciudad ? ' <small>(opcional)</small>' : ''}</span><input id="aNombre" value="${esc(a.nombre)}" list="dlAloj" autocomplete="off" placeholder="${esc(a.ciudad ? 'Alojamiento en ' + a.ciudad : 'Nombre del hotel, departamento o casa')}"></label>
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
            <div class="grilla-2">
              <label class="campo"><span>Código de reserva <small>(opcional)</small></span><input id="aCodigo" value="${esc(a.codigo)}"></label>
              <label class="campo"><span>Cancelación gratis hasta <small>(opcional)</small></span><input type="date" id="aCancela" value="${esc(a.cancelaHasta || '')}"></label>
            </div>
            <div class="grilla-2">
              <label class="campo"><span>Falta pagar antes del <small>(opcional)</small></span><input type="date" id="aPagar" value="${esc(a.pagarHasta || '')}"></label>
              <label class="campo"><span>¿Cuánto falta? <small>(opcional)</small></span><input id="aPagarMonto" value="${esc(a.pagarMonto || '')}" placeholder="Por ej.: el 70% o USD 300" autocomplete="off"></label>
            </div>
            <label class="campo"><span>Notas <small>(opcional)</small></span><textarea id="aNota" rows="2" placeholder="Datos útiles del alojamiento">${esc(a.nota)}</textarea></label>
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
    U.calendarioDesde(el.querySelector('#aDesde'), () => v.fechaInicio);
    U.calendarioDesde(el.querySelector('#aHasta'), () => el.querySelector('#aDesde').value ? U.sumarDias(el.querySelector('#aDesde').value, 1) : v.fechaInicio);
    el.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => R.documentos.abrir((v.documentos || []).find(d => d.id === b.dataset.doc), v));
    if (puede) U.enlazarArchivos(el, 'aloj', archivos, () => U.repintarArchivos(el, 'aloj', archivos, 'Sumar la reserva o el voucher', true));
    if (R.direcciones) R.direcciones.enlazar(el.querySelector('#aDir'), { cerca: R.direcciones.cercaDe(v, null) });
    if (!puede) el.querySelectorAll('input, select, textarea').forEach(x => { x.disabled = true; });

    function guardar(f) {
      const val = s => (f.querySelector(s) || {}).value || '';
      a.nombre = val('#aNombre').trim(); a.direccion = val('#aDir').trim();
      a.desde = val('#aDesde'); a.hasta = val('#aHasta');
      a.checkin = val('#aIn'); a.checkout = val('#aOut'); a.codigo = val('#aCodigo').trim(); a.nota = val('#aNota').trim(); a.cancelaHasta = val('#aCancela'); a.pagarHasta = val('#aPagar'); a.pagarMonto = val('#aPagarMonto').trim();
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

  return { render, ciudadDe, diaDe, diasDelViaje, editarItem, editarAlojamiento, elegirNoche, mover, hoyHTML, enlazarHoy, gastoDe };
})();
