/* =========================================================
   Rutenda — "Mi año viajero"
   Tus números del año: viajes, días afuera, lugares, países,
   kilómetros y cómo te moviste. Con una imagen para compartir.
   Todo se calcula en el celular, sin servicios externos.
   ========================================================= */
window.R = window.R || {};

R.anio = (function () {
  const U = R.util;
  const { esc } = U;
  const C = () => R.recorrido;
  let anioElegido = null;

  function viajesDe(anio) {
    return R.db.viajes().filter(v => !v.ejemplo && v.fechaInicio && v.fechaInicio.slice(0, 4) === String(anio));
  }
  function anios() {
    const s = new Set(R.db.viajes().filter(v => !v.ejemplo && v.fechaInicio).map(v => Number(v.fechaInicio.slice(0, 4))));
    s.add(new Date().getFullYear());
    return Array.from(s).sort((a, b) => b - a);
  }

  /** Los números de un año. */
  function datos(anio) {
    const vs = viajesDe(anio);
    const hoy = U.hoyISO();
    let dias = 0, kms = 0, traslados = 0;
    const lugares = new Set(), paises = new Map(), medios = {}, gasto = {}, compas = new Set();
    let largo = null;
    vs.forEach(v => {
      const fin = v.fechaFin || v.fechaInicio;
      const d = U.diasEntre(v.fechaInicio, fin) + 1;
      dias += d;
      if (!largo || d > largo.dias) largo = { nombre: v.nombre || (v.destinos || []).filter(x => x.nombre && !x.soloDia).map(x => x.nombre).join(' → ') || v.destino, dias: d };
      (v.destinos || []).filter(x => x.nombre).forEach(x => {
        lugares.add(x.nombre.toLowerCase());
        if (x.codigoPais) paises.set(x.codigoPais, x.pais || x.codigoPais);
      });
      const segs = C().todosLosSegmentos(v.recorrido || []).map(x => x.seg);
      segs.forEach(s => { kms += R.resumen.km(s.desde, s.hasta); medios[s.medio] = (medios[s.medio] || 0) + 1; traslados++; });
      const t = R.gastos.totales(v);
      if (t.neto) gasto[v.monedaBase] = (gasto[v.monedaBase] || 0) + t.neto;
      const yo = R.db.yoEn(v);
      (v.participantes || []).filter(p => p !== yo).forEach(p => compas.add(p));
    });
    const pasados = vs.filter(v => (v.fechaFin || v.fechaInicio) < hoy).length;
    return { anio, viajes: vs.length, pasados, dias, kms: Math.round(kms), traslados, lugares: lugares.size, paises: Array.from(paises.entries()), medios, gasto, compas: compas.size, largo };
  }

  function html(d) {
    const iconos = { avion: '✈️', micro: '🚌', auto: '🚗', tren: '🚆', barco: '⛴️', otro: '🧭' };
    const cifra = (n, t) => `<div class="anio-cifra"><strong>${n}</strong><small>${t}</small></div>`;
    return `
      <div class="anio-anios">${anios().map(a => `<button type="button" class="chip-op ${a === d.anio ? 'activo' : ''}" data-anio="${a}">${a}</button>`).join('')}</div>
      ${d.viajes ? `
        <div class="anio-grilla">
          ${cifra(d.viajes, d.viajes === 1 ? 'viaje' : 'viajes')}
          ${cifra(d.dias, d.dias === 1 ? 'día de viaje' : 'días de viaje')}
          ${cifra(d.lugares, d.lugares === 1 ? 'lugar' : 'lugares')}
          ${cifra(d.paises.length || 1, (d.paises.length || 1) === 1 ? 'país' : 'países')}
          ${cifra(d.kms ? d.kms.toLocaleString('es-AR') : '—', 'km recorridos')}
          ${cifra(d.compas, d.compas === 1 ? 'compañero' : 'compañeros')}
        </div>
        ${d.paises.length ? `<p class="anio-linea">${d.paises.map(([c, n]) => `<span class="anio-pais">${R.lugares.bandera(c) || '🏳️'} ${esc(n)}</span>`).join('')}</p>` : ''}
        ${Object.keys(d.medios).length ? `<p class="anio-linea">${Object.entries(d.medios).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<span class="anio-pais">${iconos[m] || '🧭'} ${n}</span>`).join('')} <small class="texto-suave">${U.plural(d.traslados, 'traslado', 'traslados')}</small></p>` : ''}
        ${d.largo ? `<p class="anio-linea">🏆 El viaje más largo: <strong>${esc(d.largo.nombre)}</strong> (${U.plural(d.largo.dias, 'día', 'días')})</p>` : ''}
        ${Object.keys(d.gasto).length ? `<p class="anio-linea">💸 En viajes: ${Object.entries(d.gasto).map(([m, n]) => `<strong>${esc(U.fmtMoneda(n, m))}</strong>`).join(' + ')}</p>` : ''}
        ${d.pasados < d.viajes ? `<p class="ayuda">Incluye ${U.plural(d.viajes - d.pasados, 'viaje que todavía no hiciste', 'viajes que todavía no hiciste')}.</p>` : ''}
        <button type="button" class="btn btn-primario btn-bloque" data-a="anioImagen">🖼️ Imagen para compartir</button>`
      : U.vacio({ icono: '🗺️', chico: true, texto: `Todavía no hay viajes en ${d.anio}.` })}`;
  }

  async function imagen(d) {
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    try { await document.fonts.ready; } catch (e) { /* sin fuentes web */ }
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1F3A36'); g.addColorStop(.6, '#2B4F48'); g.addColorStop(1, '#8C7444');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,236,190,.35)'; ctx.beginPath(); ctx.arc(880, 250, 120, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(212,175,106,.9)'; ctx.lineWidth = 6; ctx.setLineDash([2, 18]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(80, 520); ctx.bezierCurveTo(360, 400, 640, 580, 1000, 440); ctx.stroke(); ctx.setLineDash([]);
    const serif = '"Cormorant Garamond", Georgia, serif', sans = '"DM Sans", system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.font = `600 34px ${sans}`; ctx.globalAlpha = .85; ctx.fillText('MI AÑO VIAJERO', 90, 150); ctx.globalAlpha = 1;
    ctx.font = `600 190px ${serif}`; ctx.fillText(String(d.anio), 80, 330);
    const cifras = [[d.viajes, d.viajes === 1 ? 'viaje' : 'viajes'], [d.dias, 'días de viaje'], [d.lugares, d.lugares === 1 ? 'lugar' : 'lugares'],
      [d.paises.length || 1, (d.paises.length || 1) === 1 ? 'país' : 'países'], [d.kms ? d.kms.toLocaleString('es-AR') : '—', 'km'], [d.traslados, 'traslados']];
    cifras.forEach(([n, t], i) => {
      const x = 90 + (i % 2) * 470, y = 650 + Math.floor(i / 2) * 190;
      ctx.font = `600 110px ${serif}`; ctx.fillStyle = '#fff'; ctx.fillText(String(n), x, y);
      ctx.font = `500 34px ${sans}`; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(t, x, y + 50);
    });
    ctx.fillStyle = '#fff'; ctx.font = `600 46px ${serif}`; ctx.fillText('Rutenda', 90, H - 70);
    ctx.font = `500 26px ${sans}`; ctx.globalAlpha = .85; ctx.fillText('tu viaje, paso a paso', 300, H - 74); ctx.globalAlpha = 1;
    return await new Promise(ok => c.toBlob(ok, 'image/png'));
  }

  function abrir() {
    if (anioElegido == null) {
      const conViajes = anios().find(a => viajesDe(a).length);
      anioElegido = conViajes || new Date().getFullYear();
    }
    const { el } = U.modal({ titulo: '📊 Mi año viajero', ancho: true, cuerpo: '<div class="anio"></div>' });
    const caja = el.querySelector('.anio');
    const pintar = () => {
      const d = datos(anioElegido);
      caja.innerHTML = html(d);
      caja.querySelectorAll('[data-anio]').forEach(b => b.onclick = () => { anioElegido = Number(b.dataset.anio); pintar(); });
      const bi = caja.querySelector('[data-a="anioImagen"]');
      if (bi) bi.onclick = async () => {
        bi.disabled = true; bi.textContent = 'Armando la imagen…';
        try {
          const blob = await imagen(d);
          const archivo = new File([blob], `Rutenda - Mi año viajero ${d.anio}.png`, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [archivo] })) await navigator.share({ files: [archivo], title: `Mi año viajero ${d.anio}` }).catch(() => {});
          else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = archivo.name; document.body.appendChild(a); a.click(); a.remove(); }
        } catch (e) { U.toast('No pude armar la imagen en este navegador.'); }
        bi.disabled = false; bi.textContent = '🖼️ Imagen para compartir';
      };
    };
    pintar();
  }

  return { abrir, datos, anios };
})();
