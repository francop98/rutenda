/* =========================================================
   Rutenda — link para la familia
   Un enlace de solo lectura para que la familia vea dónde
   estás cada día: sin cuenta y sin poder cambiar nada.
   No incluye gastos, documentos, notas ni códigos de reserva.
   Se actualiza solo cuando cambiás el itinerario.
   ========================================================= */
window.R = window.R || {};

R.familia = (function () {
  const U = R.util;
  const { esc } = U;
  const enviado = {};   // { viajeId: firma } para no escribir de más
  const timers = {};

  /** Lo que ve la familia: solo el recorrido, día por día. */
  function construir(v) {
    const limpiar = t => String(t || '').split(' · ').filter(p => p && !/^Cód\.|c[oó]digo|confirma/i.test(p)).join(' · ');
    const dias = R.itinerario.diasDelViaje(v).map(f => {
      const d = R.itinerario.diaDe(v, f);
      return {
        fecha: f, numero: d.numero, lugar: d.lugarNombre || '', amaneces: d.amaneces || '',
        dormis: d.dormis ? { icono: d.dormis.icono, texto: d.dormis.falta ? d.lugarNombre || d.dormis.texto.split(' · ')[0] : d.dormis.texto, direccion: d.dormis.direccion || '' } : null,
        items: d.items.map(it => ({ hora: it.hora || '', icono: it.icono, titulo: it.titulo, sub: it.clase === 'ev-propio' ? '' : limpiar(it.sub) }))
      };
    });
    const org = ((v.personas || {})[R.db.yoEn(v)] || {}).nombre || '';
    return {
      nombre: v.nombre || (v.destinos || []).filter(d => d.nombre && !d.soloDia).map(d => d.nombre).join(' → ') || v.destino || 'Viaje',
      quien: org.split(' ')[0] || '',
      fechaInicio: v.fechaInicio || '', fechaFin: v.fechaFin || '',
      origen: (v.origen && v.origen.nombre) || '',
      tema: R.paisaje ? R.paisaje.fondo(v) : '',
      dias
    };
  }

  function url(token) { return location.origin + location.pathname + '#familia/' + token; }
  function puede(v) { return R.db.modo() === 'nube' && R.db.puedeOrganizar(v); }

  async function activar(v) {
    const token = await R.nube.guardarFamilia(v, construir(v));
    v.linkFamilia = { token, activo: true };
    enviado[v.id] = JSON.stringify(construir(v));
    R.db.guardarViaje(v);
    return token;
  }
  async function desactivar(v) {
    await R.nube.apagarFamilia(v);
    v.linkFamilia = Object.assign({}, v.linkFamilia, { activo: false });
    delete enviado[v.id];
    R.db.guardarViaje(v);
  }

  /** Cuando cambia el viaje: sube la versión nueva (agrupado, cada unos segundos). */
  function actualizar(v) {
    if (!v.linkFamilia || !v.linkFamilia.activo || !puede(v)) return;
    clearTimeout(timers[v.id]);
    timers[v.id] = setTimeout(() => {
      const datos = construir(v);
      const firma = JSON.stringify(datos);
      if (enviado[v.id] === firma) return;
      R.nube.guardarFamilia(v, datos).then(() => { enviado[v.id] = firma; }).catch(() => { /* reintenta en el próximo cambio */ });
    }, 3000);
  }

  /** Cartel para crear, copiar o apagar el link. */
  function abrir(v) {
    if (R.db.modo() !== 'nube') { U.toast('El link para la familia necesita tu cuenta en la nube.'); return; }
    const activo = v.linkFamilia && v.linkFamilia.activo;
    const org = R.db.puedeOrganizar(v);
    const { el } = U.modal({
      titulo: '👪 Link para la familia',
      subtitulo: 'Ven dónde estás cada día, sin cuenta y sin poder cambiar nada.',
      cuerpo: activo ? `
        <label class="campo"><span>Link</span><input id="lfUrl" readonly value="${esc(url(v.linkFamilia.token))}"></label>
        <div class="opciones-compartir">
          <button type="button" class="btn btn-primario btn-bloque" data-a="lfCompartir">↗ Mandarlo (WhatsApp, mail…)</button>
          <button type="button" class="btn btn-suave btn-bloque" data-a="lfCopiar">📋 Copiar el link</button>
          <a class="btn btn-texto btn-bloque" href="${esc(url(v.linkFamilia.token))}" target="_blank" rel="noopener">👀 Ver cómo lo ven</a>
        </div>
        <p class="ayuda">Se actualiza solo cuando cambiás el itinerario. No muestra gastos, documentos, notas ni códigos de reserva.</p>
        ${org ? '<button type="button" class="btn btn-texto btn-chico peligro" data-a="lfApagar">Dejar de compartir</button>' : ''}`
        : org ? `
        <ul class="lista-consejos">
          <li><span>🗓️</span><div>Cada día: dónde estás, tus traslados y dónde dormís.</div></li>
          <li><span>🔒</span><div>No muestra gastos, documentos, notas ni códigos de reserva.</div></li>
          <li><span>⏸️</span><div>Lo podés apagar cuando quieras.</div></li>
        </ul>
        <button type="button" class="btn btn-primario btn-bloque" data-a="lfCrear">Crear el link</button>`
        : '<p class="texto-suave">Quien organiza el viaje puede crear un link para que la familia vea el itinerario.</p>',
      acciones: [{ texto: 'Cerrar' }]
    });
    const bCrear = el.querySelector('[data-a="lfCrear"]');
    if (bCrear) bCrear.onclick = async () => {
      bCrear.disabled = true; bCrear.textContent = 'Creando…';
      try { await activar(v); U.cerrarModal(); abrir(v); } catch (e) { bCrear.disabled = false; bCrear.textContent = 'Crear el link'; U.toast('No pude crear el link. Revisá la conexión.'); }
    };
    const bCop = el.querySelector('[data-a="lfCopiar"]');
    if (bCop) bCop.onclick = async () => { try { await navigator.clipboard.writeText(url(v.linkFamilia.token)); U.toast('Link copiado.'); } catch (e) { el.querySelector('#lfUrl').select(); } };
    const bCom = el.querySelector('[data-a="lfCompartir"]');
    if (bCom) bCom.onclick = async () => {
      const texto = `Seguí mi viaje día por día: ${url(v.linkFamilia.token)}`;
      if (navigator.share) { try { await navigator.share({ title: 'Mi viaje', text: texto }); } catch (e) { /* cancelado */ } }
      else window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
    };
    const bApagar = el.querySelector('[data-a="lfApagar"]');
    if (bApagar) bApagar.onclick = async () => {
      const ok = await U.confirmar('El link deja de funcionar para quien lo tenga. Después podés crear uno nuevo.', { titulo: 'Dejar de compartir', textoSi: 'Apagar el link', peligro: true });
      if (!ok) return;
      try { await desactivar(v); U.toast('Listo, el link ya no funciona.'); } catch (e) { U.toast('No pude apagarlo. Revisá la conexión.'); }
    };
  }

  /* ---------------------------------------------------------
     Vista pública (#familia/{token})
     --------------------------------------------------------- */
  const cache = { token: '', doc: null, t: 0 };
  async function renderPublico(app, token) {
    document.title = 'Viaje · Rutenda';
    if (cache.token !== token) app.innerHTML = '<div class="pantalla-carga"><span class="marca-logo grande"></span><p>Abriendo el viaje…</p></div>';
    let doc = cache.token === token && Date.now() - cache.t < 60000 ? cache.doc : null;
    if (!doc) {
      doc = token ? await R.nube.leerFamilia(token) : null;
      if (doc) Object.assign(cache, { token, doc, t: Date.now() });
    }
    if (!doc || !doc.datos) {
      app.innerHTML = U.vacio({ icono: '🔒', titulo: 'Este link ya no está activo', texto: 'Pedile a quien viaja que te mande uno nuevo.' });
      return;
    }
    const d = doc.datos;
    const hoy = U.hoyISO();
    const viajando = d.fechaInicio && hoy >= d.fechaInicio && (!d.fechaFin || hoy <= d.fechaFin);
    const diaHoy = viajando ? (d.dias || []).find(x => x.fecha === hoy) : null;
    const estado = !d.fechaInicio ? 'Fechas a definir'
      : hoy < d.fechaInicio ? `Sale en ${U.plural(U.diasEntre(hoy, d.fechaInicio), 'día', 'días')}`
      : viajando ? `Día ${U.diasEntre(d.fechaInicio, hoy) + 1} del viaje` : 'Ya volvió 🏠';
    document.title = `${d.nombre} · Rutenda`;
    const item = it => `
      <article class="evento">
        <span class="ev-hora">${esc(it.hora || '—')}</span>
        <span class="ev-icono">${it.icono}</span>
        <div class="ev-texto"><strong>${esc(it.titulo)}</strong>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
      </article>`;
    const dia = x => `
      <section class="dia ${x.fecha === hoy ? 'hoy' : ''}" id="fam-${x.fecha}">
        <header class="dia-cab"><div>
          <strong>Día ${x.numero}${x.lugar ? ' · ' + esc(x.lugar) : ''}</strong>${x.fecha === hoy ? ' <span class="chip chip-sol">Hoy</span>' : ''}
          <small>${U.fmtFecha(x.fecha, 'largo')}</small></div></header>
        ${x.amaneces && x.amaneces !== 'Amanecés en ' + x.lugar ? `<p class="dia-linea">🌅 ${esc(x.amaneces.replace('Arrancás', 'Arranca').replace('Amanecés', 'Amanece'))}</p>` : ''}
        ${x.items.length ? x.items.map(item).join('') : '<p class="dia-libre">Día libre ☀️</p>'}
        ${x.dormis ? `<p class="dia-linea dia-dormis">${x.dormis.icono} ${esc(x.dormis.texto)}</p>` : ''}
      </section>`;
    app.innerHTML = `
      <div class="familia-vista">
        <section class="familia-portada" style="${d.tema ? 'background:' + esc(d.tema) : ''}">
          <span class="etiqueta-clara">${d.quien ? 'El viaje de ' + esc(d.quien) : 'Un viaje'}</span>
          <h1>${esc(d.nombre)}</h1>
          <p>${esc(U.fmtRango(d.fechaInicio, d.fechaFin))} · <strong>${esc(estado)}</strong></p>
        </section>
        ${diaHoy ? `
          <section class="bloque familia-hoy">
            <span class="etiqueta">Hoy</span>
            <h2>${diaHoy.lugar ? '📍 ' + esc(diaHoy.lugar) : 'De viaje'}</h2>
            ${diaHoy.dormis ? `<p>${diaHoy.dormis.icono} Duerme: ${esc(diaHoy.dormis.texto)}</p>` : ''}
          </section>` : ''}
        ${(d.dias || []).length ? (d.dias || []).map(dia).join('') : U.vacio({ icono: '🗓️', texto: 'Todavía no cargó las fechas del viaje.' })}
        <p class="familia-pie">Solo lectura · Se actualiza cuando cambia el viaje · <a href="${location.origin + location.pathname}">Rutenda</a></p>
      </div>`;
    const h = app.querySelector('.dia.hoy');
    if (h) setTimeout(() => h.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300);
  }

  return { construir, abrir, actualizar, activar, desactivar, renderPublico, url };
})();
