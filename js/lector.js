/* =========================================================
   Rutenda — leer reservas SIN IA (con reglas)
   Del texto de un mail o un PDF saca lo típico de una reserva:
   código, número de vuelo, aeropuertos, fechas, horas,
   check-in / check-out, empresa y monto. Devuelve los datos con
   la misma forma que usa el resto de la app, así se completan
   los formularios igual que siempre. No consulta a nadie: todo
   pasa en el celular (y también se usa en el servidor del mail).
   ========================================================= */
(function (raiz) {
  const MESES = { ene: 1, enero: 1, jan: 1, january: 1, feb: 2, febrero: 2, february: 2, mar: 3, marzo: 3, march: 3, abr: 4, abril: 4, apr: 4, april: 4,
    may: 5, mayo: 5, jun: 6, junio: 6, june: 6, jul: 7, julio: 7, july: 7, ago: 8, agosto: 8, aug: 8, august: 8, sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9, september: 9,
    oct: 10, octubre: 10, october: 10, nov: 11, noviembre: 11, november: 11, dic: 12, diciembre: 12, dec: 12, december: 12 };

  /** Aerolíneas por código (las más usadas desde Argentina). */
  const AEROLINEAS = {
    AR: 'Aerolíneas Argentinas', FO: 'Flybondi', WJ: 'JetSMART', JA: 'JetSMART', LA: 'LATAM', JJ: 'LATAM Brasil', LP: 'LATAM Perú', XL: 'LATAM Ecuador', '4C': 'LATAM Colombia',
    H2: 'Sky Airline', G3: 'Gol', AD: 'Azul', CM: 'Copa Airlines', AV: 'Avianca', ZP: 'Paranair', OB: 'BoA', OY: 'Andes', '2Z': 'Voepass', DM: 'Arajet',
    IB: 'Iberia', UX: 'Air Europa', I2: 'Iberia Express', V7: 'Volotea', VY: 'Vueling', FR: 'Ryanair', U2: 'easyJet', TP: 'TAP Air Portugal', AF: 'Air France', KL: 'KLM',
    LH: 'Lufthansa', LX: 'Swiss', BA: 'British Airways', AZ: 'ITA Airways', TK: 'Turkish Airlines', EK: 'Emirates', QR: 'Qatar Airways', ET: 'Ethiopian',
    AA: 'American Airlines', UA: 'United', DL: 'Delta', AM: 'Aeroméxico', AC: 'Air Canada', B6: 'JetBlue', NK: 'Spirit', Y4: 'Volaris', VB: 'Viva Aerobus'
  };
  const EMPRESAS_MICRO = /(andesmar|via bariloche|v[ií]a tac|flecha bus|chevallier|plusmar|el r[aá]pido|cata internacional|crucero del norte|rutamar|jetmar|condor estrella|la estrella|urquiza|tienda le[oó]n|plataforma ?10|central de pasajes|busbud|flixbus|turbus|cruz del sur|pullman)/i;
  const RENTADORAS = /(hertz|avis|budget|localiza|europcar|sixt|enterprise|alamo|national|dollar|thrifty|rentalcars|mondial)/i;
  const SEGUROS = /(assist ?card|universal assistance|travel ace|coris|intermac|card ?assist|axa|allianz|mapfre|sancor|asistencia al viajero|seguro de viaje)/i;
  const ALOJAMIENTO = /(booking\.com|airbnb|hotels\.com|expedia|despegar|almundo|check[- ]?in|check[- ]?out|hu[eé]sped|habitaci[oó]n|noche[s]?\b|estad[ií]a|alojamiento)/i;
  const PALABRAS_NO_IATA = new Set(['THE', 'AND', 'USD', 'ARS', 'EUR', 'BRL', 'CLP', 'UYU', 'DNI', 'CUIT', 'IVA', 'NRO', 'TEL', 'MAX', 'MIN', 'PDF', 'WEB', 'APP', 'VIA', 'DEL', 'LAS', 'LOS', 'POR', 'PAX', 'ADT', 'CHD', 'INF', 'TOT', 'SUB', 'OFF', 'YES', 'NOT', 'FOR', 'ALL', 'ONE', 'HTTP', 'COM', 'ORG', 'HOY', 'DIA', 'SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'LUN', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM', 'SIN', 'CON', 'LOS', 'DEL', 'MAR', 'POR', 'PAR', 'VER', 'SUR', 'NOR', 'UNA', 'UNO', 'QUE', 'MAS', 'EST', 'GMT', 'UTC', 'ART', 'KG', 'TAX', 'FEE', 'VAT', 'PNR', 'REF', 'COD', 'NUM', 'PAG', 'ADI', 'BOL', 'CAT', 'SEG']);

  const dos = n => String(n).padStart(2, '0');
  const iso = (a, m, d) => (a && m && d && m >= 1 && m <= 12 && d >= 1 && d <= 31) ? `${a}-${dos(m)}-${dos(d)}` : '';

  /** Todas las fechas del texto, en orden, como { fecha: 'AAAA-MM-DD', pos }. */
  function fechas(t, anioRef) {
    const r = [];
    const hoyA = anioRef || new Date().getFullYear();
    const anio = a => { a = Number(a); return a < 100 ? 2000 + a : a; };
    const poner = (pos, f) => { if (f) r.push({ pos, fecha: f }); };
    let m;
    const re1 = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/g;           // 06/12/2026
    while ((m = re1.exec(t))) poner(m.index, iso(anio(m[3]), Number(m[2]), Number(m[1])));
    const re2 = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;                           // 2026-12-06
    while ((m = re2.exec(t))) poner(m.index, iso(m[1], Number(m[2]), Number(m[3])));
    const re3 = /\b(\d{1,2})(?:\s+de)?\s+([a-záéíóú]{3,10})\.?(?:\s+de)?(?:\s+(\d{4}))?\b/gi;   // 6 de diciembre de 2026 / 6 dic
    while ((m = re3.exec(t))) { const mes = MESES[m[2].toLowerCase()]; if (mes) poner(m.index, iso(m[3] ? Number(m[3]) : hoyA, mes, Number(m[1]))); }
    const re4 = /\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;            // Dec 6, 2026
    while ((m = re4.exec(t))) { const mes = MESES[m[1].toLowerCase()]; if (mes) poner(m.index, iso(Number(m[3]), mes, Number(m[2]))); }
    const re5 = /\b(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})?\b/g;   // 06DEC(26) de los pasajes
    while ((m = re5.exec(t))) poner(m.index, iso(m[3] ? 2000 + Number(m[3]) : hoyA, MESES[m[2].toLowerCase()], Number(m[1])));
    // Sin repetir la misma fecha en el mismo lugar
    return r.sort((a, b) => a.pos - b.pos).filter((x, i, a) => i === 0 || x.pos !== a[i - 1].pos);
  }

  function horas(t) {
    const r = [];
    const re = /\b([01]?\d|2[0-3])[:.h]([0-5]\d)\s*(hs?|am|pm)?\b/gi;
    let m;
    while ((m = re.exec(t))) {
      let h = Number(m[1]);
      const suf = (m[3] || '').toLowerCase();
      if (suf === 'pm' && h < 12) h += 12;
      if (suf === 'am' && h === 12) h = 0;
      r.push({ pos: m.index, hora: `${dos(h)}:${m[2]}` });
    }
    // E-tickets: "0715 0845" (salida y llegada sin dos puntos)
    const re2 = /\b([01]\d|2[0-3])([0-5]\d)\s+([01]\d|2[0-3])([0-5]\d)\b/g;
    while ((m = re2.exec(t))) { r.push({ pos: m.index, hora: `${m[1]}:${m[2]}` }); r.push({ pos: m.index + 5, hora: `${m[3]}:${m[4]}` }); }
    return r.sort((a, b) => a.pos - b.pos);
  }

  function codigoReserva(t) {
    const re = /(c[oó]digo(?:\s+de)?\s+(?:reserva|confirmaci[oó]n|localizador)|localizador|n[uú]mero\s+de\s+(?:reserva|confirmaci[oó]n)|nro\.?\s*de\s*reserva|reserva\s*(?:n[°º.]|nro\.?|#)|booking\s+(?:reference|code|number|id)|confirmation\s+(?:code|number)|reservation\s+(?:code|number)|record\s+locator|pnr|file|voucher\s*(?:n[°º.]|nro\.?|#)?|n[°º]\s*de\s*p[oó]liza|p[oó]liza\s*(?:n[°º.]|nro\.?)?|c[oó]digo(?!\s+postal))\s*[:#]?\s*([A-Z0-9](?:[A-Z0-9-]|\.(?=\d)){3,20})/i;
    const m = re.exec(t);
    if (m && /\d|[A-Z]{5,}/.test(m[2]) && !/^(de|del|para)$/i.test(m[2]) && (m[2].length >= 5 || (/\d/.test(m[2]) && /[A-Z]/i.test(m[2])))) return m[2].toUpperCase();
    return '';
  }

  /** Vuelos: "AR 1672", "AR1672", "FO5120". */
  function vuelos(t) {
    const r = [];
    const re = /\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?-?\s?(\d{2,4})\b/g;
    let m;
    while ((m = re.exec(t))) if (AEROLINEAS[m[1]]) r.push({ pos: m.index, numero: m[1] + m[2], codigo: m[1], empresa: AEROLINEAS[m[1]] });
    return r;
  }

  /** Códigos de aeropuerto (si hay base, se validan con ella). */
  function aeropuertos(t, esAeropuerto) {
    const r = [];
    const re = /\b([A-Z]{3})\b/g;
    let m;
    while ((m = re.exec(t))) {
      const c = m[1];
      if (PALABRAS_NO_IATA.has(c)) continue;
      if (esAeropuerto && !esAeropuerto(c)) continue;
      // Tiene que "parecer" un aeropuerto: entre paréntesis, con flecha o guion, al lado de otro código o después de "aeropuerto"
      const antes = t.slice(Math.max(0, m.index - 45), m.index), despues = t.slice(m.index + 3, m.index + 16);
      const contexto = /[(\[]\s*$/.test(antes) || /^\s*[)\]]/.test(despues) || /(→|->|–|-|\/|>)\s*$/.test(antes.slice(-4)) || /^\s*(→|->|–|-|\/|>)/.test(despues)
        || /aeropuerto|airport|desde|hasta|origen|destino|from|to\s*$/i.test(antes) || /^\s+[A-Z]{3}\b/.test(despues) || /\b[A-Z]{3}\s+$/.test(antes.slice(-6));
      if (contexto) r.push({ pos: m.index, iata: c });
    }
    // Uno al lado del otro repetido (AEP AEP) cuenta una vez
    return r.filter((x, i, a) => i === 0 || x.iata !== a[i - 1].iata || x.pos - a[i - 1].pos > 40);
  }

  function monto(t) {
    const re = /(total(?:\s+a\s+pagar|\s+pagado|\s+de\s+la\s+reserva)?|importe(?:\s+total)?|precio(?:\s+final|\s+total)?|monto(?:\s+total)?|tarifa\s+total|you\s+paid|amount)\s*[:\s]\s*(USD|US\$|U\$S|ARS|AR\$|\$|EUR|€|R\$|BRL|CLP|UYU)?\s*([\d.,]+)\s*(USD|ARS|EUR|BRL|CLP|UYU)?/i;
    const m = re.exec(t);
    if (!m) return null;
    let n = m[3];
    // 1.234.567,89 → 1234567.89 ; 1,234.56 → 1234.56
    n = n.replace(/[.,]$/, '');
    if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, '').replace(',', '.');            // 485.320,50
    else if (/^\d{1,3}(\.\d{3})+$/.test(n)) n = n.replace(/\./g, '');               // 650.000
    else n = n.replace(/,/g, '');                                                     // 1,234.56
    const num = Number(n);
    if (!Number.isFinite(num) || num <= 0) return null;
    const mon = (m[2] || m[4] || '').toUpperCase();
    const moneda = /US|U\$S/.test(mon) ? 'USD' : /EUR|€/.test(mon) ? 'EUR' : /R\$|BRL/.test(mon) ? 'BRL' : /CLP/.test(mon) ? 'CLP' : /UYU/.test(mon) ? 'UYU' : 'ARS';
    return { monto: Math.round(num * 100) / 100, moneda };
  }

  /** La primera fecha que aparece cerca de una palabra (check-in, entrada…). */
  function fechaCerca(t, palabra, lista) {
    const re = new RegExp(palabra, 'i');
    const m = re.exec(t);
    if (!m) return null;
    return lista.find(f => f.pos >= m.index && f.pos - m.index < 120) || null;
  }
  function horaCerca(t, palabra, lista) {
    const re = new RegExp(palabra, 'i');
    const m = re.exec(t);
    if (!m) return '';
    const h = lista.find(x => x.pos >= m.index && x.pos - m.index < 140);
    return h ? h.hora : '';
  }

  function nombreAlojamiento(t) {
    const m = /\b(hotel|hostel|hostal|apart(?:\s?hotel)?|posada|caba[ñn]as?|departamento|residencial|resort|lodge|hoster[ií]a|suites?)\s+(?=[A-ZÁÉÍÓÚÑ0-9])/i.exec(t);
    if (!m) return '';
    // Las palabras que siguen y van con mayúscula (o "de", "del", "la"… entre ellas)
    const palabras = t.slice(m.index + m[0].length).split('\n')[0].split(/[ \t]+/);
    const r = [];
    for (const w of palabras) {
      const limpia = w.replace(/[!,.;:)]+$/, '');
      if (/^[A-ZÁÉÍÓÚÑ0-9&]/.test(limpia)) r.push(limpia);
      else if (/^(de|del|la|las|los|el|y)$/i.test(limpia) && r.length) r.push(limpia);
      else break;
      if (limpia !== w || /\n/.test(w)) break;
    }
    while (r.length && /^(de|del|la|las|los|el|y)$/i.test(r[r.length - 1])) r.pop();
    const tipo = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    return r.length ? `${tipo} ${r.join(' ')}`.slice(0, 60) : '';
  }

  /**
   * Lee el texto. opciones: { esAeropuerto(iata) → bool, ciudadDe(iata) → nombre, anio }
   * Devuelve { tipo, empresa, codigo, tramos, alojamiento, auto, seguro, actividades, costo, encontrado: [...] }
   */
  function leer(texto, opciones) {
    const op = opciones || {};
    const t = String(texto || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ');
    const fs = fechas(t, op.anio);
    const hs = horas(t);
    const vs = vuelos(t);
    const as = aeropuertos(t, op.esAeropuerto);
    const r = { codigo: codigoReserva(t), encontrado: [] };
    const c = monto(t);
    if (c) r.costo = c;
    if (r.codigo) r.encontrado.push('código');

    const esVuelo = vs.length > 0 || (as.length >= 2 && /vuelo|flight|embarque|boarding|aerol[ií]nea|e-?ticket|pasaje a[eé]reo/i.test(t));
    const esMicro = !esVuelo && (EMPRESAS_MICRO.test(t) || /\b(micro|[oó]mnibus|bus|butaca|semi ?cama|coche ?cama|ejecutivo|terminal de [oó]mnibus)\b/i.test(t));
    const esAuto = RENTADORAS.test(t) || /alquiler de auto|rent a car|car rental|retiro del veh[ií]culo/i.test(t);
    const esSeguro = SEGUROS.test(t) && /p[oó]liza|voucher|cobertura|asistencia/i.test(t);
    const esAloj = !esVuelo && ALOJAMIENTO.test(t) && /check[- ]?in|entrada|llegada|arrival/i.test(t);
    const esExcursion = !esVuelo && !esAloj && /excursi[oó]n|tour|entrada[s]? (para|a|al)|ticket[s]? (para|de)|actividad|navegaci[oó]n|visita guiada|punto de encuentro/i.test(t);

    if (esVuelo) {
      r.tipo = 'vuelo';
      const n = Math.max(vs.length, Math.floor(as.length / 2), 1);
      r.tramos = [];
      // Cada vuelo es un "bloque" de texto: desde su número hasta el próximo
      const anclas = (vs.length >= n ? vs.map(x => x.pos) : as.filter((x, k) => k % 2 === 0).map(x => x.pos)).slice(0, n);
      for (let i = 0; i < Math.min(n, 6); i++) {
        const v = vs[i] || (vs.length === 1 ? vs[0] : {}) || {};
        const a1 = as[i * 2], a2 = as[i * 2 + 1];
        const ini = anclas[i] != null ? Math.min(anclas[i], a1 ? a1.pos : anclas[i]) : 0;
        const fin = anclas[i + 1] != null ? anclas[i + 1] : t.length;
        const enBloque = x => x.pos >= ini - 20 && x.pos < fin;
        const f = fs.find(enBloque) || fs.filter(x => x.pos < ini).pop() || fs[i] || fs[0];
        const hsDesp = hs.filter(x => x.pos >= ini && x.pos < fin);
        r.tramos.push({
          numero: v.numero || '', empresa: v.empresa || '',
          desdeAeropuerto: a1 ? a1.iata : '', hastaAeropuerto: a2 ? a2.iata : '',
          desde: a1 && op.ciudadDe ? op.ciudadDe(a1.iata) || '' : '', hasta: a2 && op.ciudadDe ? op.ciudadDe(a2.iata) || '' : '',
          fechaSalida: f ? f.fecha : '', horaSalida: (hsDesp[0] || hs[i * 2] || {}).hora || '', horaLlegada: (hsDesp[1] || hs[i * 2 + 1] || {}).hora || ''
        });
      }
      r.empresa = (vs[0] || {}).empresa || '';
      if (vs.length) r.encontrado.push('vuelo');
      if (as.length >= 2) r.encontrado.push('aeropuertos');
      if (fs.length) r.encontrado.push('fecha');
      if (hs.length) r.encontrado.push('horario');
      const eq = /(equipaje|baggage|valija)[^\n]{0,60}(23 ?kg|bodega|despachad|checked)/i.test(t) ? 'Mano + bodega' : /(solo (equipaje de )?mano|carry[- ]on only|sin equipaje despachado)/i.test(t) ? 'Solo de mano' : '';
      if (eq) r.equipaje = eq;
      const as2 = /asiento[s]?\s*[:#]?\s*((?:\d{1,2}[A-K](?:\s*(?:,|y|-)\s*)?)+)/i.exec(t);
      if (as2) r.asientos = as2[1].trim();
    } else if (esAloj) {
      r.tipo = 'alojamiento';
      const ci = fechaCerca(t, 'check[- ]?in|entrada|llegada|arrival', fs) || fs[0];
      const co = fechaCerca(t, 'check[- ]?out|salida|partida|departure', fs) || fs.find(x => ci && x.fecha > ci.fecha);
      const dir = /(?:direcci[oó]n|address|domicilio|ubicaci[oó]n)\s*[:]\s*([^\n]{5,90})/i.exec(t);
      const tel = /(?:tel[eé]fono|tel\.?|phone|whatsapp)\s*[:]?\s*(\+?[\d\s()-]{7,20}\d)/i.exec(t);
      r.alojamiento = {
        nombre: nombreAlojamiento(t), direccion: dir ? dir[1].trim() : '', telefono: tel ? tel[1].trim() : '',
        checkinFecha: ci ? ci.fecha : '', checkinHora: horaCerca(t, 'check[- ]?in', hs), checkoutFecha: co ? co.fecha : '', checkoutHora: horaCerca(t, 'check[- ]?out', hs),
        desayuno: /desayuno incluido|incluye desayuno|breakfast included/i.test(t)
      };
      const canc = fechaCerca(t, 'cancelaci[oó]n gratu?ita|free cancellation|cancel(ar|ación) sin cargo', fs);
      if (canc) r.alojamiento.cancelacionHasta = canc.fecha;
      ['nombre', 'checkinFecha', 'checkoutFecha'].forEach(k => { if (r.alojamiento[k]) r.encontrado.push(k === 'nombre' ? 'alojamiento' : k === 'checkinFecha' ? 'check-in' : 'check-out'); });
      if (/booking\.com/i.test(t)) r.empresa = 'Booking'; else if (/airbnb/i.test(t)) r.empresa = 'Airbnb'; else if (/despegar/i.test(t)) r.empresa = 'Despegar';
    } else if (esAuto) {
      r.tipo = 'auto';
      const ret = fechaCerca(t, 'retiro|pick[- ]?up|entrega del veh', fs) || fs[0];
      const dev = fechaCerca(t, 'devoluci[oó]n|drop[- ]?off|return', fs) || fs[1];
      r.auto = { rentadora: ((RENTADORAS.exec(t) || [])[1] || '').replace(/^\w/, x => x.toUpperCase()), retiroFecha: ret ? ret.fecha : '', retiroHora: horaCerca(t, 'retiro|pick[- ]?up', hs), devolucionFecha: dev ? dev.fecha : '', devolucionHora: horaCerca(t, 'devoluci[oó]n|drop[- ]?off|return', hs) };
      r.encontrado.push('alquiler de auto');
    } else if (esSeguro) {
      r.tipo = 'seguro';
      const tel = /(?:asistencia|emergencias?|llam[aá]|tel[eé]fono)[^\n\d+]{0,40}(\+?[\d\s()-]{8,20}\d)/i.exec(t);
      const des = fechaCerca(t, 'vigencia|desde|inicio|from', fs) || fs[0];
      const has = fechaCerca(t, 'hasta|fin|to\\b', fs.filter(x => !des || x.fecha > des.fecha)) || fs.find(x => des && x.fecha > des.fecha);
      r.seguro = { compania: ((SEGUROS.exec(t) || [])[1] || '').replace(/^\w/, x => x.toUpperCase()), poliza: r.codigo, telefono: tel ? tel[1].trim() : '', desde: des ? des.fecha : '', hasta: has ? has.fecha : '' };
      r.encontrado.push('seguro');
    } else if (esMicro) {
      r.tipo = 'micro';
      const emp = (EMPRESAS_MICRO.exec(t) || [])[1] || '';
      r.empresa = emp ? emp.replace(/\b\w/g, x => x.toUpperCase()) : '';
      const desde = /(?:origen|desde|sale de|from)\s*[:]?\s*([A-ZÁÉÍÓÚÑ][\wáéíóúñ .]{2,30})/i.exec(t), hasta = /(?:destino|hasta|llega a|to)\s*[:]?\s*([A-ZÁÉÍÓÚÑ][\wáéíóúñ .]{2,30})/i.exec(t);
      const corta = x => x ? x[1].split(/\n|\s+(?=(destino|hasta|fecha|salida|llegada|origen|desde)\b)/i)[0].trim() : '';
      r.tramos = [{ empresa: r.empresa, desde: corta(desde), hasta: corta(hasta), fechaSalida: (fs[0] || {}).fecha || '', horaSalida: (hs[0] || {}).hora || '', horaLlegada: (hs[1] || {}).hora || '' }];
      const butaca = /butaca[s]?\s*[:#]?\s*([\d ,y-]{1,20})/i.exec(t);
      if (butaca) r.asientos = butaca[1].trim();
      r.encontrado.push('pasaje de micro');
    } else if (esExcursion) {
      r.tipo = 'excursion';
      const nom = /(excursi[oó]n|tour|visita guiada|navegaci[oó]n|entrada[s]?)\s+(a|al|por|de|para)?\s*([A-ZÁÉÍÓÚÑ][\wáéíóúñ .'-]{3,50})/i.exec(t);
      const enc = /(?:punto de encuentro|meeting point|encuentro)\s*[:]?\s*([^\n]{4,80})/i.exec(t);
      r.actividades = [{ nombre: nom ? `${nom[1].replace(/^\w/, x => x.toUpperCase())} ${nom[2] ? nom[2] + ' ' : ''}${nom[3]}`.trim().split(/\s{2,}|\n/)[0] : 'Excursión', fecha: (fs[0] || {}).fecha || '', hora: (hs[0] || {}).hora || '', lugar: enc ? enc[1].trim() : '' }];
      r.encontrado.push('excursión');
    } else {
      r.tipo = 'otro';
    }
    // ¿Alcanza para completar algo útil?
    r.util = r.tipo !== 'otro' && (!!r.codigo || r.encontrado.length >= 2);
    return r;
  }

  const api = { leer, fechas, horas, vuelos, aeropuertos, codigoReserva, monto, AEROLINEAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { raiz.R = raiz.R || {}; raiz.R.lector = api; }
})(typeof window !== 'undefined' ? window : this);
