/* =========================================================
   Rutenda — requisitos de entrada y recomendaciones de salud
   La app deduce sola qué documentación y qué vacunas
   corresponden según la nacionalidad del viajero y los
   destinos (incluidas las escapadas de un día).

   Datos para viajeros con documentación ARGENTINA, revisados
   el 19/10/2026. Los requisitos cambian: la app siempre
   muestra el enlace a la fuente oficial para confirmar.
   Para actualizar, editar las tablas de este archivo.
   ========================================================= */
window.R = window.R || {};

R.requisitos = (function () {
  const FUENTE_ENTRADA = 'https://cancilleria.gob.ar/es/servicios';
  const FUENTE_SALUD = 'https://cancilleria.gob.ar/es/servicios/alertas/fiebre-amarilla';
  const ACTUALIZADO = '19/10/2026';

  // Niveles, de menor a mayor exigencia
  const NIVELES = {
    nacional: { orden: 0, nombre: 'Viaje nacional' },
    dni: { orden: 1, nombre: 'DNI vigente' },
    pasaporte: { orden: 2, nombre: 'Pasaporte' },
    autorizacion: { orden: 3, nombre: 'Pasaporte + autorización electrónica' },
    visa: { orden: 4, nombre: 'Pasaporte + visa' },
    verificar: { orden: 5, nombre: 'Verificar' }
  };

  const SCHENGEN = ['AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'AD', 'MC', 'SM', 'VA'];
  const MERCOSUR_DNI = ['BR', 'UY', 'PY', 'CL', 'BO', 'PE', 'CO', 'EC'];

  /** Reglas para documentación argentina. nivel + nota + (opcional) tramite = nombre del trámite. */
  const REGLAS_AR = {};
  MERCOSUR_DNI.forEach(c => { REGLAS_AR[c] = { nivel: 'dni', nota: 'Con el DNI argentino vigente (tarjeta) alcanza. Los menores también necesitan su DNI.' }; });
  SCHENGEN.forEach(c => { REGLAS_AR[c] = { nivel: 'pasaporte', nota: 'Sin visa para turismo hasta 90 días (espacio Schengen). Pasaporte con al menos 3 meses de vigencia después de salir; pueden pedir seguro médico, reserva y fondos. El permiso ETIAS todavía no está en funcionamiento: revisalo antes de viajar.' }; });
  Object.assign(REGLAS_AR, {
    IE: { nivel: 'pasaporte', nota: 'Sin visa para turismo hasta 90 días.' },
    CY: { nivel: 'pasaporte', nota: 'Sin visa para turismo hasta 90 días.' },
    GB: { nivel: 'autorizacion', tramite: 'la ETA de Reino Unido', nota: 'Sin visa, pero desde 2025 se pide la autorización electrónica ETA antes de viajar (se tramita online).' },
    US: { nivel: 'visa', tramite: 'la visa de Estados Unidos', nota: 'Se necesita visa de turista (B1/B2) con entrevista en el consulado; los turnos pueden demorar. Argentina está en proceso de sumarse al programa sin visa (se estima para 2027).' },
    PR: { nivel: 'visa', tramite: 'la visa de Estados Unidos', nota: 'Puerto Rico aplica las reglas de Estados Unidos: visa B1/B2.' },
    CA: { nivel: 'visa', tramite: 'la visa o eTA de Canadá', nota: 'En general se pide visa. Si tenés visa de EE.UU. vigente o tuviste visa de Canadá en los últimos 10 años, para llegar en avión puede alcanzar con la eTA online.' },
    MX: { nivel: 'pasaporte', nota: 'Sin visa para turismo hasta 180 días.' },
    CR: { nivel: 'pasaporte', nota: 'Sin visa para turismo; pueden pedir pasaje de salida.' },
    PA: { nivel: 'pasaporte', nota: 'Sin visa para turismo.' },
    DO: { nivel: 'pasaporte', nota: 'Sin visa para turismo; completá el formulario electrónico e-Ticket antes de viajar.' },
    CU: { nivel: 'visa', tramite: 'la tarjeta de turista de Cuba', nota: 'Se necesita la tarjeta de turista (visa) y seguro médico obligatorio.' },
    VE: { nivel: 'verificar', nota: 'Con el acuerdo Mercosur alcanzaba el DNI, pero los servicios consulares están afectados. Consultá antes de viajar.' },
    GT: { nivel: 'pasaporte', nota: 'Sin visa para turismo.' },
    SV: { nivel: 'pasaporte', nota: 'Sin visa para turismo.' },
    HN: { nivel: 'pasaporte', nota: 'Sin visa para turismo.' },
    NI: { nivel: 'pasaporte', nota: 'Sin visa para turismo.' },
    JM: { nivel: 'pasaporte', nota: 'Sin visa para turismo.' },
    AW: { nivel: 'pasaporte', nota: 'Sin visa para turismo; formulario de embarque online (ED card).' },
    CW: { nivel: 'pasaporte', nota: 'Sin visa para turismo; formulario de embarque online (ED card).' },
    JP: { nivel: 'pasaporte', nota: 'Sin visa para turismo hasta 90 días.' },
    CN: { nivel: 'pasaporte', nota: 'Sin visa para estadías cortas (hasta 30 días) por una medida temporal vigente hasta el 31/12/2026. Después de esa fecha, verificar.' },
    KR: { nivel: 'verificar', nota: 'Sin visa, pero puede pedirse la autorización electrónica K-ETA según la fecha.' },
    TH: { nivel: 'pasaporte', nota: 'Sin visa para turismo; completá la tarjeta de arribo digital (TDAC) antes de llegar.' },
    AE: { nivel: 'pasaporte', nota: 'Sin visa para turismo.' },
    TR: { nivel: 'pasaporte', nota: 'Sin visa para turismo hasta 90 días.' },
    IL: { nivel: 'autorizacion', tramite: 'la ETA-IL de Israel', nota: 'Sin visa, pero se pide la autorización electrónica ETA-IL antes de viajar.' },
    EG: { nivel: 'visa', tramite: 'la visa de Egipto', nota: 'Se necesita visa (electrónica o al llegar).' },
    MA: { nivel: 'pasaporte', nota: 'Sin visa para turismo hasta 90 días.' },
    ZA: { nivel: 'pasaporte', nota: 'Sin visa para turismo hasta 90 días.' },
    IN: { nivel: 'visa', tramite: 'la e-Visa de India', nota: 'Se necesita visa (hay e-Visa de turismo).' },
    AU: { nivel: 'visa', tramite: 'la visa de Australia', nota: 'Se necesita visa de visitante (se tramita online).' },
    NZ: { nivel: 'autorizacion', tramite: 'la NZeTA de Nueva Zelanda', nota: 'Sin visa, pero se pide la autorización electrónica NZeTA.' }
  });

  /** Recomendaciones de salud por país y por provincia/estado (destinos con riesgo). */
  const SALUD = {
    regiones: [
      { pais: 'AR', regiones: ['Misiones', 'Corrientes'], fiebreAmarilla: true, dengue: true },
      { pais: 'AR', regiones: ['Salta', 'Jujuy', 'Formosa', 'Chaco', 'Tucumán', 'Santiago del Estero'], dengue: true }
    ],
    paises: {
      BR: { fiebreAmarilla: true, dengue: true, nota: 'Vacuna contra la fiebre amarilla recomendada para gran parte del país.' },
      BO: { fiebreAmarilla: true, dengue: true, nota: 'Fiebre amarilla recomendada para zonas tropicales (ej. Santa Cruz, Beni, Pando).' },
      PE: { fiebreAmarilla: true, dengue: true, nota: 'Fiebre amarilla recomendada para la Amazonía; no hace falta para Lima o Cusco ciudad.' },
      CO: { fiebreAmarilla: true, dengue: true, nota: 'Fiebre amarilla recomendada para varias regiones; no hace falta para Bogotá, Medellín o Cartagena.' },
      EC: { fiebreAmarilla: true, dengue: true, nota: 'Fiebre amarilla recomendada para la Amazonía; no hace falta para Quito, Guayaquil o Galápagos.' },
      VE: { fiebreAmarilla: true, dengue: true },
      PA: { fiebreAmarilla: true, dengue: true, nota: 'Fiebre amarilla recomendada para algunas zonas (Darién, comarcas).' },
      PY: { dengue: true },
      MX: { dengue: true }, CU: { dengue: true }, DO: { dengue: true }, CR: { dengue: true }, JM: { dengue: true },
      TH: { dengue: true }, IN: { dengue: true }
    }
  };

  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

  function nacionalidad() { const u = R.auth && R.auth.usuarioActual(); return (u && u.nacionalidad) || 'AR'; }

  /** Código de país del origen (o la nacionalidad si no se cargó). */
  function paisOrigen(v) { return (v.origen && v.origen.codigoPais) || nacionalidad(); }

  /** Analiza el viaje: requisitos por país visitado y recomendaciones de salud. */
  function analizar(v) {
    const nac = nacionalidad();
    const origen = paisOrigen(v);
    const destinos = (v.destinos || []).filter(d => d.nombre);
    const porPais = [];

    destinos.forEach(d => {
      const codigo = d.codigoPais || '';
      if (!codigo && !d.pais) return;
      if (codigo ? codigo === origen : normal(d.pais) === normal((v.origen || {}).pais)) return;
      if (porPais.some(p => (codigo && p.codigo === codigo) || (!codigo && normal(p.pais) === normal(d.pais)))) return;
      let regla = nac === 'AR' && codigo ? REGLAS_AR[codigo] : null;
      if (!regla) regla = { nivel: 'verificar', nota: nac === 'AR' ? 'Todavía no tengo los requisitos de este país: confirmalos en la fuente oficial.' : 'Por ahora Rutenda conoce los requisitos para documentación argentina. Confirmalos en el consulado del destino.' };
      porPais.push({ codigo, pais: d.pais || d.nombre, bandera: R.lugares ? R.lugares.bandera(codigo) : '', nivel: regla.nivel, nota: regla.nota, tramite: regla.tramite || '' });
    });

    const max = porPais.reduce((m, p) => NIVELES[p.nivel].orden > NIVELES[m].orden ? p.nivel : m, porPais.length ? 'dni' : 'nacional');
    const necesitaPasaporte = porPais.some(p => ['pasaporte', 'autorizacion', 'visa'].includes(p.nivel));
    const tramites = porPais.filter(p => p.nivel === 'visa' || p.nivel === 'autorizacion');
    const aVerificar = porPais.filter(p => p.nivel === 'verificar');

    // Salud
    const salud = [];
    let dengue = false;
    destinos.forEach(d => {
      const reg = SALUD.regiones.find(r => r.pais === d.codigoPais && r.regiones.some(x => normal(x) === normal(d.region)));
      const pais = SALUD.paises[d.codigoPais];
      const fuente = reg || pais;
      if (!fuente) return;
      if (fuente.dengue) dengue = true;
      if (fuente.fiebreAmarilla && !salud.some(s => s.lugar === d.nombre)) {
        salud.push({ lugar: d.nombre, region: d.region || d.pais, nota: (pais && pais.nota) || `Vacuna contra la fiebre amarilla recomendada para ${d.region || d.pais}.` });
      }
    });

    return {
      porPais, nivelMax: max, necesitaPasaporte, tramites, aVerificar,
      internacional: porPais.length > 0,
      fiebreAmarilla: salud, dengue,
      fuenteEntrada: FUENTE_ENTRADA, fuenteSalud: FUENTE_SALUD, actualizado: ACTUALIZADO
    };
  }

  /** Bloque HTML con los requisitos del viaje (guía y documentos). */
  function tarjeta(v, opciones) {
    const op = opciones || {};
    const esc = R.util.esc;
    const r = analizar(v);
    if (!r.porPais.length && !r.fiebreAmarilla.length && !r.dengue) {
      return op.siempre ? `<div class="bloque tarjeta-requisitos"><h4>🛂 Requisitos del viaje</h4><p class="texto-suave">Viaje nacional: no necesitás pasaporte ni visa. Llevá tu DNI vigente.</p></div>` : '';
    }
    const iconoNivel = { dni: '🪪', pasaporte: '📘', autorizacion: '📲', visa: '🛂', verificar: '❔' };
    return `
      <div class="bloque tarjeta-requisitos">
        <h4>🛂 Requisitos del viaje</h4>
        ${r.porPais.length ? `<ul class="lista-requisitos">${r.porPais.map(p => `
          <li><span class="req-pais">${p.bandera} ${esc(p.pais)}</span>
            <span class="req-nivel nivel-${p.nivel}">${iconoNivel[p.nivel]} ${esc(NIVELES[p.nivel].nombre)}</span>
            <small>${esc(p.nota)}</small></li>`).join('')}</ul>` : '<p class="texto-suave">No salís del país: alcanza con tu DNI vigente.</p>'}
        ${r.fiebreAmarilla.length || r.dengue ? `
          <h4 class="req-salud-titulo">🩺 Salud</h4>
          <ul class="lista-requisitos">
            ${r.fiebreAmarilla.map(s => `<li><span class="req-pais">💉 ${esc(s.lugar)}</span><small>${esc(s.nota)} Se aplica al menos 10 días antes de viajar.</small></li>`).join('')}
            ${r.dengue ? '<li><span class="req-pais">🦟 Dengue</span><small>Zona con dengue: llevá repelente y usalo todo el día.</small></li>' : ''}
          </ul>` : ''}
        <p class="req-fuente">Datos para documentación argentina, revisados el ${r.actualizado}. Confirmá siempre en la
          <a href="${r.fuenteEntrada}" target="_blank" rel="noopener">Cancillería</a> y en
          <a href="${r.fuenteSalud}" target="_blank" rel="noopener">alertas de salud</a>.</p>
      </div>`;
  }

  const NACIONALIDADES = [
    ['AR', 'Argentina'], ['UY', 'Uruguay'], ['CL', 'Chile'], ['BR', 'Brasil'], ['PY', 'Paraguay'], ['BO', 'Bolivia'],
    ['PE', 'Perú'], ['CO', 'Colombia'], ['VE', 'Venezuela'], ['MX', 'México'], ['ES', 'España'], ['IT', 'Italia'], ['OT', 'Otra']
  ];

  return { analizar, tarjeta, NIVELES, NACIONALIDADES, nacionalidad };
})();
