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
    const alojs = (v.alojamientos || []).filter(a => a.nombre || a.direccion);
    const transportes = A().items(v).filter(it => A().esTraslado(it) && it.fecha && (it.empresa || it.codigo));
    const propios = v.contactos || [];
    const vacio = !alojs.length && !transportes.length && !propios.length;
    return `
      <section class="bloque ayuda-bloque">
        <h3 class="bloque-titulo">📇 Contactos del viaje</h3>
        ${vacio ? '<p class="texto-suave">Acá aparecen los alojamientos y las empresas de transporte que cargues, con su dirección y código de reserva. También podés sumar los teléfonos que quieras tener a mano.</p>' : ''}
        ${alojs.map(a => `
          <div class="contacto-fila">
            <span class="cf-icono">🛏️</span>
            <span class="cf-texto"><strong>${esc(A().nombreAlojamiento(a))}</strong>
              <small>${esc([a.direccion, a.desde ? 'del ' + U.fmtFecha(a.desde, 'corto') + ' al ' + U.fmtFecha(a.hasta, 'corto') : '', a.codigo ? 'reserva ' + a.codigo : ''].filter(Boolean).join(' · '))}</small></span>
            ${a.direccion ? `<a class="btn btn-suave btn-chico" href="${mapa(a.direccion)}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}
          </div>`).join('')}
        ${transportes.map(it => `
          <div class="contacto-fila">
            <span class="cf-icono">${A().tipo(it.tipo).icono}</span>
            <span class="cf-texto"><strong>${esc([it.empresa, it.numero].filter(Boolean).join(' ') || A().tipo(it.tipo).nombre)}</strong>
              <small>${esc([`${it.desde || ''} → ${it.hasta || ''}`, U.fmtFecha(it.fecha, 'corto'), it.codigo ? 'reserva ' + it.codigo : ''].filter(Boolean).join(' · '))}</small></span>
          </div>`).join('')}
        ${propios.map(c => `
          <div class="contacto-fila">
            <span class="cf-icono">📞</span>
            <span class="cf-texto"><strong>${esc(c.nombre)}</strong>${c.nota ? `<small>${esc(c.nota)}</small>` : ''}</span>
            ${c.telefono ? `<a class="btn btn-primario btn-chico" href="${tel(c.telefono)}">Llamar</a>` : ''}
            ${puede ? `<button type="button" class="btn-icono" data-borrar-contacto="${c.id}" aria-label="Borrar">×</button>` : ''}
          </div>`).join('')}
        ${puede ? '<button type="button" class="btn btn-suave btn-chico" data-a="nuevoContacto">+ Agregar un contacto</button>' : ''}
      </section>`;
  }

  function render(v, cont) {
    cont.innerHTML = `
      <div class="ayuda-vista">
        <p class="texto-suave ayuda-intro">Lo que necesitás si algo pasa. Se guarda en el celular y se ve también sin señal.</p>
        ${R.emergencias ? R.emergencias.html(v) : ''}
        ${contactosHTML(v)}
        ${R.requisitos ? R.requisitos.html(v) : ''}
        ${R.infoPais ? R.infoPais.html(v) : ''}
        ${R.queHacerSi ? R.queHacerSi.html(v) : ''}
      </div>`;
    const repintar = () => render(v, cont);
    if (R.emergencias) R.emergencias.enlazar(cont, v, repintar);
    if (R.requisitos) R.requisitos.enlazar(cont, repintar);
    if (R.queHacerSi) R.queHacerSi.enlazar(cont);
    const det = cont.querySelector('[data-emergencias]');
    if (det) det.open = true;
    const bn = cont.querySelector('[data-a="nuevoContacto"]');
    if (bn) bn.onclick = () => nuevoContacto(v, repintar);
    cont.querySelectorAll('[data-borrar-contacto]').forEach(b => b.onclick = async () => {
      if (!await U.confirmar('Se borra este contacto.', { titulo: 'Borrar contacto', textoSi: 'Borrar', peligro: true })) return;
      v.contactos = (v.contactos || []).filter(c => c.id !== b.dataset.borrarContacto);
      R.db.guardarViaje(v); repintar();
    });
    if (location.hash.includes('#requisitos')) { const r = cont.querySelector('#requisitos'); if (r) r.scrollIntoView({ block: 'start' }); }
  }

  function nuevoContacto(v, alTerminar) {
    U.modal({
      titulo: 'Nuevo contacto',
      cuerpo: `
        <label class="campo"><span>Nombre</span><input id="ctNombre" placeholder="Nombre o empresa" autocomplete="off"></label>
        <label class="campo"><span>Teléfono</span><input id="ctTel" type="tel" inputmode="tel" placeholder="Con código de área"></label>
        <label class="campo"><span>Nota <small>(opcional)</small></span><input id="ctNota" placeholder="Para qué es o cuándo llamar"></label>`,
      alAbrir: el => setTimeout(() => el.querySelector('#ctNombre').focus(), 60),
      acciones: [{ texto: 'Cancelar' }, { texto: 'Guardar', clase: 'btn-primario', onClick: el => {
        const nombre = el.querySelector('#ctNombre').value.trim();
        if (!nombre) { U.toast('Escribí el nombre.'); return false; }
        v.contactos = (v.contactos || []).concat({ id: U.id('ct'), nombre, telefono: el.querySelector('#ctTel').value.trim(), nota: el.querySelector('#ctNota').value.trim() });
        R.db.guardarViaje(v);
        alTerminar();
      } }]
    });
  }

  return { render };
})();
