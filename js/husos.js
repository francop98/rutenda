/* =========================================================
   Rutenda — Husos horarios
   Para los vuelos que cruzan husos: "llega 14:00 (en Bahía Blanca
   son las 10:00) · 12 h de vuelo". Sin servicios externos: el huso
   sale del país del lugar (y, en países con varios husos, de la
   ciudad de referencia más cercana).
   ========================================================= */
window.R = window.R || {};

R.husos = (function () {
  // Países con un solo huso
  const UNO = {
    AR: 'America/Argentina/Buenos_Aires', UY: 'America/Montevideo', PY: 'America/Asuncion', BO: 'America/La_Paz', PE: 'America/Lima',
    CO: 'America/Bogota', VE: 'America/Caracas', CU: 'America/Havana', DO: 'America/Santo_Domingo', PR: 'America/Puerto_Rico',
    PA: 'America/Panama', CR: 'America/Costa_Rica', GT: 'America/Guatemala', SV: 'America/El_Salvador', HN: 'America/Tegucigalpa',
    NI: 'America/Managua', JM: 'America/Jamaica', BS: 'America/Nassau', AW: 'America/Aruba', CW: 'America/Curacao', BB: 'America/Barbados',
    HT: 'America/Port-au-Prince', TT: 'America/Port_of_Spain', BZ: 'America/Belize', GY: 'America/Guyana', SR: 'America/Paramaribo',
    FR: 'Europe/Paris', IT: 'Europe/Rome', DE: 'Europe/Berlin', GB: 'Europe/London', IE: 'Europe/Dublin', NL: 'Europe/Amsterdam',
    BE: 'Europe/Brussels', CH: 'Europe/Zurich', AT: 'Europe/Vienna', GR: 'Europe/Athens', TR: 'Europe/Istanbul', CZ: 'Europe/Prague',
    HU: 'Europe/Budapest', PL: 'Europe/Warsaw', HR: 'Europe/Zagreb', DK: 'Europe/Copenhagen', SE: 'Europe/Stockholm', NO: 'Europe/Oslo',
    FI: 'Europe/Helsinki', IS: 'Atlantic/Reykjavik', LU: 'Europe/Luxembourg', MC: 'Europe/Monaco', MT: 'Europe/Malta', SI: 'Europe/Ljubljana',
    SK: 'Europe/Bratislava', RO: 'Europe/Bucharest', BG: 'Europe/Sofia', RS: 'Europe/Belgrade', ME: 'Europe/Podgorica', AL: 'Europe/Tirane',
    BA: 'Europe/Sarajevo', MK: 'Europe/Skopje', EE: 'Europe/Tallinn', LV: 'Europe/Riga', LT: 'Europe/Vilnius', UA: 'Europe/Kyiv', CY: 'Asia/Nicosia',
    MA: 'Africa/Casablanca', EG: 'Africa/Cairo', TN: 'Africa/Tunis', ZA: 'Africa/Johannesburg', KE: 'Africa/Nairobi', TZ: 'Africa/Dar_es_Salaam',
    AE: 'Asia/Dubai', QA: 'Asia/Qatar', IL: 'Asia/Jerusalem', JO: 'Asia/Amman', SA: 'Asia/Riyadh', IN: 'Asia/Kolkata', LK: 'Asia/Colombo',
    MV: 'Indian/Maldives', NP: 'Asia/Kathmandu', TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh', KH: 'Asia/Phnom_Penh', LA: 'Asia/Vientiane',
    SG: 'Asia/Singapore', MY: 'Asia/Kuala_Lumpur', PH: 'Asia/Manila', JP: 'Asia/Tokyo', KR: 'Asia/Seoul', CN: 'Asia/Shanghai', HK: 'Asia/Hong_Kong',
    TW: 'Asia/Taipei', NZ: 'Pacific/Auckland', FJ: 'Pacific/Fiji', PF: 'Pacific/Tahiti', MU: 'Indian/Mauritius'
  };
  // Países con varios husos: ciudad de referencia de cada uno (se elige la más cercana)
  const VARIOS = {
    US: [['America/New_York', 40.7, -74], ['America/Chicago', 41.9, -87.6], ['America/Denver', 39.7, -105], ['America/Phoenix', 33.4, -112],
      ['America/Los_Angeles', 34, -118.2], ['America/Los_Angeles', 47.6, -122.3], ['America/Anchorage', 61.2, -149.9], ['Pacific/Honolulu', 21.3, -157.8],
      ['America/New_York', 25.8, -80.2], ['America/Chicago', 29.8, -95.4], ['America/Denver', 40.8, -111.9], ['America/Los_Angeles', 36.2, -115.1]],
    BR: [['America/Sao_Paulo', -23.5, -46.6], ['America/Sao_Paulo', -22.9, -43.2], ['America/Sao_Paulo', -3.7, -38.5], ['America/Sao_Paulo', -1.5, -48.5],
      ['America/Sao_Paulo', -27.6, -48.5], ['America/Sao_Paulo', -12.97, -38.5], ['America/Manaus', -3.1, -60], ['America/Cuiaba', -15.6, -56.1],
      ['America/Campo_Grande', -20.5, -54.6], ['America/Porto_Velho', -8.76, -63.9], ['America/Rio_Branco', -9.97, -67.8], ['America/Noronha', -3.85, -32.4]],
    MX: [['America/Mexico_City', 19.4, -99.1], ['America/Mexico_City', 20.7, -103.3], ['America/Cancun', 21.1, -86.8], ['America/Merida', 21, -89.6],
      ['America/Hermosillo', 29.1, -110.9], ['America/Tijuana', 32.5, -117], ['America/Mazatlan', 23.2, -106.4], ['America/Mazatlan', 23, -109.7],
      ['America/Chihuahua', 28.6, -106.1], ['America/Monterrey', 25.7, -100.3]],
    CA: [['America/Toronto', 43.7, -79.4], ['America/Toronto', 45.5, -73.6], ['America/Vancouver', 49.3, -123.1], ['America/Edmonton', 51, -114.1],
      ['America/Winnipeg', 49.9, -97.1], ['America/Regina', 50.4, -104.6], ['America/Halifax', 44.6, -63.6], ['America/St_Johns', 47.6, -52.7]],
    CL: [['America/Santiago', -33.4, -70.6], ['America/Santiago', -41.5, -72.9], ['America/Santiago', -23.6, -70.4], ['America/Punta_Arenas', -53.2, -70.9],
      ['Pacific/Easter', -27.1, -109.4]],
    EC: [['America/Guayaquil', -2.2, -79.9], ['America/Guayaquil', -0.2, -78.5], ['Pacific/Galapagos', -0.9, -89.6]],
    ES: [['Europe/Madrid', 40.4, -3.7], ['Europe/Madrid', 41.4, 2.2], ['Europe/Madrid', 37.4, -6], ['Atlantic/Canary', 28.1, -15.4], ['Atlantic/Canary', 28.5, -16.3]],
    PT: [['Europe/Lisbon', 38.7, -9.1], ['Europe/Lisbon', 41.1, -8.6], ['Europe/Lisbon', 32.65, -16.9], ['Atlantic/Azores', 37.7, -25.7]],
    AU: [['Australia/Sydney', -33.9, 151.2], ['Australia/Melbourne', -37.8, 145], ['Australia/Brisbane', -27.5, 153], ['Australia/Adelaide', -34.9, 138.6],
      ['Australia/Darwin', -12.5, 130.8], ['Australia/Perth', -31.95, 115.9], ['Australia/Hobart', -42.9, 147.3]],
    RU: [['Europe/Moscow', 55.8, 37.6], ['Europe/Moscow', 59.9, 30.3], ['Asia/Yekaterinburg', 56.8, 60.6], ['Asia/Novosibirsk', 55, 82.9], ['Asia/Vladivostok', 43.1, 131.9]],
    ID: [['Asia/Jakarta', -6.2, 106.8], ['Asia/Makassar', -8.65, 115.2], ['Asia/Jayapura', -2.5, 140.7]]
  };

  /** El huso de un lugar { lat, lon, pais | codigoPais }. '' si no se sabe. */
  function zona(l) {
    if (!l) return '';
    const pais = String(l.pais || l.codigoPais || '').toUpperCase();
    if (UNO[pais]) return UNO[pais];
    const op = VARIOS[pais];
    if (!op) return '';
    if (l.lat == null || l.lon == null) return op[0][0];
    let mejor = op[0], dmin = Infinity;
    op.forEach(o => { const d = (o[1] - l.lat) ** 2 + ((o[2] - l.lon) * Math.cos(l.lat * Math.PI / 180)) ** 2; if (d < dmin) { dmin = d; mejor = o; } });
    return mejor[0];
  }

  /** Diferencia con UTC en minutos, ese día y a esa hora (hora local). */
  function desfase(tz, fecha, hora) {
    if (!tz || !fecha) return null;
    try {
      const d = new Date(`${fecha}T${hora || '12:00'}:00Z`);
      const p = {};
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(d).forEach(x => { p[x.type] = x.value; });
      const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
      // Se corrige una vez para tomar la hora local (no la UTC) como referencia
      const off = Math.round((local - d.getTime()) / 60000);
      return off;
    } catch (e) { return null; }
  }

  /** Dónde está cada punta de un traslado (por el aeropuerto o por el lugar del viaje). */
  function lugarDe(v, iata, nombre) {
    const a = iata && R.aeropuertos ? R.aeropuertos.porCodigo(iata) : null;
    if (a) return { lat: a.lat, lon: a.lon, pais: a.pais, nombre: a.ciudad };
    const l = v && R.agenda ? R.agenda.lugarConocido(v, nombre) : null;
    return l ? Object.assign({ pais: l.codigoPais || l.pais }, l) : null;
  }

  const hhmm = m => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  const aMin = h => { const m = /^(\d{1,2}):(\d{2})/.exec(h || ''); return m ? +m[1] * 60 + +m[2] : null; };

  /** Para un traslado: { cambia, diferencia (min), horaOrigen (la de llegada en el huso de salida), duracion (min) } o null. */
  function delTraslado(v, it) {
    if (!it || !it.fecha) return null;
    const o = lugarDe(v, it.aeroDesde, it.desde), d = lugarDe(v, it.aeroHasta, it.hasta);
    const zo = zona(o), zd = zona(d);
    if (!zo || !zd) return null;
    const fl = it.fechaLlegada || it.fecha;
    const offO = desfase(zo, it.fecha, it.hora), offD = desfase(zd, fl, it.horaLlegada || it.hora);
    if (offO == null || offD == null) return null;
    const r = { cambia: offO !== offD, diferencia: offD - offO, desde: it.desde || (o && o.nombre) || '', hasta: it.hasta || (d && d.nombre) || '' };
    const hs = aMin(it.hora), hl = aMin(it.horaLlegada);
    if (hl != null) r.horaOrigen = hhmm(hl - r.diferencia);
    if (hs != null && hl != null) {
      const dias = Math.round((Date.parse(fl) - Date.parse(it.fecha)) / 864e5);
      const dur = (dias * 1440 + hl - offD) - (hs - offO);
      if (dur > 0 && dur < 48 * 60) r.duracion = dur;
    }
    return r;
  }

  const fmtDuracion = m => { const h = Math.floor(m / 60), mm = m % 60; return h ? `${h} h${mm ? ' ' + mm + ' min' : ''}` : `${mm} min`; };

  return { zona, desfase, delTraslado, fmtDuracion };
})();
