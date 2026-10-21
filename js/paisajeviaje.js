/* =========================================================
   Rutenda — paisaje del viaje
   Ilustración que se personaliza con cada viaje:
   - El destino define el paisaje (playa, montaña, nieve, lagos,
     selva, desierto, ciudad o sierras) y los colores de la tarjeta.
   - El medio de transporte define la escena (avión, auto,
     micro, tren o barco) y avanza con el progreso.
   - El sol va saliendo a medida que organizás.
   - Aparecen hitos al resolver pasos: alojamiento (casita),
     experiencias (banderita) y, al 100%, pájaros en el cielo.
   ========================================================= */
window.R = window.R || {};

R.paisaje = (function () {
  /** Punto y ángulo sobre una curva Bézier cuadrática. */
  function bezier(p0, p1, p2, t) {
    const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
    const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    return { x, y, ang: Math.atan2(dy, dx) * 180 / Math.PI };
  }
  const r = n => Math.round(n * 10) / 10;

  const ICONOS = {
    avion: '<path d="M-17 0 Q-17 -2.4 -13 -2.4 L11 -2.4 Q18 -2.4 20 0 Q18 2.4 11 2.4 L-13 2.4 Q-17 2.4 -17 0Z"/><path d="M-1 -2 L-9 -13 L-4.5 -13 L7 -2Z"/><path d="M-1 2 L-9 13 L-4.5 13 L7 2Z"/><path d="M-13 -2 L-17 -8.5 L-14 -8.5 L-9 -2Z"/>',
    auto: '<path d="M-15 1 Q-15 -5 -10 -5 L-7 -5 L-3 -10.5 L7 -10.5 L11.5 -5 L13 -5 Q16 -5 16 -1 L16 3 L-15 3Z"/><circle cx="-8" cy="3.5" r="3.4" class="p-rueda"/><circle cx="9" cy="3.5" r="3.4" class="p-rueda"/>',
    micro: '<rect x="-22" y="-14" width="44" height="17" rx="4"/><rect x="-18" y="-11" width="8" height="6" rx="1.5" class="p-ventana"/><rect x="-7" y="-11" width="8" height="6" rx="1.5" class="p-ventana"/><rect x="4" y="-11" width="8" height="6" rx="1.5" class="p-ventana"/><circle cx="-12" cy="4" r="3.6" class="p-rueda"/><circle cx="12" cy="4" r="3.6" class="p-rueda"/>',
    tren: '<path d="M14 -13 L24 -13 Q30 -13 30 -6 L30 2 L14 2Z"/><rect x="-4" y="-13" width="16" height="15" rx="2.5"/><rect x="-22" y="-13" width="16" height="15" rx="2.5"/><rect x="-40" y="-13" width="16" height="15" rx="2.5"/>',
    barco: '<path d="M-22 -2 L22 -2 L15 7 L-16 7Z"/><path d="M-2 -4 L-2 -30 L16 -6Z" class="p-vela"/><path d="M-5 -4 L-5 -24 L-18 -6Z" class="p-vela"/>',
    casa: '<path d="M-9 0 L-9 -10 L0 -17 L9 -10 L9 0Z"/><rect x="-2.5" y="-6" width="5" height="6" class="p-puerta"/>',
    bandera: '<line x1="0" y1="0" x2="0" y2="-20" class="p-mastil"/><path d="M0 -20 L13 -16 L0 -12Z" class="p-banderin"/>'
  };

  /* ---------------------------------------------------------
     Estilo según el destino
     --------------------------------------------------------- */
  const TEMAS = {
    playa:    { nombre: 'Playa',            icono: '🏖️', fondos: [['#1f6f8b', '#f2c89b'], ['#2a7f8f', '#f6d7a7']] },
    montana:  { nombre: 'Montaña',          icono: '⛰️', fondos: [['#3f5b4c', '#c9d6b8'], ['#4a5d6e', '#d7cdb8']] },
    nieve:    { nombre: 'Nieve',            icono: '🏔️', fondos: [['#3d5a80', '#dbe7f0'], ['#46607a', '#e8eef3']] },
    lagos:    { nombre: 'Lagos y bosques',  icono: '🌲', fondos: [['#2e5a6b', '#bcd8d2'], ['#355f5a', '#cfe3d6']] },
    selva:    { nombre: 'Selva y cataratas', icono: '🌿', fondos: [['#1f4d3a', '#9cc58a'], ['#2b5a3c', '#c4d99a']] },
    desierto: { nombre: 'Desierto y quebradas', icono: '🌵', fondos: [['#9a5434', '#f0c98a'], ['#a4683a', '#f3d7a0']] },
    ciudad:   { nombre: 'Ciudad',           icono: '🏙️', fondos: [['#2b3a55', '#c9a27a'], ['#3a3355', '#e0b48f']] },
    campo:    { nombre: 'Sierras y campo',  icono: '🌄', fondos: [['#2f7d7b', '#9cc9b9'], ['#c9785a', '#f2c48d'], ['#466a8f', '#a9c6dd'], ['#6d8a5c', '#cfdcb2']] }
  };
  const normal = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const LISTAS = {
    nieve: ['las lenas', 'chapelco', 'cerro catedral', 'cerro castor', 'la hoya', 'caviahue', 'penitentes', 'cerro bayo', 'valle nevado', 'portillo', 'farellones', 'la parva', 'nevados de chillan', 'aspen', 'vail', 'whistler', 'zermatt', 'chamonix', 'courchevel', 'val thorens', 'st. moritz', 'sankt moritz', 'saint moritz', 'andorra', 'baqueira', 'sierra nevada', 'cortina', 'innsbruck', 'niseko', 'laponia', 'rovaniemi', 'tromso'],
    // Lugares con nieve en invierno y lagos en verano
    lagosNieve: ['bariloche', 'san martin de los andes', 'villa la angostura', 'esquel', 'ushuaia', 'pucon', 'banff', 'queenstown'],
    lagos: ['el bolson', 'lago puelo', 'villa traful', 'puerto varas', 'frutillar', 'puerto montt', 'chiloe', 'como', 'bellagio', 'garda', 'bled', 'hallstatt', 'interlaken', 'lucerna', 'luzern', 'annecy', 'zell am see', 'plitvice', 'potrero de los funes', 'villa general belgrano', 'la cumbrecita', 'junin de los andes', 'aluminé', 'alumine', 'villa pehuenia', 'trevelin', 'lago titicaca', 'copacabana bolivia'],
    montana: ['el chalten', 'el calafate', 'mendoza', 'uspallata', 'potrerillos', 'malargue', 'cusco', 'machu picchu', 'aguas calientes', 'ollantaytambo', 'la paz', 'quito', 'huaraz', 'tafi del valle', 'merlo', 'villa carlos paz', 'la cumbre', 'capilla del monte', 'mina clavero', 'nono', 'villa de merlo', 'tandil', 'sierra de la ventana', 'torres del paine', 'puerto natales', 'los alpes', 'katmandu', 'kathmandu', 'cordillera'],
    desierto: ['purmamarca', 'humahuaca', 'tilcara', 'cafayate', 'cachi', 'jujuy', 'san pedro de atacama', 'uyuni', 'ischigualasto', 'talampaya', 'fiambala', 'san antonio de los cobres', 'iruya', 'dubai', 'abu dhabi', 'doha', 'marrakech', 'marrakesh', 'merzouga', 'petra', 'wadi rum', 'el cairo', 'cairo', 'luxor', 'giza', 'sahara', 'las vegas', 'sedona', 'moab', 'atacama', 'huacachina'],
    selva: ['iguazu', 'iguacu', 'misiones', 'amazonas', 'manaus', 'leticia', 'iquitos', 'puerto maldonado', 'tortuguero', 'monteverde', 'la fortuna', 'arenal', 'esteros del ibera', 'ibera', 'el impenetrable', 'yungas', 'calilegua', 'bonito', 'chapada', 'pantanal', 'ubud'],
    playa: ['comodoro rivadavia', 'rada tilly', 'puerto piramides', 'caleta olivia', 'mar del plata', 'pinamar', 'villa gesell', 'carilo', 'necochea', 'monte hermoso', 'las grutas', 'puerto madryn', 'miramar', 'san clemente', 'mar de las pampas', 'mar de ajo', 'san bernardo', 'santa teresita', 'claromeco', 'punta del este', 'jose ignacio', 'la paloma', 'punta del diablo', 'cabo polonio', 'piriapolis', 'florianopolis', 'buzios', 'búzios', 'rio de janeiro', 'arraial do cabo', 'cabo frio', 'ilhabela', 'ubatuba', 'paraty', 'bombinhas', 'camboriu', 'garopaba', 'porto seguro', 'salvador', 'maceio', 'natal', 'fortaleza', 'recife', 'porto de galinhas', 'jericoacoara', 'morro de sao paulo', 'itacare', 'cancun', 'playa del carmen', 'tulum', 'cozumel', 'isla mujeres', 'acapulco', 'los cabos', 'cabo san lucas', 'puerto vallarta', 'punta cana', 'bayahibe', 'samana', 'varadero', 'cayo', 'cartagena', 'san andres', 'santa marta', 'tayrona', 'miami', 'isla margarita', 'aruba', 'curazao', 'bonaire', 'bahamas', 'nassau', 'jamaica', 'barbados', 'honolulu', 'hawai', 'maui', 'ibiza', 'mallorca', 'menorca', 'tenerife', 'gran canaria', 'lanzarote', 'mykonos', 'santorini', 'creta', 'amalfi', 'positano', 'capri', 'cerdena', 'algarve', 'bali', 'phuket', 'krabi', 'maldivas', 'seychelles', 'zanzibar', 'mauricio', 'boracay', 'palawan', 'fiyi', 'bora bora', 'mancora', 'galapagos', 'copacabana'],
    ciudad: ['buenos aires', 'nueva york', 'new york', 'paris', 'roma', 'londres', 'madrid', 'barcelona', 'lisboa', 'berlin', 'amsterdam', 'praga', 'viena', 'budapest', 'tokio', 'tokyo', 'seul', 'hong kong', 'singapur', 'shanghai', 'pekin', 'bangkok', 'estambul', 'chicago', 'san francisco', 'los angeles', 'toronto', 'montreal', 'mexico', 'ciudad de mexico', 'sao paulo', 'santiago', 'lima', 'bogota', 'montevideo', 'cordoba', 'rosario', 'milan', 'florencia', 'venecia', 'munich', 'bruselas', 'dublin', 'edimburgo', 'copenhague', 'estocolmo', 'oslo', 'atenas', 'moscu', 'sidney', 'sydney', 'melbourne', 'washington', 'boston', 'orlando']
  };
  const PAISES = {
    playa: ['DO', 'CU', 'JM', 'BS', 'AW', 'CW', 'BQ', 'BB', 'MV', 'SC', 'MU', 'FJ', 'PF', 'TC', 'KY', 'LC', 'AG', 'VI', 'VG'],
    desierto: ['AE', 'QA', 'EG', 'JO', 'OM', 'SA', 'KW', 'BH'],
    selva: ['CR']
  };
  const contiene = (texto, lista) => {
    const t = ' ' + texto.replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    return lista.some(x => t.includes(' ' + normal(x).replace(/[^a-z0-9]+/g, ' ').trim() + ' '));
  };
  /** En invierno del lugar: junio–septiembre al sur, diciembre–marzo al norte. */
  function esInvierno(fecha, lat) {
    if (!fecha) return false;
    const m = Number(String(fecha).slice(5, 7));
    return (lat == null || lat < 0) ? (m >= 6 && m <= 9) : (m === 12 || m <= 3);
  }

  function temaDeLugar(d, fecha) {
    const t = normal([d.nombre, d.region].filter(Boolean).join(' '));
    const n = normal(d.nombre);
    if (contiene(n, LISTAS.nieve)) return 'nieve';
    if (contiene(n, LISTAS.lagosNieve)) return esInvierno(fecha, d.lat) ? 'nieve' : 'lagos';
    for (const id of ['desierto', 'selva', 'playa', 'lagos', 'montana', 'ciudad']) if (contiene(n, LISTAS[id])) return id;
    const pais = (d.codigoPais || '').toUpperCase();
    for (const id of Object.keys(PAISES)) if (PAISES[id].includes(pais)) return id;
    if (d.elevacion != null && d.elevacion >= 2200) return esInvierno(fecha, d.lat) && Math.abs(d.lat || 0) > 30 ? 'nieve' : 'montana';
    if (d.poblacion >= 400000 || /^PPLC$|^PPLA$/.test(d.tipoLugar || '')) return 'ciudad';
    if (d.elevacion != null && d.elevacion >= 900) return 'montana';
    if (/misiones|corrientes/.test(t)) return 'selva';
    if (/jujuy|catamarca|la rioja/.test(t)) return 'desierto';
    if (/neuquen|rio negro|chubut|tierra del fuego|los lagos|araucania/.test(t)) return esInvierno(fecha, d.lat) ? 'nieve' : 'lagos';
    if (/mendoza|san juan|cusco|tirol|valais|grisones/.test(t)) return 'montana';
    return null;
  }

  /** Devuelve el id del estilo del viaje (playa, montana, nieve, lagos, selva, desierto, ciudad o campo). */
  function tema(v) {
    if (!v) return 'campo';
    if (v.perfil && v.perfil.portada && TEMAS[v.perfil.portada]) return v.perfil.portada;
    const dests = (v.destinos || []).filter(d => d && d.nombre && !d.dePaso);
    const ordenados = dests.filter(d => !d.soloDia).concat(dests.filter(d => d.soloDia));
    for (const d of ordenados) { const t = temaDeLugar(d, v.fechaInicio); if (t) return t; }
    if (v.destino) { const t = temaDeLugar({ nombre: String(v.destino).split(/,|→/)[0].trim() }, v.fechaInicio); if (t) return t; }
    return 'campo';
  }
  function fondo(v, idTema) {
    const t = TEMAS[idTema || tema(v)] || TEMAS.campo;
    const semilla = v ? (v.id || v.destino || (v.destinos && v.destinos[0] && v.destinos[0].nombre) || '') : '';
    const [a, b] = t.fondos[R.util.hash(semilla) % t.fondos.length];
    return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
  }

  /* ---------------------------------------------------------
     Elementos de las escenas
     --------------------------------------------------------- */
  const pino = (x, y, s) => `<path class="p-arbol" d="M${x} ${r(y - 30 * s)} L${r(x - 9 * s)} ${r(y - 15 * s)} L${r(x - 4 * s)} ${r(y - 15 * s)} L${r(x - 12 * s)} ${r(y - 3 * s)} L${r(x + 12 * s)} ${r(y - 3 * s)} L${r(x + 4 * s)} ${r(y - 15 * s)} L${r(x + 9 * s)} ${r(y - 15 * s)}Z"/><rect class="p-arbol" x="${r(x - 1.5 * s)}" y="${r(y - 3 * s)}" width="${r(3 * s)}" height="${r(4 * s)}"/>`;
  function palmera(x, y, s) {
    const tx = r(x + 16 * s), ty = r(y - 62 * s);
    const hojas = [-12, 34, 82, 140, 188].map(a => `<path class="p-hoja" transform="translate(${tx} ${ty}) rotate(${a}) scale(${s})" d="M0 0 Q-18 -15 -40 5 Q-20 -3 0 0Z"/>`).join('');
    return `<path class="p-tronco" style="stroke-width:${r(5 * s)}" d="M${x} ${y} Q${r(x + 4 * s)} ${r(y - 34 * s)} ${tx} ${ty}"/>${hojas}`;
  }
  const cactus = (x, y, s) => `<path class="p-cactus" style="stroke-width:${r(7 * s)}" d="M${x} ${y} V${r(y - 46 * s)} M${x} ${r(y - 18 * s)} H${r(x - 11 * s)} V${r(y - 32 * s)} M${x} ${r(y - 26 * s)} H${r(x + 11 * s)} V${r(y - 40 * s)}"/>`;
  const gorro = (x, y, w) => `<path class="p-nieve" d="M${x} ${y} L${r(x - w)} ${r(y + w * 0.9)} L${r(x - w * 0.45)} ${r(y + w * 0.7)} L${x} ${r(y + w * 1.05)} L${r(x + w * 0.5)} ${r(y + w * 0.7)} L${r(x + w)} ${r(y + w * 0.9)}Z"/>`;
  const hito = (icono, x, y, esc) => `<g class="p-icono-hito" transform="translate(${x} ${y})${esc ? ' scale(' + esc + ')' : ''}">${ICONOS[icono]}</g>`;

  function edificios(lista, clase, ventanas) {
    return lista.map(([x, w, h]) => {
      let html = `<rect class="${clase}" x="${x}" y="${200 - h}" width="${w}" height="${h}"/>`;
      if (ventanas) {
        for (let yy = 200 - h + 8; yy < 190; yy += 12) for (let xx = x + 5; xx < x + w - 6; xx += 10) {
          if ((xx * 7 + yy * 3) % 5 < 2) html += `<rect class="p-ventanita" x="${xx}" y="${yy}" width="4" height="5"/>`;
        }
      }
      return html;
    }).join('');
  }

  /** Fondo de cada estilo. Devuelve las capas y dónde van los hitos. */
  function escena(id, hitos) {
    const c = [];
    let ruta = [[360, 196], [680, 190], [720, 138]];
    const montesAltos = 'M0 160 L70 120 L130 140 L230 50 L300 112 L360 86 L470 150 L560 66 L640 120 L720 60 L800 108 L800 220 L0 220 Z';
    const montesCerca = 'M0 196 L80 150 L160 178 L262 128 L360 192 L470 142 L580 196 L690 152 L800 178 L800 220 L0 220 Z';
    if (id === 'montana' || id === 'nieve') {
      c.push(`<path class="p-monte-lejos" d="${montesAltos}"/>`);
      c.push(gorro(230, 50, id === 'nieve' ? 22 : 13) + gorro(560, 66, id === 'nieve' ? 20 : 11) + gorro(720, 60, id === 'nieve' ? 20 : 12));
      if (id === 'nieve') c.push(gorro(360, 86, 12) + gorro(70, 120, 10));
      if (hitos.experiencias) c.push(hito('bandera', 560, 68));
      c.push(`<path class="p-monte" d="${montesCerca}"/>`);
      if (id === 'nieve') c.push(gorro(262, 128, 14) + gorro(470, 142, 12) + gorro(690, 152, 12));
      c.push([[120, 196, 0.9], [142, 194, 0.7], [600, 198, 0.8], [624, 196, 1], [752, 194, 0.9], [774, 196, 1.1]].map(([x, y, s]) => pino(x, y, s)).join(''));
      if (id === 'nieve') {
        const copos = [[120, 40], [180, 76], [300, 30], [400, 58], [470, 24], [520, 96], [610, 40], [780, 30], [90, 92], [350, 110]];
        c.push(`<g class="p-copo">${copos.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4"/>`).join('')}</g>`);
      }
      if (hitos.alojamiento) c.push(hito('casa', 470, 144, 1.2));
    } else if (id === 'lagos') {
      c.push(`<path class="p-monte-lejos" d="M0 164 L90 108 L170 140 L270 62 L350 120 L440 84 L540 150 L640 78 L740 128 L800 104 L800 220 L0 220 Z"/>`);
      c.push(gorro(270, 62, 14) + gorro(640, 78, 13) + gorro(440, 84, 9));
      if (hitos.experiencias) c.push(hito('bandera', 640, 80));
      c.push('<path class="p-lago" d="M0 166 C 200 158, 600 158, 800 166 L800 200 L0 200 Z"/>');
      c.push('<path class="p-reflejo" d="M200 174 h60 M420 180 h90 M600 172 h50 M120 186 h40 M520 190 h70"/>');
      c.push('<path class="p-monte" d="M0 200 C 60 176, 130 178, 210 196 C 260 204, 520 204, 580 196 C 650 178, 740 176, 800 190 L800 220 L0 220 Z"/>');
      c.push([[100, 192, 1], [126, 186, 1.2], [152, 190, 0.9], [660, 188, 1.1], [690, 184, 1.3], [722, 188, 1], [760, 186, 1.2]].map(([x, y, s]) => pino(x, y, s)).join(''));
      if (hitos.alojamiento) c.push(hito('casa', 610, 194, 1.2));
    } else if (id === 'selva') {
      c.push('<path class="p-monte-lejos" d="M0 150 C 70 112, 150 116, 220 140 C 290 104, 370 104, 430 132 C 520 96, 620 100, 680 130 C 730 112, 780 112, 800 120 L800 220 L0 220 Z"/>');
      // Cascada
      c.push('<path class="p-monte" d="M410 200 L410 124 Q420 116 440 118 L560 118 Q578 118 584 126 L584 200 Z"/>');
      c.push('<g class="p-cascada"><path d="M432 122 Q426 160 430 196"/><path d="M462 120 Q458 160 462 198"/><path d="M496 120 Q494 160 498 198"/><path d="M530 120 Q530 160 534 198"/><path d="M562 122 Q566 160 562 196"/></g>');
      c.push('<g class="p-bruma"><ellipse cx="496" cy="196" rx="96" ry="10"/><ellipse cx="460" cy="188" rx="40" ry="7"/><ellipse cx="540" cy="190" rx="44" ry="7"/></g>');
      if (hitos.experiencias) c.push(hito('bandera', 584, 124));
      c.push('<path class="p-monte" d="M0 200 C 60 170, 140 170, 210 188 C 260 196, 330 194, 400 200 Z M590 200 C 640 182, 720 172, 800 180 L800 220 L590 220 Z"/>');
      c.push(palmera(120, 196, 1) + palmera(175, 198, 0.75) + palmera(660, 196, 0.9) + palmera(712, 198, 1.1) + palmera(764, 197, 0.8));
      if (hitos.alojamiento) c.push(hito('casa', 620, 192, 1.2));
    } else if (id === 'playa') {
      ruta = [[300, 204], [600, 200], [790, 186]];
      c.push('<path class="p-monte-lejos" d="M470 152 C 500 130, 560 126, 610 152 Z"/>');
      if (hitos.experiencias) c.push(hito('bandera', 540, 132));
      c.push('<rect class="p-mar-playa" x="0" y="150" width="800" height="70"/>');
      c.push('<path class="p-ola" d="M120 164 q10 -5 20 0 q10 5 20 0 M340 160 q10 -5 20 0 q10 5 20 0 M560 168 q10 -5 20 0 q10 5 20 0 M700 160 q10 -5 20 0"/>');
      c.push('<g class="p-velero" transform="translate(420 152) scale(.55)"><path d="M-22 -2 L22 -2 L15 7 L-16 7Z"/><path d="M-2 -4 L-2 -30 L16 -6Z"/></g>');
      c.push('<path class="p-arena" d="M0 186 C 160 172, 380 180, 540 194 C 640 202, 740 196, 800 190 L800 220 L0 220 Z"/>');
      c.push(palmera(130, 194, 1.1) + palmera(722, 194, 1.05) + palmera(770, 197, 0.8));
      if (hitos.alojamiento) c.push(hito('casa', 600, 196, 1.2));
    } else if (id === 'desierto') {
      c.push('<path class="p-monte-lejos" d="M0 172 L40 172 L54 124 L170 124 L186 172 L330 172 L344 140 L420 140 L432 172 L560 172 L578 108 L700 108 L716 172 L800 172 L800 220 L0 220 Z"/>');
      c.push('<path class="p-estrato" d="M58 136 H166 M62 150 H172 M348 152 H418 M582 122 H698 M586 138 H704 M590 154 H708"/>');
      if (hitos.experiencias) c.push(hito('bandera', 640, 108));
      c.push('<path class="p-monte" d="M0 198 C 120 172, 220 172, 320 192 C 420 178, 520 170, 620 190 C 700 182, 760 180, 800 186 L800 220 L0 220 Z"/>');
      c.push(cactus(170, 196, 1) + cactus(430, 198, 0.65) + cactus(760, 194, 0.95));
      if (hitos.alojamiento) c.push(hito('casa', 540, 184, 1.2));
    } else if (id === 'ciudad') {
      c.push(edificios([[0, 40, 70], [44, 30, 96], [78, 46, 60], [130, 28, 120], [164, 50, 84], [220, 34, 104], [262, 44, 66], [440, 36, 92], [480, 50, 130], [536, 30, 78], [572, 44, 110], [622, 36, 70], [664, 50, 96], [720, 34, 124], [760, 40, 80]], 'p-edificio-lejos', false));
      c.push('<path class="p-edificio-lejos" d="M497 70 L505 46 L513 70 Z"/>');
      if (hitos.experiencias) c.push(hito('bandera', 737, 76));
      c.push(edificios([[10, 48, 58], [62, 36, 82], [104, 54, 46], [300, 40, 72], [346, 56, 50], [560, 44, 64], [610, 36, 88], [654, 52, 54], [742, 46, 70]], 'p-edificio', true));
      c.push('<path class="p-edificio" d="M300 128 Q320 104 340 128 Z"/>');
      if (hitos.alojamiento) c.push(hito('casa', 470, 200, 1.2));
    } else {
      c.push('<path class="p-monte-lejos" d="M0 170 L110 98 L200 150 L320 72 L440 160 L560 108 L680 156 L800 100 L800 220 L0 220 Z"/>');
      if (hitos.experiencias) c.push(hito('bandera', 560, 110));
      c.push('<path class="p-monte" d="M0 192 L90 142 L190 182 L300 124 L420 188 L520 152 L640 194 L740 158 L800 178 L800 220 L0 220 Z"/>');
      if (hitos.alojamiento) c.push(hito('casa', 522, 154, 1.2));
    }
    return { capas: c.join(''), ruta };
  }

  /**
   * v: viaje (o null para escenas genéricas).
   * opciones: { transporte, progreso (0..1), hitos: {alojamiento, experiencias}, tema }
   */
  function svg(v, opciones) {
    const op = opciones || {};
    const transporte = op.transporte || (v && v.perfil && v.perfil.transporte) || 'avion';
    let p = op.progreso;
    let hitos = op.hitos || {};
    if (v && p == null && R.motor) {
      p = R.motor.progreso(v).pct / 100;
      const resuelto = base => R.motor.idsDe(v, base).some(id => R.motor.estado(v, id) === 'hecha');
      hitos = {
        alojamiento: resuelto('a_reserva'),
        experiencias: resuelto('e_excursiones') || resuelto('e_imperdibles') || resuelto('e_escapada'),
        transporte: resuelto('t_segmento')
      };
    }
    p = Math.max(0, Math.min(1, p == null ? 0.5 : p));
    const idTema = op.tema || (v ? tema(v) : 'campo');

    const solY = r(178 - 118 * p);
    const capas = [];
    capas.push(`<circle cx="668" cy="${solY}" r="34" class="p-sol"/><circle cx="668" cy="${solY}" r="54" class="p-halo"/>`);

    // Cielo según transporte
    if (transporte === 'avion') {
      capas.push('<g class="p-nube"><ellipse cx="470" cy="62" rx="30" ry="9"/><ellipse cx="493" cy="55" rx="20" ry="10"/></g>');
      capas.push('<g class="p-nube"><ellipse cx="740" cy="34" rx="26" ry="8"/><ellipse cx="758" cy="28" rx="15" ry="7"/></g>');
      capas.push('<path d="M350 176 Q540 30 790 70" class="p-ruta-aerea"/>');
    }
    if (p >= 1) {
      capas.push('<g class="p-pajaros"><path d="M560 92 q6 -6 12 0 q6 -6 12 0"/><path d="M592 78 q5 -5 10 0 q5 -5 10 0"/><path d="M536 74 q4 -4 8 0 q4 -4 8 0"/></g>');
    }

    // Paisaje del destino
    const esc = escena(idTema, hitos);
    capas.push(esc.capas);

    // Suelo / transporte
    const suelo = idTema === 'playa' ? '' : '<path class="p-mar" d="M0 200 C 120 190, 220 212, 340 202 S 580 192, 800 204 L800 220 L0 220 Z"/>';
    if (transporte === 'barco') {
      capas.push('<path class="p-mar p-mar-alto" d="M0 186 C 120 176, 220 196, 340 186 S 580 176, 800 188 L800 220 L0 220 Z"/>');
      const x = r(380 + 360 * p);
      capas.push(`<g class="p-vehiculo" transform="translate(${x} 186)">${ICONOS.barco}</g>`);
      capas.push('<path class="p-ola" d="M60 204 q10 -5 20 0 q10 5 20 0 M420 208 q10 -5 20 0 q10 5 20 0 M640 200 q10 -5 20 0"/>');
    } else if (transporte === 'tren') {
      capas.push(suelo || '<path class="p-mar" d="M0 204 L800 204 L800 220 L0 220 Z"/>');
      capas.push('<line x1="0" y1="198" x2="800" y2="198" class="p-riel"/>');
      let durmientes = '';
      for (let i = 10; i < 800; i += 22) durmientes += `M${i} 194 L${i + 8} 202 `;
      capas.push(`<path d="${durmientes}" class="p-durmiente"/>`);
      const x = r(400 + 340 * p);
      capas.push(`<g class="p-vehiculo" transform="translate(${x} 194)">${ICONOS.tren}</g>`);
    } else if (transporte === 'auto' || transporte === 'micro') {
      capas.push(suelo);
      const [a, b, c] = esc.ruta;
      const d = `M${a[0]} ${a[1]} Q${b[0]} ${b[1]} ${c[0]} ${c[1]}`;
      capas.push(`<path d="${d}" class="p-ruta"/><path d="${d}" class="p-ruta-linea"/>`);
      const pt = bezier(a, b, c, 0.3 + 0.55 * p);
      const escala = r(1.15 - 0.55 * p);
      capas.push(`<g class="p-vehiculo" transform="translate(${r(pt.x)} ${r(pt.y - 4)}) scale(${escala})">${ICONOS[transporte]}</g>`);
    } else {
      capas.push(suelo);
      const pt = bezier([350, 176], [540, 30], [790, 70], 0.08 + 0.84 * p);
      capas.push(`<g class="p-vehiculo p-avion ${hitos.transporte ? 'confirmado' : ''}" transform="translate(${r(pt.x)} ${r(pt.y)}) rotate(${r(pt.ang)})">${ICONOS.avion}</g>`);
    }

    return `<svg class="paisaje paisaje-${transporte} paisaje-${idTema}" viewBox="0 0 800 220" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">${capas.join('')}</svg>`;
  }

  return { svg, ICONOS, tema, fondo, TEMAS, temaDeLugar };
})();
