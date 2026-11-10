/* =========================================================
   Rutenda — Reservas
   Un solo lugar con todo lo que se reserva: cómo llegás y
   volvés, dónde dormís, el auto, el seguro, las entradas.
   Cada cosa muestra si ya tiene los datos y se carga o se
   cambia con un toque. Siempre a mano, antes y durante el viaje.
   ========================================================= */
window.R = window.R || {};

R.reservas = (function () {
  const U = R.util;
  const { esc } = U;

  const GRUPOS = [
    { id: 'llegar', titulo: 'Cómo llegás y volvés', icono: '🚌', bases: ['t_segmento', 'pq_paquete'] },
    { id: 'dormir', titulo: 'Dónde dormís', icono: '🛏️', bases: ['a_reserva'] },
    { id: 'moverse', titulo: 'Auto y traslados', icono: '🚗', bases: ['mv_auto', 'mv_traslado'] },
    { id: 'seguro', titulo: 'Seguro', icono: '🛡️', bases: ['p_seguro'] }
  ];

  /** Lo que se reserva en este viaje, agrupado. */
  function grupos(v) {
    const lista = R.motor.lista(v).filter(t => R.formularios.tiene(t));
    return GRUPOS.map(g => Object.assign({}, g, { items: lista.filter(t => g.bases.includes(t.base || t.id)) })).filter(g => g.items.length);
  }

  /** ¿Cuántas cosas reservables todavía no tienen datos? */
  function sinDatos(v) {
    return grupos(v).reduce((n, g) => n + g.items.filter(t => !((v.tareas[t.id] || {}).datos) && R.motor.estado(v, t.id) !== 'noaplica').length, 0);
  }

  /** "Alojamiento en Sierra de la Ventana" en vez de "Reservar el alojamiento". */
  function nombre(t) {
    const c = t.ctx || {};
    if ((t.base || t.id) === 'a_reserva') return c.destino && c.destino.nombre ? `Alojamiento en ${c.destino.nombre}` : 'Alojamiento';
    const x = String(t.titulo || '').replace(/^(Reservar|Comprar|Contratar|Sacar) (el |la |los |las )?/i, '');
    return x.charAt(0).toUpperCase() + x.slice(1);
  }

  function filaHTML(v, t, puede) {
    const reg = v.tareas[t.id] || {};
    const lineas = R.formularios.resumen(v, t);
    const noAplica = R.motor.estado(v, t.id) === 'noaplica';
    const tiene = !!reg.datos;
    const docs = (v.documentos || []).filter(d => d.tareaId === t.id).length;
    const estado = noAplica ? '<span class="rv-estado rv-na">No aplica</span>'
      : tiene ? '<span class="rv-estado rv-ok">✓ Con datos</span>'
      : R.motor.resuelta(v, t.id) ? '<span class="rv-estado rv-falta">Reservado · sin datos</span>'
      : '<span class="rv-estado rv-pend">Por reservar</span>';
    return `
      <button type="button" class="rv-fila ${tiene ? 'rv-con' : ''}" data-reserva="${t.id}" ${puede ? '' : 'disabled'}>
        <span class="rv-texto">
          <strong>${esc(nombre(t))}</strong>
          ${tiene && lineas.length ? `<small>${lineas.slice(0, 2).map(esc).join(' · ')}</small>` : ''}
          <span class="rv-meta">${estado}${docs ? `<span class="rv-docs">📎 ${docs}</span>` : ''}</span>
        </span>
        ${puede ? `<span class="rv-accion">${tiene ? 'Ver o cambiar' : 'Cargar datos'}</span>` : ''}
      </button>`;
  }

  function render(v, cont) {
    const puede = R.db.puedeOrganizar(v);
    const gs = grupos(v);
    const entradas = R.ideas ? R.ideas.reservadas(v) : [];
    const porReservar = R.ideas ? R.ideas.porReservar(v) : [];
    const faltan = sinDatos(v);
    cont.innerHTML = `
      <div class="vista-reservas">
        <div class="cab-seccion">
          <div>
            <h2 class="titulo-seccion">🎫 Reservas</h2>
            <p class="texto-suave">${faltan ? `Te ${faltan === 1 ? 'falta cargar 1 cosa' : `faltan cargar ${faltan} cosas`}. Tocá cualquiera para completarla.` : 'Todo lo que reservaste, en un solo lugar. Tocá cualquiera para verlo o cambiarlo.'}</p>
          </div>
        </div>
        ${puede && R.escaneo ? `<div class="rv-herramientas">
          <button type="button" class="btn btn-suave btn-chico" data-a="pegar">📋 Pegar el mail</button>
          <button type="button" class="btn btn-suave btn-chico" data-a="archivo">📄 Subir el voucher</button>
        </div>` : ''}
        ${gs.map(g => `
          <section class="bloque rv-grupo">
            <h3 class="bloque-titulo">${g.icono} ${g.titulo}</h3>
            ${g.items.map(t => filaHTML(v, t, puede)).join('')}
          </section>`).join('')}
        ${R.ideas ? `
          <section class="bloque rv-grupo">
            <h3 class="bloque-titulo">🎟️ Excursiones y entradas</h3>
            <button type="button" class="rv-fila" data-a="quehacer">
              <span class="rv-texto">
                <strong>${entradas.length ? U.plural(entradas.length, 'reservada', 'reservadas') : 'Ninguna reservada todavía'}</strong>
                <span class="rv-meta">${porReservar.length ? `<span class="rv-estado rv-pend">${U.plural(porReservar.length, 'por reservar', 'por reservar')}</span>` : ''}</span>
              </span>
              <span class="rv-accion">Ir a Qué hacer</span>
            </button>
          </section>` : ''}
        ${!gs.length ? '<p class="texto-suave">Este viaje no tiene nada para reservar.</p>' : ''}
      </div>`;
    cont.querySelectorAll('[data-reserva]').forEach(b => b.onclick = () => R.formularios.abrir(v, b.dataset.reserva));
    const q = cont.querySelector('[data-a="quehacer"]');
    if (q) q.onclick = () => { location.hash = `#viaje/${v.id}/quehacer`; };
    const bp = cont.querySelector('[data-a="pegar"]');
    if (bp) bp.onclick = () => R.escaneo.pegarReserva(v);
    const ba = cont.querySelector('[data-a="archivo"]');
    if (ba) ba.onclick = () => R.escaneo.escanearYAbrir(v);
  }

  return { render, grupos, sinDatos };
})();
