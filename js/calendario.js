/* =========================================================
   Rutenda — Pasar el viaje al calendario del celular
   Arma un archivo .ics (el formato que abren Google Calendar,
   el calendario de iPhone y Outlook) con los traslados, las
   actividades con día y los alojamientos.
   ========================================================= */
window.R = window.R || {};

R.calendario = (function () {
  const U = R.util;
  const A = () => R.agenda;

  const texto = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fechaICS = f => f.replace(/-/g, '');
  const horaICS = h => (h || '00:00').replace(':', '') + '00';
  /** Las líneas largas se cortan a 75 caracteres (lo pide el formato). */
  const plegar = l => { const r = []; while (l.length > 74) { r.push(l.slice(0, 74)); l = ' ' + l.slice(74); } r.push(l); return r.join('\r\n'); };
  const sumarMin = (f, h, min) => {
    const [hh, mm] = h.split(':').map(Number);
    let t = hh * 60 + mm + min, fecha = f;
    while (t >= 1440) { t -= 1440; fecha = U.sumarDias(fecha, 1); }
    return [fecha, `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`];
  };

  function eventos(v) {
    const r = [];
    A().items(v).filter(it => it.fecha).forEach(it => {
      const t = A().tipo(it.tipo);
      const titulo = t.traslado
        ? `${t.icono} ${t.nombre}${it.desde || it.hasta ? ` ${it.desde || ''} → ${it.hasta || ''}` : ''}${it.numero ? ` (${it.numero})` : ''}`
        : `${t.icono} ${it.titulo || t.nombre}`;
      const desc = [it.empresa, it.codigo ? 'Código de reserva: ' + it.codigo : '', it.nota].filter(Boolean).join('\n');
      const lugar = t.traslado ? (it.aeroDesde ? `Aeropuerto ${it.aeroDesde}` : it.desde) : it.lugar;
      let ini, fin, todoElDia = !it.hora;
      if (!todoElDia) {
        ini = [it.fecha, it.hora];
        if (it.horaLlegada) fin = [it.fechaLlegada || it.fecha, it.horaLlegada];
        else fin = sumarMin(it.fecha, it.hora, Number(it.duracion) || 60);
        if (fin[0] + fin[1] <= ini[0] + ini[1]) fin = sumarMin(it.fecha, it.hora, 60);
      }
      r.push({ uid: it.id, titulo, desc, lugar, ini, fin, todoElDia, fecha: it.fecha, hasta: U.sumarDias(it.fechaLlegada || it.fecha, 1) });
    });
    (v.alojamientos || []).filter(a => a.desde && a.hasta).forEach(a => {
      r.push({
        uid: a.id, titulo: `🛏️ ${A().nombreAlojamiento(a)}`, lugar: a.direccion || a.ciudad || '',
        desc: [a.checkin ? 'Check-in: ' + a.checkin : '', a.checkout ? 'Check-out: ' + a.checkout : '', a.codigo ? 'Código de reserva: ' + a.codigo : '', a.nota].filter(Boolean).join('\n'),
        todoElDia: true, fecha: a.desde, hasta: a.hasta
      });
    });
    return r;
  }

  function ics(v) {
    const ahora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rutenda//Viajes//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${texto(R.viajes.nombreDe(v))}`];
    eventos(v).forEach(e => {
      l.push('BEGIN:VEVENT', `UID:${e.uid}-${v.id}@rutenda`, `DTSTAMP:${ahora}`);
      if (e.todoElDia) l.push(`DTSTART;VALUE=DATE:${fechaICS(e.fecha)}`, `DTEND;VALUE=DATE:${fechaICS(e.hasta)}`);
      else l.push(`DTSTART:${fechaICS(e.ini[0])}T${horaICS(e.ini[1])}`, `DTEND:${fechaICS(e.fin[0])}T${horaICS(e.fin[1])}`);
      l.push(`SUMMARY:${texto(e.titulo)}`);
      if (e.lugar) l.push(`LOCATION:${texto(e.lugar)}`);
      if (e.desc) l.push(`DESCRIPTION:${texto(e.desc)}`);
      l.push('END:VEVENT');
    });
    l.push('END:VCALENDAR');
    return l.map(plegar).join('\r\n') + '\r\n';
  }

  function descargar(v) {
    const n = eventos(v).length;
    if (!n) { U.toast('Todavía no hay nada con día para pasar al calendario.'); return; }
    const nombre = (R.viajes.nombreDe(v) || 'viaje').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'viaje';
    const url = URL.createObjectURL(new Blob([ics(v)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `rutenda-${nombre}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    U.modal({
      titulo: '📅 Calendario',
      cuerpo: `<p>Se descargó un archivo con ${U.plural(n, 'evento', 'eventos')}.</p>
        <p class="texto-suave">Abrilo y elegí "Agregar todos". En Android, si no se abre solo, buscalo en Descargas y abrilo con Google Calendar.</p>`,
      acciones: [{ texto: 'Listo', clase: 'btn-primario' }]
    });
  }

  return { ics, descargar, eventos };
})();
