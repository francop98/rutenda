/* =========================================================
   Tripbox — paisaje del viaje
   Ilustración que se personaliza con cada viaje:
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

  /**
   * v: viaje (o null para escenas genéricas).
   * opciones: { transporte, progreso (0..1), hitos: {alojamiento, experiencias} }
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

    // Montañas
    capas.push('<path class="p-monte-lejos" d="M0 170 L110 98 L200 150 L320 72 L440 160 L560 108 L680 156 L800 100 L800 220 L0 220 Z"/>');
    if (hitos.experiencias) capas.push(`<g class="p-icono-hito" transform="translate(320 74)">${ICONOS.bandera}</g>`);
    capas.push('<path class="p-monte" d="M0 192 L90 142 L190 182 L300 124 L420 188 L520 152 L640 194 L740 158 L800 178 L800 220 L0 220 Z"/>');
    if (hitos.alojamiento) capas.push(`<g class="p-icono-hito" transform="translate(522 154) scale(1.2)">${ICONOS.casa}</g>`);

    // Suelo / transporte
    if (transporte === 'barco') {
      capas.push('<path class="p-mar p-mar-alto" d="M0 186 C 120 176, 220 196, 340 186 S 580 176, 800 188 L800 220 L0 220 Z"/>');
      const x = r(380 + 360 * p);
      capas.push(`<g class="p-vehiculo" transform="translate(${x} 186)">${ICONOS.barco}</g>`);
      capas.push('<path class="p-ola" d="M60 204 q10 -5 20 0 q10 5 20 0 M420 208 q10 -5 20 0 q10 5 20 0 M640 200 q10 -5 20 0"/>');
    } else if (transporte === 'tren') {
      capas.push('<path class="p-mar" d="M0 200 C 120 190, 220 212, 340 202 S 580 192, 800 204 L800 220 L0 220 Z"/>');
      capas.push('<line x1="0" y1="198" x2="800" y2="198" class="p-riel"/>');
      let durmientes = '';
      for (let i = 10; i < 800; i += 22) durmientes += `M${i} 194 L${i + 8} 202 `;
      capas.push(`<path d="${durmientes}" class="p-durmiente"/>`);
      const x = r(400 + 340 * p);
      capas.push(`<g class="p-vehiculo" transform="translate(${x} 194)">${ICONOS.tren}</g>`);
    } else if (transporte === 'auto' || transporte === 'micro') {
      capas.push('<path class="p-mar" d="M0 200 C 120 190, 220 212, 340 202 S 580 192, 800 204 L800 220 L0 220 Z"/>');
      capas.push('<path d="M360 196 Q680 190 720 138" class="p-ruta"/><path d="M360 196 Q680 190 720 138" class="p-ruta-linea"/>');
      const pt = bezier([360, 196], [680, 190], [720, 138], 0.3 + 0.55 * p);
      const escala = r(1.15 - 0.55 * p);
      capas.push(`<g class="p-vehiculo" transform="translate(${r(pt.x)} ${r(pt.y - 4)}) scale(${escala})">${ICONOS[transporte]}</g>`);
    } else {
      capas.push('<path class="p-mar" d="M0 200 C 120 190, 220 212, 340 202 S 580 192, 800 204 L800 220 L0 220 Z"/>');
      const pt = bezier([350, 176], [540, 30], [790, 70], 0.08 + 0.84 * p);
      capas.push(`<g class="p-vehiculo p-avion ${hitos.transporte ? 'confirmado' : ''}" transform="translate(${r(pt.x)} ${r(pt.y)}) rotate(${r(pt.ang)})">${ICONOS.avion}</g>`);
    }

    return `<svg class="paisaje paisaje-${transporte}" viewBox="0 0 800 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${capas.join('')}</svg>`;
  }

  return { svg, ICONOS };
})();
