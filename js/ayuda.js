/* =========================================================
   Rutenda — Ayuda del viaje
   Todo lo que necesitás si algo pasa, en un solo lugar:
   emergencias, contactos del viaje, requisitos de entrada
   y "Qué hacer si…". Funciona sin señal.
   ========================================================= */
window.R = window.R || {};

R.ayuda = (function () {
  const U = R.util;
  const { esc } = U;
  const A = () => R.agenda;
  const tel = n => 'tel:' + String(n || '').replace(/[^+\d]/g, '');
  const mapa = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

  /** Los contactos que salen de lo que cargaste (alojamientos y transporte) más los que agregás vos. */
  function contactosHTML(v) {
    const puede = R.db.puedeOrganizar(v);
    const alojs = (v.alojamientos || []).filter(a => a.nombre || a.direccion || a.telefono);
    const transportes = A().items(v).filter(it => A().esTraslado(it) && it.fecha && (it.empresa || it.codigo || it.telefono));
    const propios = v.contactos || [];
    const vacio = !alojs.length && !transportes.length && !propios.length;
    const llamar = t => t ? `<a class="btn btn-primario btn-chico" href="${tel(t)}">Llamar</a>` : '';
    const sumarTel = (tipo, id, t) => puede && !t ? `<button type="button" class="btn btn-texto btn-chico" data-tel="${tipo}:${id}">+ Teléfono</button>` : '';
    return `
      <details class="bloque plegable ayuda-bloque">
        <summary><div><h3 class="bloque-titulo">📇 Contactos del viaje</h3><small>${propios.length ? U.plural(propios.length, 'contacto tuyo', 'contactos tuyos') + ', alojamientos y transporte' : 'Alojamientos, transporte y teléfonos'}</small></div></summary>
        <div class="plegable-cuerpo">
        ${puede ? '<button type="button" class="btn btn-suave btn-bloque ct-agregar" data-a="nuevoContacto">+ Agregar un contacto</button>' : ''}
        ${vacio ? '<p class="texto-suave">Acá aparecen los alojamientos y las empresas de transporte que cargues, con su dirección y código de reserva. Sumá también los teléfonos que quieras tener a mano: el remís, el transfer, la agencia, un guía.</p>' : ''}
        ${propios.map(c => `
          <div class="contacto-fila">
            <span class="cf-icono">${esc(c.icono || '📞')}</span>
            <button type="button" class="cf-texto cf-editar" ${puede ? `data-editar-contacto="${c.id}"` : 'disabled'}><strong>${esc(c.nombre)}</strong><small>${esc([c.telefono, c.nota].filter(Boolean).join(' · '))}</small></button>
            ${llamar(c.telefono)}
          </div>`).join('')}
        ${alojs.map(a => `
          <div class="contacto-fila">
            <span class="cf-icono">🛏️</span>
            <span class="cf-texto"><strong>${esc(A().nombreAlojamiento(a))}</strong>
              <small>${esc([a.direccion, a.desde ? 'del ' + U.fmtFecha(a.desde, 'corto') + ' al ' + U.fmtFecha(a.hasta, 'corto') : '', a.codigo ? 'reserva ' + a.codigo : ''].filter(Boolean).join(' · '))}</small></span>
            ${llamar(a.telefono)}${sumarTel('aloj', a.id, a.telefono)}
            ${a.direccion ? `<a class="btn btn-suave btn-chico" href="${mapa(a.direccion)}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}
          </div>`).join('')}
        ${transportes.map(it => `
          <div class="contacto-fila">
            <span class="cf-icono">${A().tipo(it.tipo).icono}</span>
            <span class="cf-texto"><strong>${esc([it.empresa, it.numero].filter(Boolean).join(' ') || A().tipo(it.tipo).nombre)}</strong>
              <small>${esc([`${it.desde || ''} → ${it.hasta || ''}`, U.fmtFecha(it.fecha, 'corto'), it.codigo ? 'reserva ' + it.codigo : ''].filter(Boolean).join(' · '))}</small></span>
            ${llamar(it.telefono)}${sumarTel('item', it.id, it.telefono)}
          </div>`).join('')}
        </div>
      </details>`;
  }

  function render(v, cont) {
    // Las tarjetas arrancan cerradas; si abriste alguna y se repinta (por ej. al cambiar un dato), sigue abierta
    const abiertas = [...cont.querySelectorAll('.ayuda-vista > details')].map(d => d.open);
    const reqHTML = R.requisitos ? R.requisitos.html(v) : '';
    const ph = R.emergencias && R.emergencias.paisHoy ? R.emergencias.paisHoy(v) : '';
    const hoyEn = ph ? ((R.emergencias.paises(v).find(p => p.codigo === ph) || {}).nombre || '') : '';
    cont.innerHTML = `
      <div class="ayuda-vista">
        <p class="texto-suave ayuda-intro">${hoyEn ? `Hoy estás en <strong>${esc(hoyEn)}</strong>: lo de ese país va primero. ` : ''}Lo que necesitás si algo pasa. Se guarda en el celular y se ve también sin señal.</p>
        ${R.emergencias ? R.emergencias.html(v) : ''}
        ${contactosHTML(v)}
        ${reqHTML.trim() ? `<details class="bloque plegable ayuda-requisitos" data-requisitos>
          <summary><div><h3 class="bloque-titulo">🛂 Requisitos de entrada</h3><small>Documentos, pasaporte y salud</small></div></summary>
          <div class="plegable-cuerpo">${reqHTML}</div>
        </details>` : ''}
        ${R.infoPais ? R.infoPais.html(v) : ''}
        ${R.queHacerSi ? R.queHacerSi.html(v) : ''}
      </div>`;
    const repintar = () => render(v, cont);
    if (R.emergencias) R.emergencias.enlazar(cont, v, repintar);
    if (R.requisitos) R.requisitos.enlazar(cont, repintar);
    if (R.queHacerSi) R.queHacerSi.enlazar(cont);
    cont.querySelectorAll('.ayuda-vista > details').forEach((d, i) => { if (abiertas[i]) d.open = true; });
    const bn = cont.querySelector('[data-a="nuevoContacto"]');
    if (bn) bn.onclick = () => nuevoContacto(v, repintar);
    cont.querySelectorAll('[data-editar-contacto]').forEach(b => b.onclick = () => nuevoContacto(v, repintar, (v.contactos || []).find(c => c.id === b.dataset.editarContacto)));
    cont.querySelectorAll('[data-tel]').forEach(b => b.onclick = () => {
      const [tipo, id] = b.dataset.tel.split(':');
      const x = tipo === 'aloj' ? A().alojamiento(v, id) : A().items(v).find(i => i.id === id);
      if (!x) return;
      U.modal({
        titulo: 'Teléfono',
        subtitulo: tipo === 'aloj' ? A().nombreAlojamiento(x) : [x.empresa, x.numero].filter(Boolean).join(' '),
        cuerpo: '<label class="campo"><span>Teléfono</span><input id="ctTelX" type="tel" inputmode="tel" placeholder="Con código de país y de área"></label>',
        alAbrir: el => setTimeout(() => el.querySelector('#ctTelX').focus(), 60),
        acciones: [{ texto: 'Cancelar' }, { texto: 'Guardar', clase: 'btn-primario', onClick: el => {
          const t = el.querySelector('#ctTelX').value.trim();
          if (!t) { U.toast('Escribí el teléfono.'); return false; }
          x.telefono = t;
          if (tipo === 'aloj') A().guardarAlojamiento(v, x); else A().guardarItem(v, x);
          R.db.guardarViaje(v); repintar();
        } }]
      });
    });
    if (location.hash.includes('#requisitos')) { const r = cont.querySelector('[data-requisitos]'); if (r) { r.open = true; r.scrollIntoView({ block: 'start' }); } }
  }

  // Sugerencias para cargar rápido
  const TIPOS_CONTACTO = [['🚕', 'Remís o taxi'], ['🚐', 'Transfer'], ['🏢', 'Agencia de viajes'], ['🧭', 'Guía o excursión'], ['🛏️', 'Alojamiento'], ['🏥', 'Seguro médico'], ['👪', 'Familia'], ['📞', 'Otro']];

  /** Agregar (o editar, si viene "c") un contacto del viaje. */
  function nuevoContacto(v, alTerminar, c) {
    let icono = (c && c.icono) || '📞';
    const puedeAgenda = 'contacts' in navigator && 'select' in (navigator.contacts || {});
    const { el } = U.modal({
      titulo: c ? 'Editar contacto' : 'Nuevo contacto',
      cuerpo: `
        ${c ? '' : `<div class="chips-elegir chips-chicos ct-tipos">${TIPOS_CONTACTO.map(([ic, n]) => `<button type="button" class="chip-op" data-tipo="${ic}">${ic} ${n}</button>`).join('')}</div>`}
        ${!c && puedeAgenda ? '<button type="button" class="btn btn-suave btn-bloque ct-agenda" data-a="deAgenda">📱 Elegir de los contactos del celular</button>' : ''}
        <label class="campo"><span>Nombre</span><input id="ctNombre" placeholder="Nombre o empresa" autocomplete="off" value="${esc(c ? c.nombre : '')}"></label>
        <label class="campo"><span>Teléfono</span><input id="ctTel" type="tel" inputmode="tel" placeholder="Con código de país y de área" value="${esc(c ? c.telefono || '' : '')}"></label>
        <label class="campo"><span>Nota <small>(opcional)</small></span><input id="ctNota" placeholder="Para qué es o cuándo llamar" value="${esc(c ? c.nota || '' : '')}"></label>`,
      alAbrir: el => { if (c) setTimeout(() => el.querySelector('#ctNombre').focus(), 60); },
      acciones: (c ? [{ texto: 'Borrar', clase: 'btn-texto peligro', onClick: () => {
        U.confirmar('Se borra este contacto.', { titulo: 'Borrar contacto', textoSi: 'Borrar', peligro: true }).then(ok => {
          if (!ok) return;
          v.contactos = (v.contactos || []).filter(x => x.id !== c.id);
          R.db.guardarViaje(v); alTerminar();
        });
      } }] : [{ texto: 'Cancelar' }]).concat([{ texto: 'Guardar', clase: 'btn-primario', onClick: el => {
        const nombre = el.querySelector('#ctNombre').value.trim();
        if (!nombre) { U.toast('Escribí el nombre.'); return false; }
        const datos = { nombre, telefono: el.querySelector('#ctTel').value.trim(), nota: el.querySelector('#ctNota').value.trim(), icono };
        if (c) Object.assign(c, datos);
        else v.contactos = (v.contactos || []).concat(Object.assign({ id: U.id('ct') }, datos));
        R.db.guardarViaje(v);
        alTerminar();
      } }])
    });
    el.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => {
      icono = b.dataset.tipo;
      el.querySelectorAll('[data-tipo]').forEach(x => x.classList.toggle('activo', x === b));
      const n = el.querySelector('#ctNombre'), nombre = b.textContent.replace(icono, '').trim();
      if (!n.value.trim() || TIPOS_CONTACTO.some(([, t]) => t === n.value.trim())) n.value = nombre === 'Otro' ? '' : nombre;
      n.focus();
    });
    const ag = el.querySelector('[data-a="deAgenda"]');
    if (ag) ag.onclick = async () => {
      try {
        const [x] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (!x) return;
        if (x.name && x.name[0]) el.querySelector('#ctNombre').value = x.name[0];
        if (x.tel && x.tel[0]) el.querySelector('#ctTel').value = x.tel[0];
      } catch (e) { /* lo cancelaste */ }
    };
  }

  return { render };
})();
