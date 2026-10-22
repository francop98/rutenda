/* =========================================================
   Rutenda — feriados y fines de semana largos (Argentina)
   Los datos vienen de /api/feriados (fuentes públicas y
   gratuitas) y se guardan en el dispositivo unos días.
   - Al cargar fechas: "Aprovechás el finde largo del…"
   - Sin fechas todavía: los próximos findes largos, para
     elegir uno con un toque.
   - En el itinerario: qué días son feriado en Argentina.
   ========================================================= */
window.R = window.R || {};

R.feriados = (function () {
  const U = R.util;
  const { esc } = U;
  const VIGENCIA_DIAS = 20;
  const memoria = {};   // { 2026: [ {fecha, nombre, tipo} ] }
  const pedidos = {};
  const fallidos = {};

  function leerGuardado(anio) {
    if (memoria[anio]) return memoria[anio];
    try {
      const x = JSON.parse(localStorage.getItem('rutenda_feriados_' + anio) || 'null');
      if (x && Array.isArray(x.lista) && Date.now() - x.t < VIGENCIA_DIAS * 86400000) { memoria[anio] = x.lista; return x.lista; }
    } catch (e) { /* sin almacenamiento */ }
    return null;
  }

  function cargarAnio(anio) {
    const ya = leerGuardado(anio);
    if (ya) return Promise.resolve(ya);
    if (fallidos[anio] && Date.now() - fallidos[anio] < 60000) return Promise.resolve([]);
    if (pedidos[anio]) return pedidos[anio];
    pedidos[anio] = fetch('/api/feriados?anio=' + anio)
      .then(r => (r.ok ? r.json() : null))
      .then(lista => {
        if (!Array.isArray(lista) || !lista.length) { fallidos[anio] = Date.now(); return []; }
        memoria[anio] = lista;
        try { localStorage.setItem('rutenda_feriados_' + anio, JSON.stringify({ t: Date.now(), lista })); } catch (e) { /* lleno */ }
        return lista;
      })
      .catch(() => { fallidos[anio] = Date.now(); return []; })
      .finally(() => { delete pedidos[anio]; });
    return pedidos[anio];
  }

  /** Feriados entre dos fechas (incluidas). */
  async function entre(desde, hasta) {
    const a = Number(desde.slice(0, 4)), b = Number(hasta.slice(0, 4));
    const anios = [];
    for (let x = a; x <= b; x++) anios.push(x);
    const listas = await Promise.all(anios.map(cargarAnio));
    return [].concat(...listas).filter(f => f.fecha >= desde && f.fecha <= hasta);
  }
  /** Igual que entre(), pero solo con lo que ya está guardado (sin esperar). */
  function entreGuardado(desde, hasta) {
    const a = Number(desde.slice(0, 4)), b = Number(hasta.slice(0, 4));
    const r = [];
    for (let x = a; x <= b; x++) { const l = leerGuardado(x); if (!l) return null; r.push(...l); }
    return r.filter(f => f.fecha >= desde && f.fecha <= hasta);
  }

  const esFinde = iso => { const d = U.aFecha(iso).getDay(); return d === 0 || d === 6; };

  /**
   * Días seguidos sin trabajar (sábados, domingos y feriados) de 3 o más días
   * que incluyen al menos un feriado. Devuelve [{ desde, hasta, dias, motivo }].
   */
  function findesLargos(feriados, desde, hasta) {
    const porFecha = {};
    feriados.forEach(f => { (porFecha[f.fecha] = porFecha[f.fecha] || []).push(f.nombre); });
    const libre = iso => esFinde(iso) || !!porFecha[iso];
    const r = [];
    // Arrancamos un par de días antes para no cortar un finde por la mitad
    let d = U.sumarDias(desde, -3);
    const fin = U.sumarDias(hasta, 3);
    while (d <= fin) {
      if (!libre(d)) { d = U.sumarDias(d, 1); continue; }
      const ini = d;
      const motivos = [];
      while (d <= fin && libre(d)) { if (porFecha[d]) motivos.push(...porFecha[d]); d = U.sumarDias(d, 1); }
      const ult = U.sumarDias(d, -1);
      const dias = U.diasEntre(ini, ult) + 1;
      if (dias >= 3 && motivos.length) r.push({ desde: ini, hasta: ult, dias, motivo: nombreCorto(motivos) });
    }
    return r.filter(x => x.hasta >= desde && x.desde <= hasta);
  }
  function nombreCorto(nombres) {
    const unicos = Array.from(new Set(nombres.filter(n => !/puente/i.test(n))));
    return (unicos.length ? unicos : ['Feriado puente']).join(' y ');
  }

  function rango(a, b) {
    return `${U.fmtFecha(a, 'dia')} al ${U.fmtFecha(b, 'dia')}`;
  }

  /** ¿Salís de Argentina? (si no sabemos, asumimos que sí: es una app argentina) */
  function aplica(origen) { return !origen || !origen.codigoPais || origen.codigoPais === 'AR'; }

  /** Próximos findes largos (a partir de mañana, dentro de un año). */
  async function proximos(n) {
    const hoy = U.hoyISO();
    const lista = await entre(U.sumarDias(hoy, -3), U.sumarDias(hoy, 370));
    return findesLargos(lista, U.sumarDias(hoy, 1), U.sumarDias(hoy, 365)).filter(x => x.desde > hoy).slice(0, n || 4);
  }

  /** Lo que pasa con los feriados durante un viaje: { findes, feriados } */
  async function delViaje(inicio, fin) {
    if (!inicio) return { findes: [], feriados: [] };
    const hasta = fin || inicio;
    const lista = await entre(U.sumarDias(inicio, -4), U.sumarDias(hasta, 4));
    return { findes: findesLargos(lista, inicio, hasta), feriados: lista.filter(f => f.fecha >= inicio && f.fecha <= hasta) };
  }

  /**
   * Aviso para el cronograma. Llena `caja` cuando llegan los datos.
   * alElegir(desde, hasta) se llama si tocás un finde largo (cuando todavía no hay fechas).
   */
  function pintarAviso(caja, inicio, fin, alElegir) {
    if (!caja) return;
    const firma = (inicio || '') + '|' + (fin || '');
    caja.dataset.firma = firma;
    const vigente = () => caja.isConnected && caja.dataset.firma === firma;
    if (inicio) {
      delViaje(inicio, fin).then(({ findes, feriados }) => {
        if (!vigente()) return;
        const partes = [];
        findes.forEach(f => partes.push(`🎉 Aprovechás el finde largo del ${esc(rango(f.desde, f.hasta))} (${esc(f.motivo)}).`));
        const sueltos = feriados.filter(x => !findes.some(f => x.fecha >= f.desde && x.fecha <= f.hasta) && !/puente/i.test(x.nombre));
        sueltos.forEach(x => partes.push(`📌 El ${esc(U.fmtFecha(x.fecha, 'dia'))} es feriado: ${esc(x.nombre)}.`));
        caja.innerHTML = partes.length ? `<div class="feriados-aviso">${partes.map(p => `<p>${p}</p>`).join('')}</div>` : '';
      });
      return;
    }
    proximos(4).then(lista => {
      if (!vigente()) return;
      if (!lista.length) { caja.innerHTML = ''; return; }
      caja.innerHTML = `
        <div class="feriados-aviso feriados-proximos">
          <p><strong>🎉 Próximos fines de semana largos</strong><small>Tocá uno y te pongo esas fechas.</small></p>
          <div class="chips-findes">${lista.map(f => `<button type="button" class="chip-finde" data-finde="${f.desde}|${f.hasta}"><strong>${esc(rango(f.desde, f.hasta))}</strong><small>${f.dias} días · ${esc(f.motivo)}</small></button>`).join('')}</div>
        </div>`;
      caja.querySelectorAll('[data-finde]').forEach(b => b.onclick = () => {
        const [d, h] = b.dataset.finde.split('|');
        if (alElegir) alElegir(d, h);
      });
    });
  }

  /** Nombre del feriado de una fecha, si ya está guardado (para el itinerario). */
  function deFecha(fecha) {
    const l = leerGuardado(Number(fecha.slice(0, 4)));
    const f = l && l.find(x => x.fecha === fecha);
    return f ? f.nombre : '';
  }

  return { cargarAnio, entre, entreGuardado, findesLargos, proximos, delViaje, pintarAviso, deFecha, aplica, rango };
})();
