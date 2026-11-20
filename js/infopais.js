/* =========================================================
   Rutenda — Info práctica del país
   Enchufe, voltaje, de qué lado se maneja, propina e idioma
   de cada país del viaje. Datos fijos (funcionan sin señal),
   orientativos.
   ========================================================= */
window.R = window.R || {};

R.infoPais = (function () {
  const { esc } = R.util;
  // [idioma, enchufes, voltios, manejo (d/i), propina]
  const P = {
    AR: ['Español', 'I', 220, 'd', 'Alrededor del 10% en restaurantes'],
    UY: ['Español', 'C, F, I, L', 220, 'd', 'Alrededor del 10%'],
    CL: ['Español', 'C, L', 220, 'd', '10% (la cuenta suele traerla sugerida)'],
    BR: ['Portugués', 'N, C', '127 o 220 según la ciudad', 'd', 'El 10% de servicio suele venir en la cuenta'],
    PY: ['Español y guaraní', 'C', 220, 'd', 'Alrededor del 10%'],
    BO: ['Español', 'A, C', 230, 'd', 'Alrededor del 10%'],
    PE: ['Español', 'A, C', 220, 'd', 'Alrededor del 10%'],
    CO: ['Español', 'A, B', 110, 'd', '10% (suele venir sugerida en la cuenta)'],
    EC: ['Español', 'A, B', 120, 'd', 'El 10% de servicio suele venir incluido'],
    VE: ['Español', 'A, B', 120, 'd', 'Alrededor del 10%'],
    MX: ['Español', 'A, B', 127, 'd', 'Entre 10% y 15%'],
    CU: ['Español', 'A, B, C, L', '110 o 220', 'd', 'Alrededor del 10%'],
    DO: ['Español', 'A, B', 120, 'd', 'Viene un 10% incluido; se suele dejar algo más'],
    PA: ['Español', 'A, B', 120, 'd', 'Alrededor del 10%'],
    CR: ['Español', 'A, B', 120, 'd', 'El 10% de servicio viene incluido'],
    PR: ['Español e inglés', 'A, B', 120, 'd', 'Entre 15% y 20%'],
    AW: ['Neerlandés y papiamento', 'A, B, F', 127, 'd', 'Entre 10% y 15% (a veces viene incluida)'],
    CW: ['Neerlandés y papiamento', 'A, B', 127, 'd', 'Alrededor del 10%'],
    BS: ['Inglés', 'A, B', 120, 'i', 'Alrededor del 15%'],
    JM: ['Inglés', 'A, B', 110, 'i', 'Entre 10% y 15%'],
    US: ['Inglés', 'A, B', 120, 'd', 'Entre 15% y 20% en restaurantes: no viene incluida y se espera'],
    CA: ['Inglés y francés', 'A, B', 120, 'd', 'Entre 15% y 20% en restaurantes'],
    ES: ['Español', 'C, F', 230, 'd', 'No es obligatoria: se suele redondear'],
    PT: ['Portugués', 'C, F', 230, 'd', 'Opcional, entre 5% y 10%'],
    FR: ['Francés', 'C, E', 230, 'd', 'El servicio viene incluido; se suele redondear'],
    IT: ['Italiano', 'C, F, L', 230, 'd', 'Opcional (muchos lugares cobran "coperto" o servicio)'],
    DE: ['Alemán', 'C, F', 230, 'd', 'Se redondea, entre 5% y 10%'],
    GB: ['Inglés', 'G', 230, 'i', 'Entre 10% y 12,5% (a veces viene incluida)'],
    IE: ['Inglés e irlandés', 'G', 230, 'i', 'Entre 10% y 12,5%'],
    NL: ['Neerlandés', 'C, F', 230, 'd', 'Opcional, entre 5% y 10%'],
    BE: ['Francés y neerlandés', 'C, E', 230, 'd', 'El servicio viene incluido'],
    CH: ['Alemán, francés e italiano', 'C, J', 230, 'd', 'Viene incluida; se suele redondear'],
    AT: ['Alemán', 'C, F', 230, 'd', 'Se redondea, entre 5% y 10%'],
    GR: ['Griego', 'C, F', 230, 'd', 'Entre 5% y 10%'],
    TR: ['Turco', 'C, F', 230, 'd', 'Entre 5% y 10%'],
    CZ: ['Checo', 'C, E', 230, 'd', 'Alrededor del 10%'],
    HU: ['Húngaro', 'C, F', 230, 'd', 'Entre 10% y 15% (fijate si ya viene en la cuenta)'],
    PL: ['Polaco', 'C, E', 230, 'd', 'Alrededor del 10%'],
    HR: ['Croata', 'C, F', 230, 'd', 'Alrededor del 10%'],
    DK: ['Danés', 'C, E, F, K', 230, 'd', 'Viene incluida'],
    SE: ['Sueco', 'C, F', 230, 'd', 'Viene incluida; se suele redondear'],
    NO: ['Noruego', 'C, F', 230, 'd', 'Viene incluida; se suele redondear'],
    FI: ['Finés y sueco', 'C, F', 230, 'd', 'Viene incluida'],
    IS: ['Islandés', 'C, F', 230, 'd', 'Viene incluida'],
    MA: ['Árabe, bereber y francés', 'C, E', 220, 'd', 'Alrededor del 10%'],
    EG: ['Árabe', 'C, F', 220, 'd', 'Entre 10% y 15%'],
    ZA: ['Inglés y otros 11 idiomas', 'C, D, M, N', 230, 'i', 'Entre 10% y 15%'],
    AE: ['Árabe (el inglés se usa mucho)', 'G', 230, 'd', 'Entre 10% y 15%'],
    IL: ['Hebreo', 'C, H', 230, 'd', 'Entre 12% y 15%'],
    IN: ['Hindi e inglés', 'C, D, M', 230, 'i', 'Alrededor del 10%'],
    TH: ['Tailandés', 'A, B, C, O', 230, 'i', 'Opcional: se suele redondear'],
    VN: ['Vietnamita', 'A, C', 220, 'd', 'Opcional'],
    SG: ['Inglés, malayo, chino y tamil', 'G', 230, 'i', 'Viene un 10% de servicio incluido'],
    MY: ['Malayo', 'G', 240, 'i', 'Suele venir incluida'],
    ID: ['Indonesio', 'C, F', 230, 'i', 'Entre 5% y 10% (a veces viene incluida)'],
    PH: ['Filipino e inglés', 'A, B, C', 220, 'd', 'Alrededor del 10%'],
    JP: ['Japonés', 'A, B', 100, 'i', 'No se deja propina'],
    KR: ['Coreano', 'C, F', 220, 'd', 'No se acostumbra'],
    CN: ['Chino mandarín', 'A, C, I', 220, 'd', 'No se acostumbra'],
    HK: ['Cantonés e inglés', 'G', 220, 'i', 'Viene un 10% de servicio incluido'],
    AU: ['Inglés', 'I', 230, 'i', 'No es obligatoria'],
    NZ: ['Inglés y maorí', 'I', 230, 'i', 'No es obligatoria'],
    MV: ['Dhivehi (en los hoteles, inglés)', 'C, D, G', 230, 'i', 'Viene un 10% de servicio incluido']
  };
  const NOMBRES = { AR: 'Argentina', UY: 'Uruguay', CL: 'Chile', BR: 'Brasil', PY: 'Paraguay', BO: 'Bolivia', PE: 'Perú', CO: 'Colombia', EC: 'Ecuador', VE: 'Venezuela', MX: 'México', CU: 'Cuba', DO: 'República Dominicana', PA: 'Panamá', CR: 'Costa Rica', PR: 'Puerto Rico', AW: 'Aruba', CW: 'Curazao', BS: 'Bahamas', JM: 'Jamaica', US: 'Estados Unidos', CA: 'Canadá', ES: 'España', PT: 'Portugal', FR: 'Francia', IT: 'Italia', DE: 'Alemania', GB: 'Reino Unido', IE: 'Irlanda', NL: 'Países Bajos', BE: 'Bélgica', CH: 'Suiza', AT: 'Austria', GR: 'Grecia', TR: 'Turquía', CZ: 'Chequia', HU: 'Hungría', PL: 'Polonia', HR: 'Croacia', DK: 'Dinamarca', SE: 'Suecia', NO: 'Noruega', FI: 'Finlandia', IS: 'Islandia', MA: 'Marruecos', EG: 'Egipto', ZA: 'Sudáfrica', AE: 'Emiratos Árabes', IL: 'Israel', IN: 'India', TH: 'Tailandia', VN: 'Vietnam', SG: 'Singapur', MY: 'Malasia', ID: 'Indonesia', PH: 'Filipinas', JP: 'Japón', KR: 'Corea del Sur', CN: 'China', HK: 'Hong Kong', AU: 'Australia', NZ: 'Nueva Zelanda', MV: 'Maldivas' };

  const volt = x => typeof x === 'number' ? x : null;
  const casa = v => String((v.origen && (v.origen.codigoPais || v.origen.pais)) || 'AR').toUpperCase();

  /** Los países del viaje distintos del tuyo, con datos. */
  function paises(v) {
    const mio = casa(v);
    const r = [];
    (v.destinos || []).filter(d => d.nombre && !d.paso).forEach(d => {
      const c = String(d.codigoPais || d.pais || '').toUpperCase();
      if (c && c !== mio && P[c] && !r.includes(c)) r.push(c);
    });
    return r;
  }

  function html(v) {
    const ps = paises(v);
    if (!ps.length) return '';
    const mio = P[casa(v)];
    return `
      <section class="bloque ayuda-bloque">
        <h3 class="bloque-titulo">🌍 Info práctica</h3>
        ${ps.map(c => {
          const [idioma, enchufes, v2, manejo, propina] = P[c];
          const misEnchufes = mio ? mio[1].split(', ') : [];
          const adaptador = mio && !enchufes.split(', ').some(e => misEnchufes.includes(e));
          const vMio = mio ? volt(mio[2]) : null, vAlla = volt(v2);
          const ojoVolt = vMio && vAlla && Math.abs(vMio - vAlla) > 50;
          return `
          <div class="info-pais">
            <strong class="ip-pais">${esc(NOMBRES[c] || c)}</strong>
            <ul class="ip-lista">
              <li><span>🔌</span><span>Enchufe tipo ${esc(enchufes)} · ${esc(String(v2))} V${adaptador ? '<b class="ip-ojo">Llevá adaptador</b>' : ''}${ojoVolt ? `<small>Fijate que tus cargadores digan 100-240 V (casi todos los de celular lo dicen; secadores y planchitas, no siempre).</small>` : ''}</span></li>
              <li><span>🚗</span><span>Se maneja por la ${manejo === 'i' ? '<b>izquierda</b>' : 'derecha'}${manejo === 'i' ? '<small>Al cruzar la calle, mirá primero a la derecha.</small>' : ''}</span></li>
              <li><span>💁</span><span>Propina: ${esc(propina)}</span></li>
              <li><span>🗣️</span><span>${esc(idioma)}</span></li>
            </ul>
          </div>`;
        }).join('')}
        <p class="texto-suave ip-nota">Datos orientativos: pueden variar según el lugar.</p>
      </section>`;
  }

  return { html, paises };
})();
