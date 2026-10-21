/* =========================================================
   Rutenda — pestaña Gastos
   Gastos, ingresos (reintegros) y pagos entre viajeros.
   Divide en partes iguales o por montos, calcula saldos y
   la menor cantidad de transferencias para quedar a mano.
   ========================================================= */
window.R = window.R || {};

R.gastos = (function () {
  const U = R.util;
  const { esc } = U;

  const CATEGORIAS = [
    { id: 'transporte', nombre: 'Transporte', icono: '✈️' },
    { id: 'alojamiento', nombre: 'Alojamiento', icono: '🏡' },
    { id: 'comida', nombre: 'Comidas', icono: '🍽️' },
    { id: 'actividades', nombre: 'Actividades', icono: '🌄' },
    { id: 'paquete', nombre: 'Paquete', icono: '📦' },
    { id: 'seguros', nombre: 'Seguros', icono: '🛡️' },
    { id: 'compras', nombre: 'Compras', icono: '🛍️' },
    { id: 'otros', nombre: 'Otros', icono: '📌' }
  ];
  /** Categorías base + las que creó el usuario. */
  function categorias() { return CATEGORIAS.concat((R.db.prefs().categoriasGasto || [])); }
  function categoria(id) { return categorias().find(c => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1]; }
  function crearCategoria(nombreCat, icono) {
    const lista = (R.db.prefs().categoriasGasto || []).slice();
    const c = { id: U.id('cat'), nombre: nombreCat.trim(), icono: (icono || '').trim() || '🏷️', propia: true };
    lista.push(c);
    R.db.guardarPrefs({ categoriasGasto: lista });
    return c;
  }
  function nombre(id) { const p = R.db.persona(id); return p ? p.nombre : 'Alguien'; }

  /* ---------- Cálculos ---------- */
  function factor(v, m) { return m.moneda && m.moneda !== v.monedaBase ? (U.numero(m.cotizacion) || 1) : 1; }
  function montoBase(v, m) { return U.numero(m.monto) * factor(v, m); }

  /** Devuelve { personaId: parte en moneda base } */
  function partes(v, m) {
    const r = {};
    const entre = (m.division && m.division.entre) || [];
    if (!entre.length) return r;
    if (m.division.modo === 'montos') {
      entre.forEach(id => { r[id] = U.numero((m.division.montos || {})[id]) * factor(v, m); });
    } else if (m.division.modo === 'porcentajes') {
      entre.forEach(id => { r[id] = montoBase(v, m) * U.numero((m.division.porcentajes || {})[id]) / 100; });
    } else {
      const cada = montoBase(v, m) / entre.length;
      entre.forEach(id => { r[id] = cada; });
    }
    return r;
  }

  /** Saldo por persona: positivo = le deben; negativo = debe. */
  function saldos(v) {
    const s = {};
    v.participantes.forEach(p => { s[p] = 0; });
    v.movimientos.forEach(m => {
      const mb = montoBase(v, m);
      if (m.tipo === 'pago') {
        s[m.persona] = (s[m.persona] || 0) + mb;
        s[m.para] = (s[m.para] || 0) - mb;
        return;
      }
      const ps = partes(v, m);
      if (m.tipo === 'gasto') {
        s[m.persona] = (s[m.persona] || 0) + mb;
        Object.entries(ps).forEach(([id, x]) => { s[id] = (s[id] || 0) - x; });
      } else if (m.tipo === 'ingreso') {
        s[m.persona] = (s[m.persona] || 0) - mb;
        Object.entries(ps).forEach(([id, x]) => { s[id] = (s[id] || 0) + x; });
      }
    });
    Object.keys(s).forEach(k => { s[k] = U.redondear(s[k]); });
    return s;
  }

  /** Mínimas transferencias para saldar (algoritmo goloso). */
  function transferencias(s) {
    const deudores = Object.entries(s).filter(([, x]) => x < -0.009).map(([id, x]) => ({ id, x: -x })).sort((a, b) => b.x - a.x);
    const acreedores = Object.entries(s).filter(([, x]) => x > 0.009).map(([id, x]) => ({ id, x })).sort((a, b) => b.x - a.x);
    const r = [];
    let i = 0, j = 0;
    while (i < deudores.length && j < acreedores.length) {
      const monto = Math.min(deudores[i].x, acreedores[j].x);
      if (monto > 0.009) r.push({ de: deudores[i].id, para: acreedores[j].id, monto: U.redondear(monto) });
      deudores[i].x -= monto;
      acreedores[j].x -= monto;
      if (deudores[i].x < 0.01) i++;
      if (acreedores[j].x < 0.01) j++;
    }
    return r;
  }

  function totales(v) {
    let gastado = 0, ingresado = 0, antes = 0, durante = 0;
    const porCategoria = {};
    v.movimientos.forEach(m => {
      const mb = montoBase(v, m);
      const signo = m.tipo === 'gasto' ? 1 : m.tipo === 'ingreso' ? -1 : 0;
      if (m.tipo === 'gasto') { gastado += mb; porCategoria[m.categoria] = (porCategoria[m.categoria] || 0) + mb; }
      if (m.tipo === 'ingreso') ingresado += mb;
      // Antes del viaje (reservas, pasajes) o durante
      if (signo) { if (v.fechaInicio && m.fecha && m.fecha < v.fechaInicio) antes += signo * mb; else durante += signo * mb; }
    });
    return { gastado, ingresado, neto: gastado - ingresado, porCategoria, antes, durante };
  }

  function personaTieneMovimientos(v, id) {
    return v.movimientos.some(m => m.persona === id || m.para === id || ((m.division && m.division.entre) || []).includes(id));
  }

  /** Lo que le corresponde a una persona (para el historial de compañeros). */
  function parteDe(v, id) {
    let total = 0;
    v.movimientos.forEach(m => {
      if (m.tipo === 'pago') return;
      const x = partes(v, m)[id] || 0;
      total += m.tipo === 'gasto' ? x : -x;
    });
    return total;
  }

  /* ---------- Vista ---------- */
  // Categorías para cargar rápido durante el viaje
  const RAPIDAS = ['comida', 'transporte', 'actividades', 'compras', 'otros'];
  let vistaGastos = (() => { try { return localStorage.getItem('rutenda_vista_gastos') || 'movimientos'; } catch (e) { return 'movimientos'; } })();
  let filtroPersona = 'todos';

  function monedaSugerida(v) {
    const ult = v.movimientos.filter(m => m.tipo === 'gasto' && m.moneda).sort((a, b) => (b.creado || '').localeCompare(a.creado || ''))[0];
    return ult ? ult.moneda : v.monedaBase;
  }

  /** Gastos agrupados por día (y "antes del viaje"). */
  function porDia(v, movs) {
    const grupos = [];
    const hoy = U.hoyISO();
    movs.forEach(m => {
      const antes = v.fechaInicio && m.fecha && m.fecha < v.fechaInicio;
      const clave = antes ? 'antes' : (m.fecha || 'sin');
      let g = grupos.find(x => x.clave === clave);
      if (!g) {
        const dia = !antes && v.fechaInicio && m.fecha ? U.diasEntre(v.fechaInicio, m.fecha) + 1 : null;
        const titulo = antes ? 'Antes del viaje' : m.fecha === hoy ? 'Hoy' : m.fecha === U.sumarDias(hoy, -1) ? 'Ayer' : U.fmtFecha(m.fecha, 'dia');
        g = { clave, titulo, dia: dia && (!v.fechaFin || m.fecha <= v.fechaFin) ? dia : null, movs: [], total: 0 };
        grupos.push(g);
      }
      g.movs.push(m);
      if (m.tipo === 'gasto') g.total += montoBase(v, m);
      if (m.tipo === 'ingreso') g.total -= montoBase(v, m);
    });
    return grupos;
  }

  function render(v, cont) {
    const t = totales(v);
    const s = saldos(v);
    const tr = transferencias(s);
    const hoy = U.hoyISO();
    const yo = R.db.yoEn(v);
    const variosViajeros = v.participantes.length > 1;
    const enCurso = R.viajes.estadoViaje(v) === 'en_curso';
    const pres = U.numero(v.presupuesto);
    const pctPres = pres ? Math.round((t.neto / pres) * 100) : 0;
    const hoyTotal = v.movimientos.filter(m => m.fecha === hoy).reduce((a, m) => a + (m.tipo === 'gasto' ? montoBase(v, m) : m.tipo === 'ingreso' ? -montoBase(v, m) : 0), 0);
    const diasCorridos = v.fechaInicio && hoy >= v.fechaInicio ? Math.min(U.diasEntre(v.fechaInicio, v.fechaFin && hoy > v.fechaFin ? v.fechaFin : hoy) + 1, 365) : 0;
    const promedioDia = diasCorridos ? t.durante / diasCorridos : 0;
    const miParte = parteDe(v, yo);
    const miSaldo = s[yo] || 0;
    if (!['movimientos', 'cuentas', 'resumen'].includes(vistaGastos)) vistaGastos = 'movimientos';

    cont.innerHTML = `
      <section class="gastos-hero">
        <div class="gh-fila">
          <div>
            <small>${t.ingresado ? 'Costo neto del viaje' : 'Gastado en el viaje'}</small>
            <strong class="gh-total">${U.fmtMoneda(t.neto, v.monedaBase)}</strong>
            ${t.ingresado ? `<span class="gh-sub">↓ ${U.fmtMoneda(t.gastado, v.monedaBase)} en gastos · ↑ ${U.fmtMoneda(t.ingresado, v.monedaBase)} en ingresos y reintegros</span>` : ''}
            ${t.antes && t.durante ? `<span class="gh-sub">${U.fmtMoneda(t.antes, v.monedaBase)} antes · ${U.fmtMoneda(t.durante, v.monedaBase)} durante</span>` : ''}
          </div>
          ${enCurso ? `<div class="gh-hoy"><small>Hoy</small><strong>${U.fmtMoneda(hoyTotal, v.monedaBase)}</strong>${promedioDia ? `<span>Promedio ${U.fmtMoneda(promedioDia, v.monedaBase)}/día</span>` : ''}</div>` : ''}
        </div>
        <div class="gh-datos">
          ${variosViajeros ? `<span><small>Tu parte</small><strong>${U.fmtMoneda(miParte, v.monedaBase)}</strong></span>
          <span class="${miSaldo > 0.009 ? 'positivo' : miSaldo < -0.009 ? 'negativo' : ''}"><small>Tu saldo</small><strong>${miSaldo > 0.009 ? 'Te deben ' + U.fmtMoneda(miSaldo, v.monedaBase) : miSaldo < -0.009 ? 'Debés ' + U.fmtMoneda(-miSaldo, v.monedaBase) : 'A mano ✓'}</strong></span>` : ''}
          <span class="gh-pres"><small>Presupuesto <button class="btn-texto-mini solo-org" data-a="presupuesto">${pres ? 'Editar' : 'Definir'}</button></small>
            ${pres ? `<strong>${pctPres}% usado</strong><span class="barra-progreso ${pctPres > 100 ? 'excedido' : ''}"><span style="width:${Math.min(100, pctPres)}%"></span></span>` : '<strong class="gh-opcional">Opcional</strong>'}
          </span>
        </div>
      </section>

      <section class="gastos-rapido">
        <div class="gr-botones">
          <button class="btn btn-primario btn-grande gr-gasto" data-a="gasto"><span class="gr-signo">−</span> Gasto</button>
          <button class="btn btn-grande gr-ingreso" data-a="ingreso"><span class="gr-signo">+</span> Ingreso / reintegro</button>
        </div>
        <div class="gr-cab"><small>Gasto rápido por categoría</small><button class="btn-texto-mini" data-a="categorias">🏷️ Crear o editar categorías</button></div>
        <div class="gr-chips">${RAPIDAS.map(id => { const c = categoria(id); return `<button class="gr-chip" data-rapido-cat="${id}"><span>${c.icono}</span>${esc(c.nombre)}</button>`; }).join('')}
          <button class="gr-chip gr-chip-nueva" data-a="categorias"><span>＋</span>Categoría</button></div>
      </section>

      <div class="segmentado segmentado-gastos" role="tablist">
        <button type="button" data-vista-gastos="movimientos" class="${vistaGastos === 'movimientos' ? 'activo' : ''}">Movimientos</button>
        <button type="button" data-vista-gastos="cuentas" class="${vistaGastos === 'cuentas' ? 'activo' : ''}">Cuentas${variosViajeros && tr.length ? ` <i class="punto-aviso">${tr.length}</i>` : ''}</button>
        <button type="button" data-vista-gastos="resumen" class="${vistaGastos === 'resumen' ? 'activo' : ''}">Resumen</button>
      </div>
      <div id="vistaGastos">${vistaGastos === 'cuentas' ? cuentasHTML(v, s, tr) : vistaGastos === 'resumen' ? resumenHTML(v, t) : movimientosHTML(v)}</div>`;

    cont.querySelector('[data-a="gasto"]').onclick = () => editar(v, null, 'gasto');
    cont.querySelectorAll('[data-rapido-cat]').forEach(b => b.onclick = () => editar(v, null, 'gasto', { categoria: b.dataset.rapidoCat }));
    const bPres = cont.querySelector('[data-a="presupuesto"]');
    if (bPres) bPres.onclick = () => editarPresupuesto(v);
    cont.querySelectorAll('[data-vista-gastos]').forEach(b => b.onclick = () => {
      vistaGastos = b.dataset.vistaGastos;
      try { localStorage.setItem('rutenda_vista_gastos', vistaGastos); } catch (e) { /* nada */ }
      render(v, cont);
    });
    cont.querySelectorAll('[data-filtro-persona]').forEach(b => b.onclick = () => { filtroPersona = b.dataset.filtroPersona; render(v, cont); });
    cont.querySelectorAll('[data-a="categorias"]').forEach(b => b.onclick = () => administrarCategorias());
    cont.querySelectorAll('[data-a="ingreso"]').forEach(b => b.onclick = () => editar(v, null, 'ingreso'));
    cont.querySelectorAll('[data-mov]').forEach(b => b.onclick = () => editar(v, b.dataset.mov));
    cont.querySelectorAll('[data-saldar]').forEach(b => b.onclick = () => registrarPago(v, tr[Number(b.dataset.saldar)]));
  }

  function movimientosHTML(v) {
    const yo = R.db.yoEn(v);
    let movs = v.movimientos.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || '').localeCompare(a.creado || ''));
    if (filtroPersona === 'yo') movs = movs.filter(m => m.persona === yo || m.para === yo);
    else if (filtroPersona !== 'todos') movs = movs.filter(m => m.persona === filtroPersona || m.para === filtroPersona);
    const grupos = porDia(v, movs);
    return `
      <div class="gastos-filtros">
        ${v.participantes.length > 1 ? `<div class="chips-filtro">
          <button class="${filtroPersona === 'todos' ? 'activo' : ''}" data-filtro-persona="todos">Todos</button>
          <button class="${filtroPersona === 'yo' ? 'activo' : ''}" data-filtro-persona="yo">Pagué yo</button>
          ${v.participantes.filter(p => p !== yo).map(p => `<button class="${filtroPersona === p ? 'activo' : ''}" data-filtro-persona="${p}">${esc(nombre(p))}</button>`).join('')}
        </div>` : '<span></span>'}
      </div>
      ${grupos.length ? grupos.map(g => `
        <section class="bloque dia-gastos">
          <header class="dg-cab"><strong>${esc(g.titulo)}${g.dia ? ` <small>· Día ${g.dia}</small>` : ''}</strong><span>${U.fmtMoneda(g.total, v.monedaBase)}</span></header>
          <div class="lista-movs">${g.movs.map(m => filaMovimiento(v, m)).join('')}</div>
        </section>`).join('') : `
        <div class="bloque vacio vacio-chico">
          <div class="vacio-icono">💸</div>
          <p>${filtroPersona === 'todos' ? 'Cargá cada gasto (lo que sale) y cada ingreso o reintegro (lo que vuelve), con quién lo pagó o lo recibió y entre quiénes se divide. Rutenda hace las cuentas.' : 'No hay movimientos con este filtro.'}</p>
        </div>`}`;
  }

  function cuentasHTML(v, s, tr) {
    if (v.participantes.length < 2) return '<div class="bloque"><p class="texto-suave">Viajás solo/a: no hay cuentas para dividir.</p></div>';
    const pagado = {};
    v.participantes.forEach(p => { pagado[p] = 0; });
    v.movimientos.forEach(m => { if (m.tipo === 'gasto') pagado[m.persona] = (pagado[m.persona] || 0) + montoBase(v, m); });
    return `
      <div class="bloque">
        <h3 class="bloque-titulo">Para quedar a mano</h3>
        ${tr.length ? `<div class="lista-transfer">${tr.map((x, i) => `
          <div class="transfer">
            <span class="tr-quien">${U.avatar(R.db.persona(x.de), 28)} <strong>${esc(nombre(x.de))}</strong> <span class="tr-flecha">le paga a</span> ${U.avatar(R.db.persona(x.para), 28)} <strong>${esc(nombre(x.para))}</strong></span>
            <span class="transfer-monto">${U.fmtMoneda(x.monto, v.monedaBase)}</span>
            <button class="btn btn-suave btn-chico" data-saldar="${i}">Ya pagó ✓</button>
          </div>`).join('')}</div>` : `<p class="texto-suave">${v.movimientos.length ? 'Todos están a mano. 🙌' : 'Cuando haya gastos, acá ves quién le debe a quién.'}</p>`}
      </div>
      <div class="bloque">
        <h3 class="bloque-titulo">Cada uno</h3>
        <div class="tabla-personas">
          <div class="tp-fila tp-cab"><span></span><span>Pagó</span><span>Le toca</span><span>Saldo</span></div>
          ${v.participantes.map(id => {
            const x = s[id] || 0;
            return `<div class="tp-fila">
              <span class="tp-nombre">${U.avatar(R.db.persona(id), 26)} ${esc(nombre(id))}</span>
              <span>${U.fmtMoneda(pagado[id] || 0, v.monedaBase)}</span>
              <span>${U.fmtMoneda(parteDe(v, id), v.monedaBase)}</span>
              <span class="${x > 0.009 ? 'positivo' : x < -0.009 ? 'negativo' : ''}">${Math.abs(x) > 0.009 ? (x > 0 ? '+' : '−') + U.fmtMoneda(Math.abs(x), v.monedaBase) : '✓'}</span>
            </div>`;
          }).join('')}
        </div>
        <p class="ayuda">"Pagó" es lo que puso de su bolsillo; "le toca" es su parte de los gastos.</p>
      </div>`;
  }

  function resumenHTML(v, t) {
    const maxCat = Math.max(1, ...Object.values(t.porCategoria));
    // Por día del viaje
    const dias = R.itinerario.diasDelViaje(v);
    const porFecha = {};
    v.movimientos.forEach(m => { if (m.tipo === 'gasto' && m.fecha) porFecha[m.fecha] = (porFecha[m.fecha] || 0) + montoBase(v, m); });
    const maxDia = Math.max(1, ...dias.map(f => porFecha[f] || 0));
    // Por moneda
    const porMoneda = {};
    v.movimientos.filter(m => m.tipo === 'gasto').forEach(m => { porMoneda[m.moneda] = (porMoneda[m.moneda] || 0) + U.numero(m.monto); });
    return `
      <div class="bloque">
        <h3 class="bloque-titulo">Por categoría</h3>
        ${Object.keys(t.porCategoria).length ? `<div class="barras">${categorias().filter(c => t.porCategoria[c.id]).sort((a, b) => t.porCategoria[b.id] - t.porCategoria[a.id]).map(c => `
          <div class="barra-cat">
            <span class="bc-nombre">${c.icono} ${esc(c.nombre)}</span>
            <span class="bc-barra"><span style="width:${Math.round((t.porCategoria[c.id] / maxCat) * 100)}%"></span></span>
            <span class="bc-monto">${U.fmtMoneda(t.porCategoria[c.id], v.monedaBase)}</span>
          </div>`).join('')}</div>` : '<p class="texto-suave">Cuando cargues gastos, acá vas a ver en qué se va la plata.</p>'}
        <button class="btn btn-texto btn-chico" data-a="categorias">🏷️ Administrar categorías</button>
      </div>
      ${dias.length && Object.keys(porFecha).some(f => dias.includes(f)) ? `
      <div class="bloque">
        <h3 class="bloque-titulo">Día por día</h3>
        <div class="barras-dias">${dias.map((f, i) => `
          <div class="bd-dia ${f === U.hoyISO() ? 'hoy' : ''}" title="${U.fmtFecha(f, 'dia')}: ${U.fmtMoneda(porFecha[f] || 0, v.monedaBase)}">
            <span class="bd-barra"><span style="height:${Math.round(((porFecha[f] || 0) / maxDia) * 100)}%"></span></span>
            <small>${i + 1}</small>
          </div>`).join('')}</div>
        <p class="ayuda">Gasto de cada día del viaje (en ${esc(v.monedaBase)}).</p>
      </div>` : ''}
      ${Object.keys(porMoneda).length > 1 ? `
      <div class="bloque">
        <h3 class="bloque-titulo">Por moneda</h3>
        <div class="lista-monedas">${Object.entries(porMoneda).map(([mon, x]) => `<span class="chip">${U.fmtMoneda(x, mon)}</span>`).join('')}</div>
      </div>` : ''}`;
  }

  /** Crear y borrar categorías propias (sirven para todos tus viajes). */
  function administrarCategorias() {
    const propias = R.db.prefs().categoriasGasto || [];
    const { el } = U.modal({
      titulo: 'Categorías de gastos',
      subtitulo: 'Las que crees sirven para todos tus viajes.',
      cuerpo: `
        <div class="chips-elegir">${CATEGORIAS.map(c => `<span class="chip-op">${c.icono} ${esc(c.nombre)}</span>`).join('')}
          ${propias.map(c => `<span class="chip-op chip-propia">${c.icono} ${esc(c.nombre)} <button type="button" data-borrar-cat="${c.id}" aria-label="Borrar">×</button></span>`).join('')}</div>
        <div class="fila-agregar"><input id="cIcono" class="input-emoji" maxlength="2" placeholder="🏷️"><input id="cNombre" placeholder="Nueva categoría (ej: Regalos)"><button type="button" class="btn btn-primario" data-a="crear">Crear</button></div>`,
      acciones: [{ texto: 'Listo', clase: 'btn-primario', onClick: () => { R.app.refrescar(); } }]
    });
    el.querySelector('[data-a="crear"]').onclick = () => {
      const n = el.querySelector('#cNombre').value.trim();
      if (!n) return;
      crearCategoria(n, el.querySelector('#cIcono').value);
      administrarCategorias();
    };
    el.querySelectorAll('[data-borrar-cat]').forEach(b => b.onclick = () => {
      R.db.guardarPrefs({ categoriasGasto: (R.db.prefs().categoriasGasto || []).filter(c => c.id !== b.dataset.borrarCat) });
      administrarCategorias();
    });
  }

  /** Presupuesto (opcional) y moneda principal del viaje. */
  function editarPresupuesto(v) {
    const conMovs = v.movimientos.length > 0;
    U.modal({
      titulo: 'Presupuesto y moneda',
      subtitulo: 'Es opcional: sirve para ver cuánto te queda.',
      cuerpo: `
        <div class="grilla-2">
          <label class="campo"><span>Presupuesto total</span><input id="gPres" inputmode="decimal" value="${esc(v.presupuesto || '')}" placeholder="Sin tope"></label>
          <label class="campo"><span>Moneda principal</span><select id="gMoneda" ${conMovs ? 'disabled' : ''}>${U.opcionesMoneda(v.monedaBase)}</select></label>
        </div>
        ${conMovs ? '<p class="ayuda">La moneda principal no se puede cambiar cuando ya hay gastos cargados.</p>' : ''}`,
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Guardar', clase: 'btn-primario', onClick: el => {
            v.presupuesto = U.numero(el.querySelector('#gPres').value) || 0;
            if (!conMovs) { v.monedaBase = el.querySelector('#gMoneda').value; R.db.guardarPrefs({ monedaBase: v.monedaBase }); }
            R.db.guardarViaje(v);
            R.app.refrescar();
          }
        }
      ]
    });
  }

  function filaMovimiento(v, m) {
    if (m.tipo === 'pago') {
      return `<button class="mov mov-pago" data-mov="${m.id}">
        <span class="mov-icono">🤝</span>
        <span class="mov-texto"><strong>${esc(nombre(m.persona))} le pagó a ${esc(nombre(m.para))}</strong><small>${esc(detallePago(m))}</small></span>
        <span class="mov-monto">${U.fmtMoneda(m.monto, m.moneda)}</span>
      </button>`;
    }
    const c = categoria(m.categoria);
    const entre = (m.division && m.division.entre) || [];
    const esIngreso = m.tipo === 'ingreso';
    const divTxt = entre.length === v.participantes.length && v.participantes.length > 1 ? 'entre todos' : entre.length === 1 ? 'solo ' + nombre(entre[0]) : `entre ${entre.length}`;
    return `<button class="mov ${esIngreso ? 'mov-ingreso' : ''}" data-mov="${m.id}">
      <span class="mov-icono">${esIngreso ? '↩️' : c.icono}</span>
      <span class="mov-texto">
        <strong>${esc(m.concepto)}</strong>
        <small>${m.origenTarea ? '🧭 ' : ''}${esIngreso ? 'Lo recibió' : 'Pagó'} ${esc(nombre(m.persona))}${v.participantes.length > 1 ? ' · ' + esc(divTxt) : ''} · ${U.fmtFecha(m.fecha, 'corto')}</small>
      </span>
      <span class="mov-monto ${esIngreso ? 'positivo' : ''}">${esIngreso ? '+' : '−'}${U.fmtMoneda(m.monto, m.moneda)}${m.moneda !== v.monedaBase ? `<small>${U.fmtMoneda(montoBase(v, m), v.monedaBase)}</small>` : ''}</span>
    </button>`;
  }

  const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Mercado Pago', 'Tarjeta', 'Otra'];
  /** "Transferencia · mié 21 oct, 18:40 · nota" */
  function detallePago(m) {
    return [m.formaPago, U.fmtFecha(m.fecha, 'corto') + (m.hora ? ', ' + m.hora : ''), m.nota].filter(Boolean).join(' · ');
  }
  const horaAhora = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /** Registrar (o editar) un pago entre viajeros, con fecha, hora y forma de pago. */
  function registrarPago(v, x, existente) {
    const m = existente || { persona: x.de, para: x.para, monto: x.monto, moneda: v.monedaBase, fecha: U.hoyISO(), hora: horaAhora(), formaPago: 'Transferencia', nota: '' };
    const acciones = [{ texto: 'Cancelar' }];
    if (existente) acciones.unshift({ texto: 'Eliminar pago', clase: 'btn-texto peligro', onClick: () => { eliminar(v, existente.id); return false; } });
    acciones.push({
      texto: existente ? 'Guardar' : 'Registrar pago', clase: 'btn-primario', onClick: el => {
        const val = sel => el.querySelector(sel).value;
        const monto = U.numero(val('#pMonto'));
        if (!(monto > 0)) { U.toast('El monto tiene que ser mayor a cero.'); return false; }
        const datos = { monto, fecha: val('#pFecha') || U.hoyISO(), hora: val('#pHora'), formaPago: val('#pForma'), nota: val('#pNota').trim() };
        if (existente) Object.assign(existente, datos);
        else v.movimientos.push(Object.assign({
          id: U.id('mov'), tipo: 'pago', persona: m.persona, para: m.para, moneda: v.monedaBase, cotizacion: 1,
          creado: new Date().toISOString(), concepto: 'Pago entre viajeros'
        }, datos));
        R.db.guardarViaje(v);
        R.app.refrescar();
        U.toast(existente ? 'Pago actualizado.' : 'Pago registrado.');
      }
    });
    U.modal({
      titulo: existente ? 'Pago entre viajeros' : 'Registrar pago',
      subtitulo: `${nombre(m.persona)} le paga a ${nombre(m.para)}`,
      cuerpo: `
        <div class="grilla-monto">
          <label class="campo campo-monto"><span>Monto (${esc(m.moneda || v.monedaBase)})</span><input id="pMonto" inputmode="decimal" value="${esc(m.monto)}"></label>
          <label class="campo"><span>Forma de pago</span><select id="pForma">${FORMAS_PAGO.map(f => `<option ${m.formaPago === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
        </div>
        <div class="grilla-2 grilla-fh">
          <label class="campo"><span>Fecha</span><input type="date" id="pFecha" value="${esc(m.fecha || U.hoyISO())}"></label>
          <label class="campo"><span>Hora</span><input type="time" id="pHora" value="${esc(m.hora || '')}"></label>
        </div>
        <label class="campo"><span>Detalle <small>(opcional)</small></span><input id="pNota" value="${esc(m.nota || '')}" placeholder="Ej: alias, comprobante"></label>
        ${existente ? '' : '<p class="ayuda">Si pagó una parte, cambiá el monto: el resto sigue pendiente.</p>'}`,
      acciones
    });
  }

  /* ---------- Formulario ---------- */
  function editar(v, id, tipoNuevo, preset) {
    const existente = id ? v.movimientos.find(m => m.id === id) : null;
    if (existente && existente.tipo === 'pago') return editarPago(v, existente);
    const pre = preset || {};
    const m = existente ? JSON.parse(JSON.stringify(existente)) : {
      tipo: tipoNuevo || 'gasto', concepto: '', categoria: pre.categoria || 'comida', monto: '', moneda: monedaSugerida(v), cotizacion: '',
      fecha: U.hoyISO(), persona: R.db.yoEn(v),
      division: { modo: 'igual', entre: v.participantes.slice(), montos: {} }
    };
    m.division = m.division || { modo: 'igual', entre: v.participantes.slice(), montos: {} };
    m.division.montos = m.division.montos || {};

    const acciones = [{ texto: 'Cancelar' }];
    if (existente) acciones.unshift({ texto: 'Eliminar', clase: 'btn-texto peligro', onClick: () => { eliminar(v, id); return false; } });
    acciones.push({ texto: 'Guardar', clase: 'btn-primario', onClick: el => guardarForm(v, m, existente, el) });

    const { el } = U.modal({
      titulo: existente ? 'Editar movimiento' : (m.tipo === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso'),
      cuerpo: '<div id="formMov"></div>',
      acciones
    });
    const f = el.querySelector('#formMov');

    function pintar() {
      const esGasto = m.tipo === 'gasto';
      const variosViajeros = v.participantes.length > 1;
      f.innerHTML = `
        <div class="segmentado">
          <button type="button" data-tipo="gasto" class="${esGasto ? 'activo' : ''}">Gasto</button>
          <button type="button" data-tipo="ingreso" class="${!esGasto ? 'activo' : ''}">Ingreso / reintegro</button>
        </div>
        <div class="grilla-monto grilla-monto-arriba">
          <label class="campo campo-monto"><span>Monto *</span><input id="mMonto" inputmode="decimal" value="${esc(m.monto)}" placeholder="0"></label>
          <label class="campo"><span>Moneda</span><select id="mMoneda">${U.opcionesMoneda(m.moneda)}</select></label>
        </div>
        <label class="campo"><span>Concepto ${esGasto ? '<small>(opcional)</small>' : '*'}</span><input id="mConcepto" value="${esc(m.concepto)}" placeholder="${esGasto ? 'Ej: Cena en el centro' : 'Ej: Reintegro de excursión cancelada'}"></label>
        ${esGasto ? `<div class="chips-elegir chips-chicos">${categorias().map(c => `<button type="button" class="chip-op ${m.categoria === c.id ? 'activo' : ''}" data-cat="${c.id}">${c.icono} ${esc(c.nombre)}</button>`).join('')}
          <button type="button" class="chip-op chip-nueva" data-a="nuevaCat">+ Nueva categoría</button></div>
          <div class="fila-agregar oculto" id="filaNuevaCat"><input id="mCatIcono" class="input-emoji" maxlength="2" placeholder="🏷️"><input id="mCatNombre" placeholder="Nombre (ej: Regalos, Nafta)"><button type="button" class="btn btn-suave" data-a="crearCat">Crear</button></div>` : ''}
        <label class="campo"><span>Fecha</span><input type="date" id="mFecha" value="${esc(m.fecha)}"></label>
        ${m.moneda !== v.monedaBase ? `<label class="campo"><span>Cotización: 1 ${esc(m.moneda)} = ? ${esc(v.monedaBase)}</span><input id="mCotiz" inputmode="decimal" value="${esc(m.cotizacion)}" placeholder="Ej: 1200"><small class="ayuda" id="mCotizAyuda"></small></label>` : ''}
        <label class="campo"><span>${esGasto ? '¿Quién pagó?' : '¿Quién lo recibió?'}</span>
          <select id="mPersona">${v.participantes.map(p => `<option value="${p}" ${m.persona === p ? 'selected' : ''}>${esc(nombre(p))}</option>`).join('')}</select>
        </label>
        ${variosViajeros ? `
          <div class="campo">
            <span>${esGasto ? '¿Entre quiénes se divide?' : '¿A quiénes les corresponde?'}</span>
            <div class="segmentado segmentado-chico">
              <button type="button" data-modo="igual" class="${m.division.modo === 'igual' ? 'activo' : ''}">Partes iguales</button>
              <button type="button" data-modo="montos" class="${m.division.modo === 'montos' ? 'activo' : ''}">Montos</button>
              <button type="button" data-modo="porcentajes" class="${m.division.modo === 'porcentajes' ? 'activo' : ''}">Porcentajes</button>
            </div>
            <button type="button" class="btn-texto-mini seleccionar-todos" data-a="todos">${m.division.entre.length === v.participantes.length ? 'Quitar a todos' : 'Seleccionar a todos'}</button>
            <div class="lista-division">${v.participantes.map(p => `
              <label class="division-fila">
                <input type="checkbox" data-entre="${p}" ${m.division.entre.includes(p) ? 'checked' : ''}>
                <span>${esc(nombre(p))}</span>
                ${m.division.modo === 'montos' ? `<input class="division-monto" data-montode="${p}" inputmode="decimal" value="${esc(m.division.montos[p] || '')}" placeholder="0" ${m.division.entre.includes(p) ? '' : 'disabled'}>`
                  : m.division.modo === 'porcentajes' ? `<span class="division-pct"><input class="division-monto" data-pctde="${p}" inputmode="decimal" value="${esc((m.division.porcentajes || {})[p] || '')}" placeholder="0" ${m.division.entre.includes(p) ? '' : 'disabled'}>%</span>`
                  : `<small class="division-parte" data-partede="${p}"></small>`}
              </label>`).join('')}</div>
            <p class="ayuda" id="mControl"></p>
          </div>` : ''}`;
      enlazar();
      recalcular();
    }

    function leer() {
      const val = sel => { const x = f.querySelector(sel); return x ? x.value : undefined; };
      if (val('#mConcepto') !== undefined) m.concepto = val('#mConcepto').trim();
      if (val('#mMonto') !== undefined) m.monto = val('#mMonto');
      if (val('#mMoneda') !== undefined) m.moneda = val('#mMoneda');
      if (val('#mFecha') !== undefined) m.fecha = val('#mFecha');
      if (val('#mCotiz') !== undefined) m.cotizacion = val('#mCotiz');
      if (val('#mPersona') !== undefined) m.persona = val('#mPersona');
      const checks = f.querySelectorAll('[data-entre]');
      if (checks.length) m.division.entre = Array.from(checks).filter(x => x.checked).map(x => x.dataset.entre);
      f.querySelectorAll('[data-montode]').forEach(x => { m.division.montos[x.dataset.montode] = x.value; });
      m.division.porcentajes = m.division.porcentajes || {};
      f.querySelectorAll('[data-pctde]').forEach(x => { m.division.porcentajes[x.dataset.pctde] = x.value; });
    }

    function recalcular() {
      const control = f.querySelector('#mControl');
      if (!control) return;
      leer();
      const total = U.numero(m.monto);
      if (m.division.modo === 'igual') {
        const n = m.division.entre.length;
        f.querySelectorAll('[data-partede]').forEach(x => {
          x.textContent = m.division.entre.includes(x.dataset.partede) && n ? U.fmtMoneda(total / n, m.moneda) : '';
        });
        control.textContent = n ? `${U.fmtMoneda(total / n, m.moneda)} cada uno.` : 'Elegí al menos una persona.';
        control.classList.toggle('error', !n);
      } else if (m.division.modo === 'porcentajes') {
        const suma = m.division.entre.reduce((a, p) => a + U.numero(m.division.porcentajes[p]), 0);
        const dif = U.redondear(100 - suma);
        control.textContent = Math.abs(dif) < 0.01 ? 'Los porcentajes suman 100% ✓' : dif > 0 ? `Falta asignar ${dif}%` : `Te pasaste por ${-dif}%`;
        control.classList.toggle('error', Math.abs(dif) >= 0.01);
      } else {
        const suma = m.division.entre.reduce((a, p) => a + U.numero(m.division.montos[p]), 0);
        const dif = U.redondear(total - suma);
        control.textContent = Math.abs(dif) < 0.01 ? 'Los montos cierran ✓' : dif > 0 ? `Faltan asignar ${U.fmtMoneda(dif, m.moneda)}` : `Te pasaste por ${U.fmtMoneda(-dif, m.moneda)}`;
        control.classList.toggle('error', Math.abs(dif) >= 0.01);
      }
    }

    function enlazar() {
      if (f.querySelector('#mCotiz')) R.cotizacion.enlazarCampo(f.querySelector('#mCotiz'), f.querySelector('#mCotizAyuda'), m.moneda, v.monedaBase);
      f.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { leer(); m.tipo = b.dataset.tipo; el.querySelector('.modal-cab h3').textContent = existente ? 'Editar movimiento' : (m.tipo === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso'); pintar(); });
      f.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { m.categoria = b.dataset.cat; f.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('activo', x === b)); });
      const nueva = f.querySelector('[data-a="nuevaCat"]');
      if (nueva) nueva.onclick = () => { f.querySelector('#filaNuevaCat').classList.remove('oculto'); f.querySelector('#mCatNombre').focus(); };
      const crear = f.querySelector('[data-a="crearCat"]');
      if (crear) crear.onclick = () => {
        const n = f.querySelector('#mCatNombre').value.trim();
        if (!n) { U.toast('Poné un nombre para la categoría.'); return; }
        leer();
        m.categoria = crearCategoria(n, f.querySelector('#mCatIcono').value).id;
        pintar();
      };
      const todos = f.querySelector('[data-a="todos"]');
      if (todos) todos.onclick = () => {
        leer();
        m.division.entre = m.division.entre.length === v.participantes.length ? [] : v.participantes.slice();
        pintar();
      };
      f.querySelectorAll('[data-pctde]').forEach(x => x.oninput = recalcular);
      f.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { leer(); m.division.modo = b.dataset.modo; pintar(); });
      const moneda = f.querySelector('#mMoneda');
      moneda.onchange = () => { leer(); pintar(); };
      f.querySelectorAll('[data-entre]').forEach(x => x.onchange = () => {
        const input = f.querySelector(`[data-montode="${x.dataset.entre}"]`);
        if (input) input.disabled = !x.checked;
        recalcular();
      });
      f.querySelectorAll('#mMonto, [data-montode]').forEach(x => x.oninput = recalcular);
    }

    pintar();
    if (!existente) setTimeout(() => { const x = f.querySelector('#mMonto'); if (x) x.focus(); }, 80);
  }

  function guardarForm(v, m, existente, el) {
    const f = el.querySelector('#formMov');
    const leerVal = sel => { const x = f.querySelector(sel); return x ? x.value : null; };
    m.concepto = (leerVal('#mConcepto') || '').trim();
    m.monto = U.numero(leerVal('#mMonto'));
    m.moneda = leerVal('#mMoneda') || v.monedaBase;
    m.fecha = leerVal('#mFecha') || U.hoyISO();
    m.persona = leerVal('#mPersona') || m.persona;
    m.cotizacion = m.moneda !== v.monedaBase ? U.numero(leerVal('#mCotiz')) : 1;
    const checks = f.querySelectorAll('[data-entre]');
    if (checks.length) m.division.entre = Array.from(checks).filter(x => x.checked).map(x => x.dataset.entre);
    else m.division = { modo: 'igual', entre: [m.persona], montos: {} };
    f.querySelectorAll('[data-montode]').forEach(x => { m.division.montos[x.dataset.montode] = U.numero(x.value); });

    if (!m.concepto && m.tipo === 'gasto') m.concepto = categoria(m.categoria).nombre;
    if (!m.concepto) { U.toast('Poné un concepto.'); return false; }
    if (!(m.monto > 0)) { U.toast('El monto tiene que ser mayor a cero.'); return false; }
    if (m.moneda !== v.monedaBase && !(m.cotizacion > 0)) { U.toast(`Cargá la cotización de ${m.moneda} a ${v.monedaBase}.`); return false; }
    if (!m.division.entre.length) { U.toast('Elegí entre quiénes se divide.'); return false; }
    m.division.porcentajes = m.division.porcentajes || {};
    f.querySelectorAll('[data-pctde]').forEach(x => { m.division.porcentajes[x.dataset.pctde] = U.numero(x.value); });
    if (m.division.modo === 'porcentajes') {
      const sumaPct = m.division.entre.reduce((a, p) => a + U.numero(m.division.porcentajes[p]), 0);
      if (Math.abs(sumaPct - 100) >= 0.01) { U.toast('Los porcentajes tienen que sumar 100%.'); return false; }
      Object.keys(m.division.porcentajes).forEach(p => { if (!m.division.entre.includes(p)) delete m.division.porcentajes[p]; });
      m.division.montos = {};
    } else if (m.division.modo === 'montos') {
      const suma = m.division.entre.reduce((a, p) => a + U.numero(m.division.montos[p]), 0);
      if (Math.abs(suma - m.monto) >= 0.01) { U.toast('Los montos por persona tienen que sumar el total.'); return false; }
      Object.keys(m.division.montos).forEach(p => { if (!m.division.entre.includes(p)) delete m.division.montos[p]; });
    } else {
      m.division.montos = {};
      m.division.porcentajes = {};
    }
    if (m.tipo === 'ingreso') delete m.categoria;
    else m.categoria = m.categoria || 'otros';

    if (existente) {
      v.movimientos = v.movimientos.map(x => x.id === existente.id ? Object.assign({}, m, { id: existente.id }) : x);
    } else {
      v.movimientos.push(Object.assign({}, m, { id: U.id('mov'), creado: new Date().toISOString() }));
      if (m.tipo === 'gasto' && R.motor.estado(v, 'r_gastos') === 'pendiente' && R.viajes.estadoViaje(v) !== 'planificando') {
        R.motor.setEstado(v, 'r_gastos', 'en_curso');
      }
    }
    R.db.guardarViaje(v);
    R.app.refrescar();
    U.toast(existente ? 'Movimiento actualizado.' : (m.tipo === 'gasto' ? 'Gasto cargado.' : 'Ingreso cargado.'));
  }

  function editarPago(v, m) { registrarPago(v, null, m); }

  async function eliminar(v, id) {
    const ok = await U.confirmar('Se va a eliminar este movimiento y se recalculan las cuentas.', { titulo: 'Eliminar movimiento', textoSi: 'Eliminar', peligro: true });
    if (!ok) return;
    v.movimientos = v.movimientos.filter(x => x.id !== id);
    R.db.guardarViaje(v);
    R.app.refrescar();
    U.toast('Movimiento eliminado.');
  }

  return { CATEGORIAS, categorias, render, saldos, transferencias, totales, montoBase, partes, parteDe, personaTieneMovimientos };
})();
