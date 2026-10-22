/* =========================================================
   Rutenda — el pasaje a mano
   El día que viajás, arriba de todo: el traslado de hoy con
   el código de reserva grande (para copiarlo o mostrarlo),
   el asiento y el pasaje (si es una foto, se ve ahí mismo,
   con el QR listo para escanear). Funciona sin señal.
   ========================================================= */
window.R = window.R || {};

R.pasaje = (function () {
  const U = R.util;
  const { esc } = U;
  const C = () => R.recorrido;

  /** Traslados que salen hoy (los que ya llegaron hace rato, no). */
  function deHoy(v) {
    const hoy = U.hoyISO();
    return C().todosLosSegmentos(v.recorrido || []).map(x => x.seg).filter(s => s.sale && s.sale.fecha === hoy);
  }

  function datosDe(v, s) {
    const t = v.tareas && v.tareas['t_segmento__' + s.id];
    const d = (t && t.datos) || {};
    const p = (d.tramos || [])[0] || {};
    return {
      codigo: d.codigo || '', asientos: d.asientos || '', equipaje: d.equipaje && d.equipaje !== 'Sin definir' ? d.equipaje : '',
      empresa: p.empresa || '', numero: p.numero || '',
      aeropuertos: p.desdeAeropuerto && (d.tramos.slice(-1)[0] || {}).hastaAeropuerto ? `${p.desdeAeropuerto} → ${d.tramos.slice(-1)[0].hastaAeropuerto}` : '',
      escalas: (d.tramos || []).length > 1 ? (d.tramos || []).length - 1 : 0
    };
  }
  const docsDe = (v, s) => (v.documentos || []).filter(d => d.tareaId === 't_segmento__' + s.id);
  const esImagen = d => /^image\//.test(d.tipoMime || '') || /\.(jpe?g|png|webp|heic)$/i.test(d.nombreArchivo || '');

  function html(v) {
    const segs = deHoy(v);
    if (!segs.length) return '';
    return segs.map(s => {
      const m = C().medio(s.medio);
      const x = datosDe(v, s);
      const docs = docsDe(v, s);
      const sh = R.salida && R.salida.horaDeSalir(v, s);
      const linea = [[x.empresa, x.numero].filter(Boolean).map(esc).join(' '), esc(x.aeropuertos), x.escalas ? U.plural(x.escalas, 'escala', 'escalas') : ''].filter(Boolean).join(' · ');
      return `
        <section class="pasaje-hoy" data-pasaje="${s.id}">
          <div class="ph-cab">
            <span class="ph-icono">${m.icono}</span>
            <div class="ph-ruta"><small>Tu ${m.nombre.toLowerCase()} de hoy${s.sale.hora ? ' · ' + s.sale.hora : ''}</small>
              <strong>${esc(s.desde.nombre)} → ${esc(s.hasta.nombre)}</strong>
              ${linea ? `<span>${linea}</span>` : ''}
            </div>
          </div>
          ${x.codigo ? `
            <button type="button" class="ph-codigo" data-copiar="${esc(x.codigo)}" aria-label="Copiar código de reserva">
              <small>Código de reserva</small><strong>${esc(x.codigo)}</strong><span>Tocá para copiar</span>
            </button>` : `<p class="ph-falta">Sin código cargado. <button type="button" class="btn-texto-mini" data-ph-cargar="t_segmento__${s.id}">Cargarlo</button></p>`}
          ${x.asientos || x.equipaje ? `<p class="ph-datos">${x.asientos ? `💺 ${esc(x.asientos)}` : ''}${x.asientos && x.equipaje ? ' · ' : ''}${x.equipaje ? `🧳 ${esc(x.equipaje)}` : ''}</p>` : ''}
          ${sh && s.sale.fecha === U.hoyISO() ? `<p class="ph-datos">🕒 Conviene salir a las <strong>${sh.hora}</strong>${sh.diaAntes ? ' (el día anterior)' : ''}</p>` : ''}
          ${docs.filter(esImagen).map(d => `<div class="ph-imagen" data-ph-img="${d.id}"><span class="texto-tenue">Cargando el pasaje…</span></div>`).join('')}
          ${docs.length ? `<div class="ph-docs">${docs.map(d => `<button type="button" class="btn btn-suave btn-chico" data-ph-doc="${d.id}">${R.documentos.iconoDoc(d)} ${esc(d.nombre)}</button>`).join('')}</div>`
            : `<button type="button" class="btn btn-texto btn-chico solo-org" data-ph-cargar="t_segmento__${s.id}">📎 Sumar el pasaje (PDF o foto)</button>`}
        </section>`;
    }).join('');
  }

  function enlazar(raiz, v) {
    deHoy(v).forEach(s => { const c = raiz.querySelector(`[data-pasaje="${s.id}"]`); if (c) enlazarUno(c, v); });
  }
  function enlazarUno(cont, v) {
    cont.querySelectorAll('[data-copiar]').forEach(b => b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copiar); U.toast('Código copiado.'); } catch (e) { U.toast(b.dataset.copiar); }
    });
    cont.querySelectorAll('[data-ph-doc]').forEach(b => b.onclick = () => R.documentos.abrir((v.documentos || []).find(d => d.id === b.dataset.phDoc), v));
    cont.querySelectorAll('[data-ph-cargar]').forEach(b => b.onclick = () => R.formularios.abrir(v, b.dataset.phCargar));
    // Las fotos del pasaje (con el QR) se ven ahí mismo, también sin señal
    cont.querySelectorAll('[data-ph-img]').forEach(async caja => {
      const d = (v.documentos || []).find(x => x.id === caja.dataset.phImg);
      try {
        const blob = await R.documentos.blobDe(d, v);
        const url = URL.createObjectURL(blob);
        caja.innerHTML = `<img src="${url}" alt="${esc(d.nombre)}">`;
        caja.onclick = () => R.documentos.abrir(d, v);
      } catch (e) { caja.remove(); }
    });
  }

  return { html, enlazar, deHoy };
})();
