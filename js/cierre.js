/* =========================================================
   Rutenda — cierre del viaje
   Cuando volvés, una tarjeta para terminar todo en un minuto:
   quién le debe a quién (y pedirlo por WhatsApp), el total
   gastado, el resumen para compartir y tus recuerdos.
   ========================================================= */
window.R = window.R || {};

R.cierre = (function () {
  const U = R.util;
  const { esc } = U;

  /** ¿Toca cerrar este viaje? (terminó hace menos de 30 días y no lo cerraste) */
  function aplica(v) {
    if (!v || v.ejemplo || v.cerrado || !v.fechaFin) return false;
    const hoy = U.hoyISO();
    return v.fechaFin < hoy && v.fechaFin >= U.sumarDias(hoy, -30);
  }

  function nombre(v) { return v.nombre || (v.destinos || []).filter(d => d.nombre && !d.soloDia).map(d => d.nombre).join(' → ') || v.destino || 'tu viaje'; }

  function tarjetaHTML(v) {
    if (!aplica(v)) return '';
    const t = R.gastos.totales(v);
    const varios = (v.participantes || []).length > 1;
    const tr = varios ? R.gastos.transferencias(R.gastos.saldos(v)) : [];
    const yo = R.db.yoEn(v);
    const meDeben = tr.filter(x => x.para === yo), debo = tr.filter(x => x.de === yo);
    const quien = pid => esc(((R.db.persona(pid) || {}).nombre) || 'Viajero');
    const fila = (icono, texto, accion, boton) => `<li><span>${icono}</span><span class="ci-texto">${texto}</span>${boton ? `<button type="button" class="btn btn-suave btn-chico" data-cierre="${accion}" data-viaje="${v.id}">${boton}</button>` : ''}</li>`;
    return `
      <section class="cierre-viaje" data-cierre-viaje="${v.id}">
        <div class="ci-cab"><span class="ci-bandera">🏁</span><div><small>Volviste de</small><strong>${esc(nombre(v))}</strong></div></div>
        <p class="texto-suave">Cerremos el viaje en un minuto:</p>
        <ul class="ci-lista">
          ${(v.movimientos || []).length ? fila('💸', `Gastaron <strong>${esc(U.fmtMoneda(t.neto, v.monedaBase))}</strong>${varios ? ` · ${tr.length ? (meDeben.length ? `te deben ${meDeben.map(x => quien(x.de) + ' ' + esc(U.fmtMoneda(x.monto, v.monedaBase))).join(', ')}` : debo.length ? `debés ${debo.map(x => esc(U.fmtMoneda(x.monto, v.monedaBase)) + ' a ' + quien(x.para)).join(', ')}` : `faltan ${U.plural(tr.length, 'pago', 'pagos')} entre ustedes`) : 'están a mano ✓'}` : ''}`, 'cuentas', varios && tr.length ? 'Ver cuentas' : 'Ver gastos')
            : fila('💸', 'No cargaste gastos. Si querés, sumalos ahora.', 'cuentas', 'Cargar')}
          ${fila('🖼️', 'Un resumen lindo para compartir: días, lugares y km.', 'resumen', 'Ver')}
          ${fila('📝', v.notasViaje ? 'Ya anotaste tus recuerdos ✓' : 'Anotá lo que te gustó y lo que harías distinto.', 'notas', v.notasViaje ? 'Ver' : 'Anotar')}
        </ul>
        <button type="button" class="btn btn-primario btn-bloque" data-cierre="cerrar" data-viaje="${v.id}">✓ Listo, cerrar el viaje</button>
      </section>`;
  }

  /** Tarjetas para el inicio (máximo dos). */
  function inicioHTML() {
    return R.db.viajes().filter(aplica).sort((a, b) => b.fechaFin.localeCompare(a.fechaFin)).slice(0, 2).map(tarjetaHTML).join('');
  }

  function enlazar(cont) {
    cont.querySelectorAll('[data-cierre]').forEach(b => b.onclick = () => {
      const v = R.db.viaje(b.dataset.viaje);
      if (!v) return;
      const a = b.dataset.cierre;
      if (a === 'cuentas') {
        R.gastos.verVista((v.participantes || []).length > 1 ? 'cuentas' : 'movimientos');
        location.hash = `#viaje/${v.id}/gastos`;
      } else if (a === 'resumen') R.resumen.abrir(v);
      else if (a === 'notas') {
        location.hash = `#viaje/${v.id}/guia`;
        setTimeout(() => { const n = document.getElementById('notasViaje'); if (n) { const d = n.closest('details'); if (d) d.open = true; n.focus(); n.scrollIntoView({ block: 'center' }); } }, 250);
      } else if (a === 'cerrar') {
        v.cerrado = U.hoyISO();
        R.db.guardarViaje(v);
        U.toast('¡Viaje cerrado! Queda en "Mis viajes" para cuando quieras volver a verlo. 🌍');
        R.app.refrescar();
      }
    });
  }

  return { aplica, tarjetaHTML, inicioHTML, enlazar };
})();
