/* =========================================================
   Rutenda — presupuesto sugerido
   Con un toque, una estimación de cuánto sale el viaje según
   los destinos, las noches, cuántos viajan y el estilo
   (económico, medio o cómodo). Usa IA solo cuando lo pedís;
   el resultado se guarda en el viaje. Es orientativo.
   ========================================================= */
window.R = window.R || {};

R.presupuesto = (function () {
  const U = R.util;
  const { esc } = U;
  const NIVELES = [['economico', '🎒 Económico'], ['medio', '🧳 Medio'], ['comodo', '🛎️ Cómodo']];
  const CATS = [['comida', '🍽️ Comida'], ['transporte', '🚕 Moverse allá'], ['actividades', '🎟️ Actividades'], ['alojamiento', '🏨 Alojamiento']];

  function estadias(v) { return R.recorrido.estadias(v).filter(e => e.nombre); }

  async function pedir(v) {
    if (R.db.modo() !== 'nube' || !R.nube.auth().currentUser) throw new Error('Necesitás entrar con tu cuenta en la nube.');
    const token = await R.nube.auth().currentUser.getIdToken();
    const r = await fetch('/api/presupuesto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        destinos: estadias(v).map(e => ({ nombre: e.nombre, region: (e.lugar || {}).region || '', pais: (e.lugar || {}).pais || '' })),
        mes: v.fechaInicio ? Number(v.fechaInicio.slice(5, 7)) : new Date().getMonth() + 1
      })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No pude calcularlo ahora.');
    return d;
  }

  /** Total en USD para un estilo: { total, porCat, porDiaPersona, dias, noches } */
  function calcular(v, datos, nivel) {
    const personas = Math.max(1, (v.participantes || []).length);
    const habitaciones = Math.ceil(personas / 2);
    const est = estadias(v);
    const porCat = { comida: 0, transporte: 0, actividades: 0, alojamiento: 0 };
    let dias = 0, noches = 0;
    est.forEach((e, i) => {
      const d = (datos.destinos || [])[i] || (datos.destinos || [])[0];
      if (!d) return;
      const n = e.noches || 0;
      const diasDest = Math.max(1, n);
      const x = d[nivel] || {};
      porCat.comida += (x.comida || 0) * diasDest * personas;
      porCat.transporte += (x.transporte || 0) * diasDest * personas;
      porCat.actividades += (x.actividades || 0) * diasDest * personas;
      porCat.alojamiento += (x.alojamiento || 0) * n * habitaciones;
      dias += diasDest; noches += n;
    });
    const total = Object.values(porCat).reduce((a, b) => a + b, 0);
    return { total, porCat, dias, noches, personas, porDiaPersona: dias ? total / dias / personas : 0 };
  }

  async function abrir(v) {
    if (!estadias(v).length) { U.toast('Cargá los destinos y las noches para estimarlo.'); return; }
    let nivel = 'medio';
    const { el } = U.modal({ titulo: '✨ Presupuesto sugerido', subtitulo: 'Estimación orientativa: no incluye pasajes.', ancho: true, cuerpo: '<div class="presupuesto"><p class="texto-suave">Calculando… 🧮</p></div>' });
    const caja = el.querySelector('.presupuesto');
    let datos = v.presupuestoSugerido && v.presupuestoSugerido.destinos ? v.presupuestoSugerido : null;
    try {
      if (!datos) {
        datos = await pedir(v);
        if (R.db.puedeOrganizar(v)) { v.presupuestoSugerido = datos; R.db.guardarViaje(v); }
      }
    } catch (e) { caja.innerHTML = `<p>😕 ${esc(e.message)}</p>`; return; }
    // Cotización para pasar de dólares a la moneda del viaje (sugerida, editable)
    let cot = null;
    if (v.monedaBase !== 'USD' && R.cotizacion) { try { cot = await R.cotizacion.obtener('USD', v.monedaBase); } catch (e) { cot = null; } }
    const factor = v.monedaBase === 'USD' ? 1 : (cot && cot.valor) || 0;
    const enBase = n => factor ? U.fmtMoneda(Math.round(n * factor), v.monedaBase) : '';
    const yaPasajes = (v.movimientos || []).filter(m => m.tipo === 'gasto' && m.categoria === 'transporte').reduce((a, m) => a + R.gastos.montoBase(v, m), 0);

    const pintar = () => {
      if (!caja.isConnected) return;
      const c = calcular(v, datos, nivel);
      caja.innerHTML = `
        <div class="segmentado presupuesto-niveles" role="group" aria-label="Estilo del viaje">${NIVELES.map(([k, n]) => `<button type="button" data-nivel="${k}" class="${k === nivel ? 'activo' : ''}">${n}</button>`).join('')}</div>
        <div class="pres-total">
          <small>${U.plural(c.personas, 'persona', 'personas')} · ${U.plural(c.noches, 'noche', 'noches')}</small>
          <strong>US$ ${Math.round(c.total).toLocaleString('es-AR')}</strong>
          ${factor && v.monedaBase !== 'USD' ? `<span>≈ ${esc(enBase(c.total))} <small>(${cot && cot.fuente ? esc(cot.fuente) : 'cotización del día'})</small></span>` : ''}
          <small>Unos US$ ${Math.round(c.porDiaPersona)} por persona por día</small>
        </div>
        <ul class="pres-cats">${CATS.map(([k, n]) => `<li><span>${n}</span><strong>US$ ${Math.round(c.porCat[k]).toLocaleString('es-AR')}</strong></li>`).join('')}</ul>
        ${(datos.destinos || []).filter(d => d.nota).map(d => `<p class="pres-nota">📍 <strong>${esc(d.nombre)}:</strong> ${esc(d.nota)}</p>`).join('')}
        ${(datos.consejos || []).length ? `<div class="pres-consejos"><strong>💡 Para gastar menos</strong><ul>${datos.consejos.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        <p class="ayuda">Orientativo, armado con IA según destino, temporada y estilo. No incluye pasajes${yaPasajes ? ` (ya cargaste ${esc(U.fmtMoneda(yaPasajes, v.monedaBase))} en Transporte)` : ''}.</p>
        ${R.db.puedeOrganizar(v) && factor ? `<button type="button" class="btn btn-primario btn-bloque" data-a="usar">Usar como presupuesto: ${esc(U.fmtMoneda(Math.round(c.total * factor + yaPasajes), v.monedaBase))}</button>${yaPasajes ? '<p class="ayuda pres-ayuda">Suma lo que ya cargaste en pasajes.</p>' : ''}` : ''}`;
      caja.querySelectorAll('[data-nivel]').forEach(b => b.onclick = () => { nivel = b.dataset.nivel; pintar(); });
      const bu = caja.querySelector('[data-a="usar"]');
      if (bu) bu.onclick = () => {
        v.presupuesto = Math.round(c.total * factor + yaPasajes);
        R.db.guardarViaje(v);
        U.cerrarModal();
        U.toast('Presupuesto guardado. Lo podés ajustar cuando quieras.');
        R.app.refrescar();
      };
    };
    pintar();
  }

  return { abrir, calcular };
})();
