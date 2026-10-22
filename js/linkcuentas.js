/* =========================================================
   Rutenda — link de cuentas para el grupo
   Un enlace de solo lectura con quién pagó qué y quién le debe
   a quién, para los que viajan con vos aunque no usen la app.
   No muestra documentos, reservas ni notas. Se actualiza solo
   cuando cargás un gasto, y lo podés apagar cuando quieras.
   ========================================================= */
window.R = window.R || {};

R.linkCuentas = (function () {
  const U = R.util;
  const { esc } = U;
  const enviado = {};
  const timers = {};

  const nombreDe = pid => ((R.db.persona(pid) || {}).nombre) || 'Viajero';

  function construir(v) {
    const t = R.gastos.totales(v);
    const s = R.gastos.saldos(v);
    const tr = R.gastos.transferencias(s);
    const cats = R.gastos.categorias();
    const pagado = {};
    (v.movimientos || []).forEach(m => { if (m.tipo === 'gasto') pagado[m.persona] = (pagado[m.persona] || 0) + R.gastos.montoBase(v, m); });
    const yo = R.db.yoEn(v);
    const alias = (R.auth.usuarioActual() || {}).alias || '';
    return {
      nombre: v.nombre || (v.destinos || []).filter(d => d.nombre && !d.soloDia).map(d => d.nombre).join(' → ') || v.destino || 'Viaje',
      moneda: v.monedaBase, fechaInicio: v.fechaInicio || '', fechaFin: v.fechaFin || '',
      gastado: t.gastado, ingresado: t.ingresado, neto: t.neto,
      personas: (v.participantes || []).map(pid => ({ id: pid, nombre: nombreDe(pid), pago: U.redondear(pagado[pid] || 0), parte: U.redondear(R.gastos.parteDe(v, pid)), saldo: s[pid] || 0, alias: pid === yo ? alias : '' })),
      transferencias: tr.map(x => ({ de: nombreDe(x.de), para: nombreDe(x.para), monto: x.monto, alias: x.para === yo ? alias : '' })),
      movimientos: (v.movimientos || []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 200).map(m => ({
        fecha: m.fecha, tipo: m.tipo, concepto: m.concepto || '', icono: m.tipo === 'pago' ? '🤝' : (cats.find(c => c.id === m.categoria) || { icono: '📌' }).icono,
        monto: U.redondear(R.gastos.montoBase(v, m)), original: m.moneda !== v.monedaBase ? `${m.monto} ${m.moneda}` : '',
        quien: nombreDe(m.persona), para: m.para ? nombreDe(m.para) : '', entre: ((m.division && m.division.entre) || []).map(nombreDe)
      }))
    };
  }

  const url = token => location.origin + location.pathname + '#cuentas/' + token;

  async function activar(v) {
    const token = await R.nube.guardarCuentas(v, construir(v));
    v.linkCuentas = { token, activo: true };
    enviado[v.id] = JSON.stringify(construir(v));
    R.db.guardarViaje(v);
    return token;
  }
  async function desactivar(v) {
    await R.nube.apagarCuentas(v);
    v.linkCuentas = Object.assign({}, v.linkCuentas, { activo: false });
    delete enviado[v.id];
    R.db.guardarViaje(v);
  }
  function actualizar(v) {
    if (!v.linkCuentas || !v.linkCuentas.activo || !R.db.puedeOrganizar(v)) return;
    clearTimeout(timers[v.id]);
    timers[v.id] = setTimeout(() => {
      const datos = construir(v);
      const firma = JSON.stringify(datos);
      if (enviado[v.id] === firma) return;
      R.nube.guardarCuentas(v, datos).then(() => { enviado[v.id] = firma; }).catch(() => { /* se reintenta con el próximo cambio */ });
    }, 3000);
  }

  function abrir(v) {
    if (R.db.modo() !== 'nube') { U.toast('El link de cuentas necesita tu cuenta en la nube.'); return; }
    const activo = v.linkCuentas && v.linkCuentas.activo;
    const org = R.db.puedeOrganizar(v);
    const { el } = U.modal({
      titulo: '🔗 Link de cuentas',
      subtitulo: 'Para que el grupo vea quién pagó qué y quién le debe a quién, sin instalar nada.',
      cuerpo: activo ? `
        <label class="campo"><span>Link</span><input id="lcUrl" readonly value="${esc(url(v.linkCuentas.token))}"></label>
        <div class="opciones-compartir">
          <button type="button" class="btn btn-primario btn-bloque" data-a="lcCompartir">↗ Mandarlo al grupo</button>
          <button type="button" class="btn btn-suave btn-bloque" data-a="lcCopiar">📋 Copiar el link</button>
          <a class="btn btn-texto btn-bloque" href="${esc(url(v.linkCuentas.token))}" target="_blank" rel="noopener">👀 Ver cómo lo ven</a>
        </div>
        <p class="ayuda">Se actualiza solo cada vez que cargás un gasto. No muestra documentos, reservas ni notas.</p>
        ${org ? '<button type="button" class="btn btn-texto btn-chico peligro" data-a="lcApagar">Dejar de compartir</button>' : ''}`
        : org ? `
        <ul class="lista-consejos">
          <li><span>💸</span><div>Cada gasto: quién pagó, cuánto y entre quiénes.</div></li>
          <li><span>🤝</span><div>Quién le debe a quién, con tu alias para que te paguen.</div></li>
          <li><span>🔒</span><div>Solo las cuentas: nada de documentos, reservas ni notas. Lo apagás cuando quieras.</div></li>
        </ul>
        <button type="button" class="btn btn-primario btn-bloque" data-a="lcCrear">Crear el link</button>`
        : '<p class="texto-suave">Quien organiza el viaje puede crear el link de cuentas.</p>',
      acciones: [{ texto: 'Cerrar' }]
    });
    const bCrear = el.querySelector('[data-a="lcCrear"]');
    if (bCrear) bCrear.onclick = async () => {
      bCrear.disabled = true; bCrear.textContent = 'Creando…';
      try { await activar(v); U.cerrarModal(); abrir(v); } catch (e) { bCrear.disabled = false; bCrear.textContent = 'Crear el link'; U.toast('No pude crear el link. Revisá la conexión.'); }
    };
    const bCop = el.querySelector('[data-a="lcCopiar"]');
    if (bCop) bCop.onclick = async () => { try { await navigator.clipboard.writeText(url(v.linkCuentas.token)); U.toast('Link copiado.'); } catch (e) { el.querySelector('#lcUrl').select(); } };
    const bCom = el.querySelector('[data-a="lcCompartir"]');
    if (bCom) bCom.onclick = async () => {
      const texto = `Las cuentas del viaje, al día: ${url(v.linkCuentas.token)}`;
      if (navigator.share) { try { await navigator.share({ title: 'Cuentas del viaje', text: texto }); } catch (e) { /* cancelado */ } }
      else window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
    };
    const bApagar = el.querySelector('[data-a="lcApagar"]');
    if (bApagar) bApagar.onclick = async () => {
      const ok = await U.confirmar('El link deja de funcionar para quien lo tenga. Después podés crear uno nuevo.', { titulo: 'Dejar de compartir', textoSi: 'Apagar el link', peligro: true });
      if (!ok) return;
      try { await desactivar(v); U.toast('Listo, el link ya no funciona.'); } catch (e) { U.toast('No pude apagarlo. Revisá la conexión.'); }
    };
  }

  /* ---------- Vista pública (#cuentas/{token}) ---------- */
  async function renderPublico(app, token) {
    document.title = 'Cuentas del viaje · Rutenda';
    app.innerHTML = '<div class="pantalla-carga"><span class="marca-logo grande"></span><p>Abriendo las cuentas…</p></div>';
    const doc = token ? await R.nube.leerCuentas(token) : null;
    if (!doc || !doc.datos) {
      app.innerHTML = U.vacio({ icono: '🔒', titulo: 'Este link ya no está activo', texto: 'Pedile a quien organiza que te mande uno nuevo.' });
      return;
    }
    const d = doc.datos;
    const $ = n => esc(U.fmtMoneda(n, d.moneda));
    document.title = `Cuentas · ${d.nombre} · Rutenda`;
    app.innerHTML = `
      <div class="familia-vista cuentas-vista">
        <section class="familia-portada">
          <span class="etiqueta-clara">Cuentas del viaje</span>
          <h1>${esc(d.nombre)}</h1>
          <p>${esc(U.fmtRango(d.fechaInicio, d.fechaFin))} · Gastaron <strong>${$(d.neto)}</strong></p>
        </section>
        <section class="bloque">
          <h3 class="bloque-titulo">🤝 Quién le debe a quién</h3>
          ${d.transferencias.length ? d.transferencias.map(x => `<div class="cv-deuda"><span><strong>${esc(x.de)}</strong> le debe a <strong>${esc(x.para)}</strong></span><strong class="cv-monto">${$(x.monto)}</strong>${x.alias ? `<small>Alias de ${esc(x.para)}: <b>${esc(x.alias)}</b></small>` : ''}</div>`).join('') : '<p>✓ Están a mano. Nadie le debe a nadie.</p>'}
        </section>
        <section class="bloque">
          <h3 class="bloque-titulo">👥 Cada uno</h3>
          <div class="cv-personas">${d.personas.map(p => `<div class="cv-persona"><strong>${esc(p.nombre)}</strong><small>Pagó ${$(p.pago)} · su parte ${$(p.parte)}</small><span class="${p.saldo > 0.009 ? 'positivo' : p.saldo < -0.009 ? 'negativo' : ''}">${p.saldo > 0.009 ? 'Le deben ' + $(p.saldo) : p.saldo < -0.009 ? 'Debe ' + $(-p.saldo) : 'A mano'}</span></div>`).join('')}</div>
        </section>
        <section class="bloque">
          <h3 class="bloque-titulo">🧾 Movimientos <span class="contador">${d.movimientos.length}</span></h3>
          ${d.movimientos.length ? d.movimientos.map(m => `<div class="cv-mov"><span class="cv-icono">${m.icono}</span><span class="cv-mtexto"><strong>${esc(m.tipo === 'pago' ? `${m.quien} le pagó a ${m.para}` : m.concepto || (m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'))}</strong><small>${esc(U.fmtFecha(m.fecha, 'dia'))}${m.tipo !== 'pago' ? ` · ${m.tipo === 'ingreso' ? 'Recibió' : 'Pagó'} ${esc(m.quien)}${m.entre.length ? ' · entre ' + esc(m.entre.join(', ')) : ''}` : ''}${m.original ? ' · ' + esc(m.original) : ''}</small></span><strong class="${m.tipo === 'ingreso' ? 'positivo' : ''}">${m.tipo === 'ingreso' ? '+' : ''}${$(m.monto)}</strong></div>`).join('') : '<p class="texto-suave">Todavía no hay gastos cargados.</p>'}
        </section>
        <p class="familia-pie">Solo lectura · Se actualiza cuando se carga un gasto · <a href="${location.origin + location.pathname}">Rutenda</a></p>
      </div>`;
  }

  return { construir, abrir, actualizar, activar, desactivar, renderPublico, url };
})();
