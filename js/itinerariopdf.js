/* =========================================================
   Rutenda — itinerario en PDF
   Arma un PDF prolijo (A4) con el recorrido, dónde dormís
   y el día por día. Se descarga o se comparte como archivo.
   Usa jsPDF (se carga solo cuando hace falta).
   ========================================================= */
window.R = window.R || {};

R.itinerarioPdf = (function () {
  const U = R.util;
  const C = () => R.recorrido;
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  // Paleta Rutenda
  const MAR = [31, 58, 54], MAR_OSC = [20, 40, 36], MAR_CLARO = [227, 234, 230], ORO = [176, 138, 67];
  const ARENA = [244, 237, 226], TINTA = [34, 48, 47], SUAVE = [95, 108, 106], TENUE = [142, 152, 150];
  const TERRA = [217, 130, 91], SOL_CLARO = [252, 241, 216];

  function cargar() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = JSPDF;
      s.onload = () => ok(window.jspdf.jsPDF);
      s.onerror = () => mal(new Error('No se pudo cargar el generador de PDF. Revisá la conexión.'));
      document.head.appendChild(s);
    });
  }

  /** Las fuentes del PDF no tienen emojis ni flechas: se reemplazan por texto. */
  function limpio(s) {
    return String(s == null ? '' : s)
      .replace(/→/g, '>').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...')
      .replace(/[^\x00-\xFF]/g, '').replace(/\s{2,}/g, ' ').trim();
  }
  const MEDIO_TXT = { avion: 'Avión', micro: 'Micro', auto: 'Auto', tren: 'Tren', barco: 'Barco', otro: 'Otro' };

  /** Logo de Rutenda para la portada (si no se puede leer, el PDF sale igual). */
  async function logo() {
    try {
      const r = await fetch('assets/logo-pdf.png');
      if (!r.ok) return null;
      const blob = await r.blob();
      return await new Promise(ok => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = () => ok(null); l.readAsDataURL(blob); });
    } catch (e) { return null; }
  }

  /** Arma el documento y devuelve { doc, nombre }. */
  async function generar(v) {
    const jsPDF = await cargar();
    const imgLogo = await logo();
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 16, ANCHO = W - M * 2;
    let y = 0;

    const color = (c, tipo) => { if (tipo === 'f') doc.setFillColor(...c); else if (tipo === 'd') doc.setDrawColor(...c); else doc.setTextColor(...c); };
    const fuente = (estilo, tam) => { doc.setFont('helvetica', estilo || 'normal'); doc.setFontSize(tam || 10); };
    const lineas = (txt, ancho) => doc.splitTextToSize(limpio(txt), ancho);
    function espacio(alto) {
      if (y + alto > H - 18) { doc.addPage(); y = M + 2; return true; }
      return false;
    }
    function tituloSeccion(txt) {
      espacio(16);
      y += 4;
      fuente('bold', 12.5); color(MAR_OSC);
      doc.text(limpio(txt).toUpperCase(), M, y);
      color(MAR, 'd'); doc.setLineWidth(0.6); doc.line(M, y + 2, M + 24, y + 2);
      y += 8;
    }

    // ---------- Portada ----------
    const nombre = v.nombre || (v.destinos || []).filter(d => !d.soloDia).map(d => d.nombre).join(' > ') || v.destino || 'Mi viaje';
    color(MAR, 'f'); doc.rect(0, 0, W, 54, 'F');
    color(MAR_OSC, 'f'); doc.rect(0, 50, W, 4, 'F');
    color(ORO, 'f'); doc.rect(0, 54, W, 1.2, 'F');
    if (imgLogo) { try { doc.addImage(imgLogo, 'PNG', W - M - 26, 10, 26, 26); } catch (e) { /* sin logo */ } }
    color([212, 175, 106]); fuente('bold', 9); doc.text('RUTENDA · ITINERARIO', M, 14);
    fuente('bold', 22); color([243, 237, 226]);
    const tit = lineas(nombre, ANCHO - 34);
    doc.text(tit.slice(0, 2), M, 26);
    fuente('normal', 11);
    const rango = U.fmtRango(v.fechaInicio, v.fechaFin);
    const dias = R.itinerario.diasDelViaje(v).length;
    doc.text(limpio(`${rango}${dias ? ' · ' + dias + (dias === 1 ? ' día' : ' días') : ''}`), M, tit.length > 1 ? 44 : 37);
    const viajeros = (v.participantes || []).map(id => (R.db.persona(id) || {}).nombre).filter(Boolean);
    if (viajeros.length) { fuente('normal', 9.5); doc.text(limpio('Viajan: ' + viajeros.join(', ')), M, tit.length > 1 ? 49.5 : 44); }
    y = 64;

    // ---------- Recorrido ----------
    const segs = C().todosLosSegmentos(v.recorrido);
    if (segs.length) {
      tituloSeccion('Recorrido');
      segs.forEach(x => {
        const s = x.seg;
        const det = R.cronogramaEditor.datosSegmento(v, s);
        const salida = s.sale.fecha ? `${U.fmtFecha(s.sale.fecha, 'dia')}${s.sale.hora ? ' ' + s.sale.hora : ''}` : 'Fecha a definir';
        const llega = C().fechaLlega(s) ? `${C().fechaLlega(s) !== s.sale.fecha ? U.fmtFecha(C().fechaLlega(s), 'dia') + ' ' : ''}${s.llega.hora || ''}`.trim() : '';
        const medioTxt = s.medio === 'otro' && s.medioOtro ? s.medioOtro : MEDIO_TXT[s.medio] || 'Traslado';
        const ruta = lineas(`${s.desde.nombre} > ${s.hasta.nombre}`, ANCHO - 70);
        const sub = lineas([det, s.estado === 'confirmado' ? 'Confirmado' : s.estado === 'estimado' ? 'Sin confirmar' : ''].filter(Boolean).join(' · '), ANCHO - 70);
        const alto = 7 + ruta.length * 5 + (sub.length && sub[0] ? sub.length * 4.2 : 0);
        espacio(alto + 2);
        color(ARENA, 'f'); doc.roundedRect(M, y - 4.5, ANCHO, alto, 2, 2, 'F');
        color(MAR, 'f'); doc.roundedRect(M + 3, y - 2, 20, 6, 1.5, 1.5, 'F');
        color([255, 255, 255]); fuente('bold', 7.5); doc.text(limpio(medioTxt).toUpperCase().slice(0, 12), M + 13, y + 2.2, { align: 'center' });
        color(TINTA); fuente('bold', 10.5); doc.text(ruta, M + 27, y + 1.8);
        let yy = y + 1.8 + ruta.length * 5;
        if (sub.length && sub[0]) { color(SUAVE); fuente('normal', 8.5); doc.text(sub, M + 27, yy - 0.8); }
        color(TINTA); fuente('bold', 9); doc.text(limpio('Sale ' + salida), M + ANCHO - 3, y + 1.8, { align: 'right' });
        if (llega) { color(SUAVE); fuente('normal', 8.5); doc.text(limpio('Llega ' + llega), M + ANCHO - 3, y + 6.3, { align: 'right' }); }
        y += alto + 2;
      });
    }

    // ---------- Dónde dormís ----------
    const est = C().estadias(v).filter(e => !e.dePaso);
    if (est.length) {
      tituloSeccion('Dónde dormís');
      est.forEach(e => {
        const t = v.tareas && v.tareas['a_reserva__' + e.id];
        const a = t && t.datos ? t.datos : null;
        const fechas = e.desde && e.hasta ? `${U.fmtFecha(e.desde, 'corto')} al ${U.fmtFecha(e.hasta, 'corto')} · ${e.noches} ${e.noches === 1 ? 'noche' : 'noches'}` : 'Fechas a definir';
        const detalle = a ? [a.nombre, a.direccion, a.checkinHora ? 'Check-in ' + a.checkinHora : '', a.checkoutHora ? 'Check-out ' + a.checkoutHora : '', a.codigo ? 'Reserva ' + a.codigo : '', a.contacto].filter(Boolean).join(' · ') : 'Alojamiento a reservar';
        const lin = lineas(detalle, ANCHO - 8);
        const alto = 11 + lin.length * 4.3;
        espacio(alto + 2);
        color(a ? MAR_CLARO : SOL_CLARO, 'f'); doc.roundedRect(M, y - 4.5, ANCHO, alto, 2, 2, 'F');
        color(TINTA); fuente('bold', 10.5); doc.text(limpio(e.nombre + (e.tipo === 'parada' ? ' (parada)' : '')), M + 4, y + 1.5);
        color(SUAVE); fuente('normal', 8.5); doc.text(limpio(fechas), M + ANCHO - 4, y + 1.5, { align: 'right' });
        color(a ? TINTA : [122, 90, 20]); fuente('normal', 9); doc.text(lin, M + 4, y + 6.8);
        y += alto + 2;
      });
    }

    // ---------- Día por día ----------
    const fechas = R.itinerario.diasDelViaje(v);
    if (fechas.length) {
      tituloSeccion('Día por día');
      fechas.forEach(f => {
        const d = R.itinerario.diaDe(v, f);
        const items = d.items.filter(i => i.titulo).map(i => ({ hora: i.hora || '', titulo: lineas(i.titulo, ANCHO - 30), sub: i.sub ? lineas(i.sub, ANCHO - 30) : [] }));
        const altoItems = items.reduce((a, i) => a + i.titulo.length * 4.6 + i.sub.length * 3.9 + 2.4, 0);
        const alto = 10 + (d.amaneces ? 5 : 0) + (items.length ? altoItems : 5.5) + (d.dormis ? 6 : 0);
        espacio(Math.min(alto, 60));
        // Cabecera del día
        color(MAR, 'f'); doc.roundedRect(M, y - 4.5, ANCHO, 8, 1.5, 1.5, 'F');
        color([255, 255, 255]); fuente('bold', 10);
        doc.text(limpio(`Día ${d.numero}${d.lugarNombre ? ' · ' + d.lugarNombre : ''}`), M + 3, y + 0.9);
        fuente('normal', 8.5);
        const fechaTxt = U.fmtFecha(f, 'largo');
        doc.text(limpio(fechaTxt.charAt(0).toUpperCase() + fechaTxt.slice(1)), M + ANCHO - 3, y + 0.9, { align: 'right' });
        y += 8.5;
        if (d.amaneces) { color(SUAVE); fuente('italic', 8.5); doc.text(limpio(d.amaneces), M + 3, y); y += 5; }
        if (!items.length) { color(TENUE); fuente('normal', 9); doc.text('Día libre.', M + 3, y); y += 5.5; }
        items.forEach(i => {
          const altoI = i.titulo.length * 4.6 + i.sub.length * 3.9 + 2.4;
          if (espacio(altoI)) { color(TENUE); fuente('italic', 8); doc.text(limpio(`Día ${d.numero} (sigue)`), M, y); y += 5; }
          color(TERRA); fuente('bold', 9.5); doc.text(i.hora || '-', M + 3, y);
          color(TINTA); fuente('bold', 9.5); doc.text(i.titulo, M + 22, y);
          let yy = y + i.titulo.length * 4.6;
          if (i.sub.length) { color(SUAVE); fuente('normal', 8.3); doc.text(i.sub, M + 22, yy - 0.6); yy += i.sub.length * 3.9; }
          y = yy + 1.6;
        });
        if (d.dormis) {
          espacio(6);
          color(SUAVE); fuente('normal', 8.5);
          doc.text(limpio(`Dormís: ${d.dormis.texto}${d.dormis.direccion ? ' · ' + d.dormis.direccion : ''}`).slice(0, 120), M + 3, y + 0.5);
          y += 6;
        }
        y += 3;
      });
    }

    // ---------- Pie de página ----------
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      color(TENUE); fuente('normal', 7.5);
      doc.text(limpio(`${nombre} · Armado con Rutenda`), M, H - 8);
      doc.text(`${p} / ${total}`, W - M, H - 8, { align: 'right' });
    }
    const archivo = 'Itinerario ' + limpio(nombre).replace(/[\\/:*?"<>|>]+/g, '-').slice(0, 60) + '.pdf';
    return { doc, nombre: archivo };
  }

  /** Descarga el PDF (y en el celular ofrece compartirlo). */
  async function descargar(v, opciones) {
    const op = opciones || {};
    U.toast('Armando el PDF…');
    try {
      const { doc, nombre } = await generar(v);
      const blob = doc.output('blob');
      const archivo = typeof File === 'function' ? new File([blob], nombre, { type: 'application/pdf' }) : null;
      if (op.compartir && archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
        try { await navigator.share({ files: [archivo], title: nombre }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 20000);
      U.toast('PDF descargado. 📄');
    } catch (e) {
      console.error(e);
      U.toast(e.message || 'No se pudo armar el PDF.');
    }
  }

  return { generar, descargar, limpio };
})();
