/* =========================================================
   Rutenda — resumen del viaje para compartir
   Arma una imagen (1080×1350) con lo que fue el viaje:
   días, lugares, kilómetros, traslados, gasto y tus notas.
   Se dibuja en el celular (canvas), sin servicios externos.
   ========================================================= */
window.R = window.R || {};

R.resumen = (function () {
  const U = R.util;
  const { esc } = U;

  /** Distancia en km entre dos puntos (fórmula del haversine). */
  function km(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 0;
    const rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  function datos(v) {
    const segs = R.recorrido.todosLosSegmentos(v.recorrido || []).map(x => x.seg);
    const kms = Math.round(segs.reduce((a, s) => a + km(s.desde, s.hasta), 0));
    const dias = v.fechaInicio && v.fechaFin ? U.diasEntre(v.fechaInicio, v.fechaFin) + 1 : 0;
    const lugares = (v.destinos || []).filter(d => d.nombre).map(d => d.nombre);
    const medios = {};
    segs.forEach(s => { medios[s.medio] = (medios[s.medio] || 0) + 1; });
    const t = R.gastos.totales(v);
    const personas = (v.participantes || []).length || 1;
    const paises = Array.from(new Set((v.destinos || []).map(d => d.pais).filter(Boolean)));
    return {
      nombre: v.nombre || lugares.filter((x, i) => !(v.destinos[i] || {}).soloDia).join(' → ') || v.destino || 'Mi viaje',
      fechas: U.fmtRango(v.fechaInicio, v.fechaFin), dias, kms, lugares, paises, medios, traslados: segs.length,
      gasto: t.neto, porPersona: personas > 1 ? t.neto / personas : 0, moneda: v.monedaBase, personas,
      notas: (v.notasViaje || '').trim()
    };
  }

  function colores(v) {
    const g = R.paisaje.fondo(v);
    const hex = g.match(/#[0-9a-fA-F]{6}/g) || ['#1F3A36', '#9cc9b9'];
    return [hex[0], hex[1] || hex[0]];
  }

  function envolver(ctx, texto, x, y, ancho, alto, max) {
    const palabras = String(texto).split(/\s+/);
    let linea = '', n = 0;
    for (const p of palabras) {
      const prueba = linea ? linea + ' ' + p : p;
      if (ctx.measureText(prueba).width > ancho && linea) {
        ctx.fillText(linea, x, y + n * alto);
        linea = p; n++;
        if (n >= max - 1) {
          let resto = palabras.slice(palabras.indexOf(p)).join(' ');
          while (ctx.measureText(resto + '…').width > ancho && resto.length) resto = resto.slice(0, -1);
          ctx.fillText(resto + (resto.length < palabras.slice(palabras.indexOf(p)).join(' ').length ? '…' : ''), x, y + n * alto);
          return n + 1;
        }
      } else linea = prueba;
    }
    if (linea) { ctx.fillText(linea, x, y + n * alto); n++; }
    return n;
  }

  /** Dibuja la tarjeta y devuelve un Blob PNG. */
  async function imagen(v) {
    const d = datos(v);
    const W = 1080, H = 1350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    try { await document.fonts.ready; } catch (e) { /* sin fuentes web */ }
    const [a, b] = colores(v);
    const fondo = ctx.createLinearGradient(0, 0, W, H);
    fondo.addColorStop(0, a); fondo.addColorStop(1, b);
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H);
    // Montañas y sol, suaves
    ctx.fillStyle = 'rgba(255,236,190,.45)';
    ctx.beginPath(); ctx.arc(860, 300, 110, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.beginPath(); ctx.moveTo(0, 520); [[160, 380], [300, 470], [470, 330], [640, 480], [820, 360], [1080, 470]].forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(1080, 640); ctx.lineTo(0, 640); ctx.fill();
    // Ruta punteada dorada
    ctx.strokeStyle = 'rgba(212,175,106,.9)'; ctx.lineWidth = 6; ctx.setLineDash([2, 18]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(90, 600); ctx.bezierCurveTo(360, 480, 640, 640, 990, 520); ctx.stroke(); ctx.setLineDash([]);

    ctx.fillStyle = '#fff';
    const serif = '"Cormorant Garamond", Georgia, serif', sans = '"DM Sans", system-ui, sans-serif';
    ctx.font = `600 34px ${sans}`;
    ctx.globalAlpha = .85; ctx.fillText('MI VIAJE', 90, 140); ctx.globalAlpha = 1;
    ctx.font = `600 92px ${serif}`;
    const lineasTitulo = envolver(ctx, d.nombre, 90, 240, 900, 96, 2);
    ctx.font = `500 38px ${sans}`;
    ctx.globalAlpha = .92; ctx.fillText(d.fechas, 90, 240 + lineasTitulo * 96 + 10); ctx.globalAlpha = 1;

    // Tarjeta de datos
    const y0 = 690;
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(60, y0, W - 120, H - y0 - 150, 40); ctx.fill(); } else ctx.fillRect(60, y0, W - 120, H - y0 - 150);
    const cifras = [
      [d.dias ? String(d.dias) : '—', d.dias === 1 ? 'día' : 'días'],
      [String(d.lugares.length), d.lugares.length === 1 ? 'lugar' : 'lugares'],
      [d.kms ? d.kms.toLocaleString('es-AR') : '—', 'km recorridos']
    ];
    ctx.fillStyle = '#1F3A36';
    cifras.forEach(([num, txt], i) => {
      const x = 110 + i * 310;
      ctx.font = `600 84px ${serif}`; ctx.fillText(num, x, y0 + 130);
      ctx.font = `500 30px ${sans}`; ctx.fillStyle = '#5b6b68'; ctx.fillText(txt, x, y0 + 175); ctx.fillStyle = '#1F3A36';
    });
    ctx.fillStyle = 'rgba(31,58,54,.12)'; ctx.fillRect(110, y0 + 215, W - 220, 2);
    ctx.fillStyle = '#22302f';
    ctx.font = `500 34px ${sans}`;
    let y = y0 + 280;
    const iconos = { avion: '✈️', micro: '🚌', auto: '🚗', tren: '🚆', barco: '⛴️', otro: '🧭' };
    const medios = Object.entries(d.medios).map(([m, n]) => `${iconos[m] || '🧭'} ${n}`).join('   ');
    y += 50 * envolver(ctx, `📍 ${d.lugares.join(' · ')}`, 110, y, W - 220, 46, 2);
    if (medios) { ctx.fillText(`${medios}  ·  ${U.plural(d.traslados, 'traslado', 'traslados')}`, 110, y); y += 56; }
    if (d.gasto > 0) {
      ctx.fillText(`💸 ${U.fmtMoneda(d.gasto, d.moneda)}${d.porPersona ? ` · ${U.fmtMoneda(d.porPersona, d.moneda)} por persona` : ''}`, 110, y); y += 56;
    }
    if (d.notas) {
      ctx.font = `italic 500 32px ${serif.replace('600 ', '')}`; ctx.fillStyle = '#5b6b68';
      envolver(ctx, `“${d.notas}”`, 110, y + 6, W - 220, 42, 3);
    }
    // Marca
    ctx.fillStyle = '#fff';
    ctx.font = `600 46px ${serif}`;
    ctx.fillText('Rutenda', 90, H - 70);
    ctx.font = `500 26px ${sans}`; ctx.globalAlpha = .85;
    ctx.fillText('tu viaje, paso a paso', 300, H - 74); ctx.globalAlpha = 1;
    return await new Promise(ok => c.toBlob(ok, 'image/png'));
  }

  async function abrir(v) {
    const { el } = U.modal({
      titulo: 'Resumen del viaje',
      subtitulo: 'Una imagen para guardar o compartir.',
      cuerpo: '<div class="resumen-vista"><p class="texto-suave">Armando la imagen…</p></div>',
      acciones: [{ texto: 'Cerrar' }]
    });
    const caja = el.querySelector('.resumen-vista');
    try {
      const blob = await imagen(v);
      const url = URL.createObjectURL(blob);
      const nombre = `Rutenda - ${datos(v).nombre}.png`.replace(/[\\/:*?"<>|]/g, '');
      const archivo = new File([blob], nombre, { type: 'image/png' });
      const puedeCompartir = navigator.canShare && navigator.canShare({ files: [archivo] });
      caja.innerHTML = `
        <img src="${url}" alt="Resumen del viaje" class="resumen-img">
        <div class="acciones-fila resumen-acciones">
          ${puedeCompartir ? '<button type="button" class="btn btn-primario" data-a="compartir">↗ Compartir</button>' : ''}
          <a class="btn ${puedeCompartir ? 'btn-suave' : 'btn-primario'}" href="${url}" download="${esc(nombre)}">⬇ Descargar</a>
        </div>`;
      const b = caja.querySelector('[data-a="compartir"]');
      if (b) b.onclick = () => navigator.share({ files: [archivo], title: datos(v).nombre }).catch(() => {});
    } catch (e) {
      caja.innerHTML = '<p class="texto-suave">No pude armar la imagen en este navegador.</p>';
    }
  }

  return { datos, imagen, abrir, km };
})();
