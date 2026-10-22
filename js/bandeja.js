/* =========================================================
   Rutenda — reservas que llegaron por mail
   Reenviás la reserva a rutendaviajes@gmail.com desde el mail
   de tu cuenta y aparece acá. Con un toque se suma al viaje:
   completa el paso de la guía y guarda el PDF en Documentos.
   usuarios/{uid}/bandeja/{id}: { asunto, de, recibido, datos, adjuntos[], estado }
   ========================================================= */
window.R = window.R || {};

R.bandeja = (function () {
  const U = R.util;
  const { esc } = U;
  const CASILLA = 'rutendaviajes@gmail.com';
  let items = [];
  let cargado = false;

  const ICONOS = { vuelo: '✈️', micro: '🚌', tren: '🚆', barco: '⛴️', alojamiento: '🏨', auto: '🚗', excursion: '🎟️', seguro: '🛡️', paquete: '📦', otro: '📄' };

  function col() {
    const uid = R.nube && R.nube.miUid && R.nube.miUid();
    return uid ? R.nube.db().collection('usuarios').doc(uid).collection('bandeja') : null;
  }

  /** Trae lo nuevo de la bandeja (en silencio). */
  async function cargar() {
    if (R.db.modo() !== 'nube' || !col()) return [];
    try {
      const s = await col().where('estado', '==', 'nuevo').get();
      items = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => String(b.recibido).localeCompare(String(a.recibido)));
      cargado = true;
    } catch (e) { /* sin conexión: se intenta la próxima vez */ }
    return items;
  }
  function pendientes() { return items.length; }

  /** Una línea con lo que se leyó del mail. */
  function resumen(it) {
    const d = it.datos || {};
    const t = (d.tramos || [])[0];
    const a = d.alojamiento;
    const partes = [];
    if (d.empresa) partes.push(d.empresa);
    if (t && (t.desde || t.hasta)) partes.push(`${t.desde || '¿?'} → ${(d.tramos.slice(-1)[0] || t).hasta || '¿?'}`);
    if (t && t.fechaSalida) partes.push(U.fmtFecha(t.fechaSalida, 'dia'));
    if (a && a.nombre) partes.push(a.nombre);
    if (a && a.checkinFecha) partes.push(`${U.fmtFecha(a.checkinFecha, 'dia')}${a.checkoutFecha ? ' al ' + U.fmtFecha(a.checkoutFecha, 'dia') : ''}`);
    if (d.seguro && d.seguro.compania) partes.push(d.seguro.compania);
    if (d.codigo) partes.push('Cód. ' + d.codigo);
    return partes.join(' · ');
  }
  function fechaClave(it) {
    const d = it.datos || {};
    return ((d.tramos || [])[0] || {}).fechaSalida || (d.alojamiento || {}).checkinFecha || ((d.actividades || [])[0] || {}).fecha || (d.seguro || {}).desde || (d.auto || {}).retiroFecha || '';
  }
  /** El viaje más probable: el que contiene la fecha de la reserva; si no, el que estás haciendo o el próximo. */
  function viajeSugerido(it, lista) {
    const f = fechaClave(it);
    if (f) {
      const v = lista.find(x => x.fechaInicio && x.fechaInicio <= f && (!x.fechaFin || f <= x.fechaFin));
      if (v) return v.id;
    }
    const enCurso = lista.find(x => R.viajes.estadoViaje(x) === 'en_curso');
    return (enCurso || lista[0] || {}).id || '';
  }

  /** Tarjeta para el inicio. */
  function inicioHTML() {
    if (!items.length) return '';
    return `
      <button type="button" class="aviso-bandeja" data-a="bandeja">
        <span class="ab-icono">📥</span>
        <span class="ab-texto"><strong>${items.length === 1 ? 'Te llegó una reserva por mail' : `Te llegaron ${items.length} reservas por mail`}</strong>
          <small>${esc(items[0].asunto)}</small></span>
        <b>Sumar →</b>
      </button>`;
  }
  function enlazarInicio(cont) {
    const b = cont.querySelector('[data-a="bandeja"]');
    if (b) b.onclick = abrir;
  }

  function ayudaHTML() {
    const u = R.auth.usuarioActual();
    return `
      <div class="bandeja-ayuda">
        <p><strong>📧 Reenviá tus reservas a <a href="mailto:${CASILLA}">${CASILLA}</a></strong></p>
        <p class="texto-suave">Desde <strong>${esc(u ? u.email : 'el mail de tu cuenta')}</strong> (el de tu cuenta). En unos minutos aparecen acá: las leo y las sumás al viaje con un toque. Sirven pasajes, hoteles, alquiler de auto, excursiones y seguros.</p>
        <button type="button" class="btn btn-suave btn-chico" data-a="copiarCasilla">📋 Copiar la dirección</button>
      </div>`;
  }

  async function abrir() {
    if (R.db.modo() !== 'nube') { U.toast('Las reservas por mail necesitan tu cuenta en la nube.'); return; }
    const { el } = U.modal({ titulo: '📥 Reservas por mail', ancho: true, cuerpo: '<div class="bandeja"><p class="texto-suave">Buscando…</p></div>', alCerrar: () => R.app.refrescar() });
    const caja = el.querySelector('.bandeja');
    await cargar();
    pintar(caja);
  }

  function pintar(caja) {
    const lista = R.cargar ? R.cargar.viajesActivos() : R.db.viajes();
    caja.innerHTML = `
      ${items.length ? `<div class="bandeja-lista">${items.map(it => {
        const d = it.datos || {};
        const sug = viajeSugerido(it, lista);
        return `
        <article class="bandeja-item" data-item="${it.id}">
          <div class="bi-cab"><span class="bi-icono">${ICONOS[d.tipo] || '📄'}</span>
            <div class="bi-texto"><strong>${esc(it.asunto)}</strong>
              <small>${esc(resumen(it) || (it.adjuntos && it.adjuntos.length ? 'Lo leo cuando lo sumes' : 'Sin datos de reserva'))}</small>
              ${(it.adjuntos || []).length ? `<small class="bi-adj">📎 ${it.adjuntos.map(a => esc(a.nombre)).join(', ')}</small>` : ''}</div></div>
          ${lista.length ? `<label class="campo bi-viaje"><span>¿A qué viaje?</span><select data-bi-viaje="${it.id}">${lista.map(v => `<option value="${v.id}" ${v.id === sug ? 'selected' : ''}>${esc(v.nombre || v.destino || 'Viaje')}${v.fechaInicio ? ' · ' + U.fmtFecha(v.fechaInicio, 'dia') : ''}</option>`).join('')}</select></label>` : '<p class="texto-suave">Primero armá el viaje y después la sumás.</p>'}
          <div class="acciones-fila bi-acciones">
            <button type="button" class="btn btn-texto btn-chico" data-bi-descartar="${it.id}">Descartar</button>
            ${lista.length ? `<button type="button" class="btn btn-primario btn-chico" data-bi-sumar="${it.id}">Sumar al viaje</button>` : ''}
          </div>
        </article>`;
      }).join('')}</div>` : U.vacio({ icono: '📭', chico: true, texto: 'No hay reservas nuevas.' })}
      ${ayudaHTML()}`;
    caja.querySelectorAll('[data-bi-sumar]').forEach(b => b.onclick = () => {
      const it = items.find(x => x.id === b.dataset.biSumar);
      const v = R.db.viaje(caja.querySelector(`[data-bi-viaje="${it.id}"]`).value);
      b.disabled = true; b.textContent = 'Leyendo…';
      sumar(it, v).catch(e => { U.toast(e.message || 'No pude sumarla.'); b.disabled = false; b.textContent = 'Sumar al viaje'; });
    });
    caja.querySelectorAll('[data-bi-descartar]').forEach(b => b.onclick = async () => {
      await descartar(items.find(x => x.id === b.dataset.biDescartar));
      pintar(caja);
    });
    const bc = caja.querySelector('[data-a="copiarCasilla"]');
    if (bc) bc.onclick = async () => { try { await navigator.clipboard.writeText(CASILLA); U.toast('Dirección copiada.'); } catch (e) { U.toast(CASILLA); } };
  }

  async function archivoDe(it) {
    const a = (it.adjuntos || []).find(x => /pdf/i.test(x.tipo)) || (it.adjuntos || [])[0];
    if (!a) return null;
    let blob = null;
    if (a.base64) {
      const bin = atob(a.base64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      blob = new Blob([buf], { type: a.tipo });
    } else if (a.ruta) blob = await R.nube.bajarRuta(a.ruta);
    return blob ? new File([blob], a.nombre, { type: a.tipo }) : null;
  }

  async function marcar(it, estado) {
    items = items.filter(x => x.id !== it.id);
    try { await col().doc(it.id).update({ estado, usado: new Date().toISOString() }); } catch (e) { /* se reintenta al volver a abrir */ }
  }

  /** Suma la reserva al viaje: completa el paso que corresponde y guarda el archivo. */
  async function sumar(it, v) {
    if (!v) throw new Error('Elegí el viaje.');
    const archivo = await archivoDe(it);
    let datos = it.datos;
    if ((!datos || datos.tipo === 'otro') && archivo) datos = await R.escaneo.analizar(archivo, it.asunto);
    const id = datos ? R.escaneo.elegirPaso(v, datos) : null;
    await marcar(it, 'usado');
    if (id) {
      const tarea = R.motor.lista(v).find(x => x.id === id);
      U.cerrarModal();
      R.formularios.abrir(v, id, { prellenar: R.escaneo.aFormulario(tarea.base, datos), archivo, aviso: 'Llegó por mail: completé lo que pude leer. Revisalo antes de guardar.' });
      return;
    }
    if (archivo) {
      await R.documentos.guardarArchivos(v, [archivo], { categoria: 'otro' });
      R.db.guardarViaje(v);
      U.cerrarModal();
      U.toast('No encontré a qué paso corresponde: lo guardé en Documentos del viaje.');
      return;
    }
    U.cerrarModal();
    U.toast('Ese mail no tenía datos de reserva ni archivos para guardar.');
  }

  async function descartar(it) {
    if (!it) return;
    await marcar(it, 'descartado');
    (it.adjuntos || []).forEach(a => { if (a.ruta) R.nube.borrarRuta(a.ruta); });
    U.toast('Descartada.');
  }

  return { cargar, pendientes, inicioHTML, enlazarInicio, abrir, resumen, viajeSugerido, CASILLA, cargado: () => cargado };
})();
