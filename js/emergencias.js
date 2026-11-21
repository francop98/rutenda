/* =========================================================
   Rutenda — emergencias (en Archivos)
   Todo lo que necesitás si algo sale mal, también sin señal:
   números de emergencia de cada país, tu seguro de viaje,
   el consulado argentino y tu contacto de emergencia.
   ========================================================= */
window.R = window.R || {};

R.emergencias = (function () {
  const U = R.util;
  const { esc } = U;

  // Números de emergencia por país (los más usados por viajeros argentinos)
  const N911 = [['Emergencias', '911']];
  const N112 = [['Emergencias', '112']];
  const NUMEROS = {
    AR: [['Policía', '911'], ['Emergencias médicas (SAME)', '107'], ['Bomberos', '100']],
    UY: N911, PY: N911, EC: N911, VE: N911, MX: N911, US: N911, CA: N911, PA: N911, CR: N911, DO: N911, SV: N911, PR: N911,
    CL: [['Ambulancia', '131'], ['Bomberos', '132'], ['Carabineros', '133']],
    BR: [['Polícia', '190'], ['Ambulância (SAMU)', '192'], ['Bombeiros', '193']],
    BO: [['Policía', '110'], ['Ambulancia', '118'], ['Bomberos', '119']],
    PE: [['Policía', '105'], ['Ambulancia (SAMU)', '106'], ['Bomberos', '116']],
    CO: [['Emergencias', '123']],
    CU: [['Ambulancia', '104'], ['Bomberos', '105'], ['Policía', '106']],
    GB: [['Emergencias', '999'], ['También', '112']],
    AU: [['Emergencias', '000']],
    NZ: [['Emergencias', '111']],
    JP: [['Policía', '110'], ['Ambulancia y bomberos', '119']],
    CN: [['Policía', '110'], ['Ambulancia', '120'], ['Bomberos', '119']],
    KR: [['Policía', '112'], ['Ambulancia y bomberos', '119']],
    TH: [['Policía', '191'], ['Policía turística', '1155'], ['Ambulancia', '1669']],
    IN: N112, TR: N112, RU: N112,
    IL: [['Policía', '100'], ['Ambulancia', '101'], ['Bomberos', '102']],
    AE: [['Policía', '999'], ['Ambulancia', '998']],
    EG: [['Policía', '122'], ['Ambulancia', '123']],
    ZA: [['Policía', '10111'], ['Ambulancia', '10177'], ['Desde el celular', '112']]
  };
  // Europa: 112 en todos los países de la UE y del espacio Schengen
  ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IS', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'AD', 'MC', 'SM', 'VA']
    .forEach(c => { if (!NUMEROS[c]) NUMEROS[c] = N112; });

  const tel = n => 'tel:' + String(n || '').replace(/[^+\d]/g, '');

  /**
   * El país donde estás hoy (si el viaje está en curso), según el itinerario: el destino de ese día.
   * Así Ayuda pone primero lo de ese país.
   */
  function paisHoy(v) {
    const hoy = U.hoyISO();
    if (!v.fechaInicio || hoy < v.fechaInicio || (v.fechaFin && hoy > v.fechaFin) || v.finalizado) return '';
    const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const ciudad = R.itinerario && R.itinerario.ciudadDe ? R.itinerario.ciudadDe(v, hoy) : '';
    const d = (v.destinos || []).find(x => x.codigoPais && norm(x.nombre) === norm(ciudad));
    return d ? d.codigoPais : '';
  }
  /** Países del viaje (sin repetir), con nombre; el de hoy, primero. */
  function paises(v) {
    const vistos = new Map();
    (v.destinos || []).filter(d => d.nombre && d.codigoPais).forEach(d => { if (!vistos.has(d.codigoPais)) vistos.set(d.codigoPais, d.pais || d.codigoPais); });
    const hoy = paisHoy(v);
    return Array.from(vistos.entries()).map(([codigo, nombre]) => ({ codigo, nombre, hoy: codigo === hoy }))
      .sort((a, b) => (b.hoy ? 1 : 0) - (a.hoy ? 1 : 0));
  }
  function internacional(v) { return !!(v.perfil && v.perfil.internacional) || (v.destinos || []).some(d => d.codigoPais && d.codigoPais !== 'AR'); }

  function datos(v) { return Object.assign({ consulado: '', consuladoNota: '' }, v.emergencias || {}); }
  /** El seguro: el que cargaste acá o el de la versión anterior. */
  function seguro(v) {
    const e = (v.emergencias || {}).seguro;
    if (e && (e.compania || e.telefono || e.poliza)) return e;
    const viejo = ((v.tareas || {}).p_seguro || {}).datos;
    return viejo && (viejo.compania || viejo.telefono) ? viejo : null;
  }
  function contacto() { return Object.assign({ nombre: '', telefono: '' }, R.db.prefs().contactoEmergencia || {}); }

  function html(v) {
    const ps = paises(v);
    const seg = seguro(v);
    const d = datos(v);
    const c = contacto();
    const inter = internacional(v);
    const fila = (titulo, cuerpo) => `<div class="em-fila"><h4>${titulo}</h4>${cuerpo}</div>`;
    const botonesTel = lista => `<div class="em-numeros">${lista.map(([n, num]) => `<a class="em-num" href="${tel(num)}"><strong>${esc(num)}</strong><small>${esc(n)}</small></a>`).join('')}</div>`;

    const partes = [];
    // 1) Números de cada país
    if (ps.length) {
      partes.push(fila('📞 Números de emergencia', ps.map(p => `
        ${ps.length > 1 || p.codigo !== 'AR' ? `<small class="em-pais">${R.lugares.bandera(p.codigo) || ''} ${esc(p.nombre)}${p.hoy ? ' <b class="em-hoy">📍 Estás acá</b>' : ''}</small>` : ''}
        ${NUMEROS[p.codigo] ? botonesTel(NUMEROS[p.codigo]) : `<p class="texto-suave">Desde el celular, el 112 funciona en la mayoría de los países (en América, probá el 911).</p>`}`).join('')));
    }
    // 2) Seguro
    partes.push(fila('🛡️ Seguro de viaje', seg ? `
      <p><strong>${esc(seg.compania || 'Seguro')}</strong>${seg.poliza ? ` · N° ${esc(seg.poliza)}` : ''}</p>
      ${seg.telefono ? `<a class="btn btn-primario btn-chico" href="${tel(seg.telefono)}">📞 Llamar a asistencia · ${esc(seg.telefono)}</a>` : ''}`
      : '<p class="texto-suave">Si tenés seguro, cargá el teléfono de asistencia y queda acá, a un toque.</p>'));
    // 3) Consulado argentino (si salís del país)
    if (inter) {
      const destinoExt = ps.find(p => p.codigo !== 'AR');   // el de hoy va primero
      partes.push(fila('🇦🇷 Consulado argentino', `
        ${d.consulado ? `<a class="btn btn-suave btn-chico" href="${tel(d.consulado)}">📞 ${esc(d.consulado)}</a>` : ''}
        ${d.consuladoNota ? `<p class="texto-suave">${esc(d.consuladoNota)}</p>` : ''}
        ${destinoExt ? `<a class="btn-texto-mini" href="https://www.google.com/search?q=${encodeURIComponent('consulado argentino en ' + destinoExt.nombre + ' teléfono de guardia')}" target="_blank" rel="noopener">Buscar el consulado en ${esc(destinoExt.nombre)} →</a>` : ''}
        ${!d.consulado ? '<small class="ayuda">Guardá su teléfono de guardia por si perdés el pasaporte.</small>' : ''}`));
    }
    // 4) Tu contacto
    partes.push(fila('👤 Tu contacto de emergencia', c.telefono ? `
      <a class="btn btn-suave btn-chico" href="${tel(c.telefono)}">📞 ${esc(c.nombre || 'Contacto')} · ${esc(c.telefono)}</a>`
      : '<p class="texto-suave">Alguien a quien avisar si te pasa algo. Sirve para todos tus viajes.</p>'));

    return `
      <details class="bloque plegable emergencias" data-emergencias>
        <summary><div><h3 class="bloque-titulo">🆘 Emergencias</h3><small>${ps.some(p => p.hoy) && ps.length > 1 ? `Números de ${esc(ps[0].nombre)} (donde estás), seguro` : 'Números, seguro'}${inter ? ', consulado' : ''} y tu contacto</small></div></summary>
        <div class="plegable-cuerpo">
          ${partes.join('')}
          <button type="button" class="btn btn-texto btn-chico" data-a="emEditar">✏️ Editar contacto, seguro${inter ? ' y consulado' : ''}</button>
        </div>
      </details>`;
  }

  let abierto = false;
  function enlazar(cont, v, alCambiar) {
    const det = cont.querySelector('[data-emergencias]');
    if (!det) return;
    if (abierto) det.open = true;
    det.addEventListener('toggle', () => { abierto = det.open; });
    cont.querySelector('[data-a="emEditar"]').onclick = () => editar(v, alCambiar);
  }

  function editar(v, alCambiar) {
    const d = datos(v), c = contacto();
    const sg = seguro(v) || {};
    const org = R.db.puedeOrganizar(v);
    const inter = internacional(v);
    U.modal({
      titulo: 'Emergencias',
      cuerpo: `
        <h4 class="titulo-paso">👤 Tu contacto de emergencia</h4>
        <div class="grilla-2">
          <label class="campo"><span>Nombre</span><input id="emNombre" value="${esc(c.nombre)}" placeholder="Nombre"></label>
          <label class="campo"><span>Teléfono</span><input id="emTel" type="tel" inputmode="tel" value="${esc(c.telefono)}" placeholder="Teléfono con código de área"></label>
        </div>
        <small class="ayuda">Queda para todos tus viajes.</small>
        ${org ? `
        <h4 class="titulo-paso">🛡️ Seguro de viaje</h4>
        <div class="grilla-2">
          <label class="campo"><span>Compañía</span><input id="emSegComp" value="${esc(sg.compania || '')}" placeholder="Nombre de la compañía"></label>
          <label class="campo"><span>N° de póliza</span><input id="emSegPol" value="${esc(sg.poliza || '')}"></label>
        </div>
        <label class="campo"><span>Teléfono de asistencia</span><input id="emSegTel" type="tel" inputmode="tel" value="${esc(sg.telefono || '')}" placeholder="Teléfono con código de área"></label>` : ''}
        ${inter ? `
        <h4 class="titulo-paso">🇦🇷 Consulado argentino</h4>
        <label class="campo"><span>Teléfono de guardia</span><input id="emCons" type="tel" inputmode="tel" value="${esc(d.consulado)}" placeholder="Teléfono con código de país"></label>
        <label class="campo"><span>Dirección o nota <small>(opcional)</small></span><input id="emConsNota" value="${esc(d.consuladoNota)}"></label>` : ''}`,
      acciones: [{ texto: 'Cancelar' }, {
        texto: 'Guardar', clase: 'btn-primario', onClick: el => {
          const val = s => { const x = el.querySelector(s); return x ? x.value.trim() : ''; };
          R.db.guardarPrefs({ contactoEmergencia: { nombre: val('#emNombre'), telefono: val('#emTel') } });
          if (org) {
            v.emergencias = Object.assign({}, v.emergencias, { seguro: { compania: val('#emSegComp'), poliza: val('#emSegPol'), telefono: val('#emSegTel') } });
            if (inter) Object.assign(v.emergencias, { consulado: val('#emCons'), consuladoNota: val('#emConsNota') });
            R.db.guardarViaje(v);
          }
          abierto = true;
          U.toast('Guardado.');
          if (alCambiar) alCambiar(); else R.app.refrescar();
        }
      }]
    });
  }

  return { html, enlazar, NUMEROS, paises, paisHoy };
})();
