/* =========================================================
   Tripbox — pestaña Gastos
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
  function categoria(id) { return CATEGORIAS.find(c => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1]; }
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
    let gastado = 0, ingresado = 0;
    const porCategoria = {};
    v.movimientos.forEach(m => {
      const mb = montoBase(v, m);
      if (m.tipo === 'gasto') { gastado += mb; porCategoria[m.categoria] = (porCategoria[m.categoria] || 0) + mb; }
      if (m.tipo === 'ingreso') ingresado += mb;
    });
    return { gastado, ingresado, neto: gastado - ingresado, porCategoria };
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
  function render(v, cont) {
    const t = totales(v);
    const s = saldos(v);
    const tr = transferencias(s);
    const movs = v.movimientos.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || '').localeCompare(a.creado || ''));
    const pres = U.numero(v.presupuesto);
    const pctPres = pres ? Math.round((t.neto / pres) * 100) : 0;
    const maxCat = Math.max(1, ...Object.values(t.porCategoria));
    const variosViajeros = v.participantes.length > 1;

    cont.innerHTML = `
      <div class="bloque-cab cab-seccion">
        <div>
          <h2 class="titulo-seccion">Gastos y cuentas</h2>
          <p class="texto-suave">Todo se convierte a ${esc(v.monedaBase)} para que las cuentas cierren.</p>
        </div>
        <div class="acciones-fila">
          <button class="btn btn-suave" data-a="ingreso">+ Ingreso</button>
          <button class="btn btn-primario" data-a="gasto">+ Gasto</button>
        </div>
      </div>

      <div class="grilla-resumen">
        <div class="tarjeta-dato">
          <small>Gasto total</small>
          <strong>${U.fmtMoneda(t.neto, v.monedaBase)}</strong>
          ${t.ingresado ? `<span class="texto-suave">${U.fmtMoneda(t.gastado, v.monedaBase)} gastado − ${U.fmtMoneda(t.ingresado, v.monedaBase)} de reintegros</span>` : ''}
        </div>
        <div class="tarjeta-dato">
          <small class="dato-cab">Presupuesto <button class="btn-texto-mini" data-a="presupuesto">${pres ? 'Editar' : 'Definir'}</button></small>
          ${pres ? `<strong>${pctPres}% usado</strong>
            <div class="barra-progreso ${pctPres > 100 ? 'excedido' : ''}"><span style="width:${Math.min(100, pctPres)}%"></span></div>
            <span class="texto-suave">${pctPres > 100 ? 'Te pasaste por ' + U.fmtMoneda(t.neto - pres, v.monedaBase) : 'Quedan ' + U.fmtMoneda(pres - t.neto, v.monedaBase)}</span>`
            : `<strong>Opcional</strong><span class="texto-suave">Si querés, poné un tope y te aviso cuánto queda.</span>`}
        </div>
        <div class="tarjeta-dato">
          <small>Por persona</small>
          <strong>${U.fmtMoneda(v.participantes.length ? t.neto / v.participantes.length : 0, v.monedaBase)}</strong>
          <span class="texto-suave">Promedio entre ${U.plural(v.participantes.length, 'viajero', 'viajeros')}</span>
        </div>
      </div>

      <div class="gastos-grilla">
        <div class="bloque">
          <h3 class="bloque-titulo">Saldos</h3>
          ${variosViajeros ? `
            <div class="lista-saldos">${v.participantes.map(id => {
              const x = s[id] || 0;
              const p = R.db.persona(id);
              return `<div class="saldo">
                ${U.avatar(p, 32)}
                <span class="saldo-nombre">${esc(nombre(id))}</span>
                <span class="saldo-monto ${x > 0.009 ? 'positivo' : x < -0.009 ? 'negativo' : ''}">${x > 0.009 ? 'Le deben ' : x < -0.009 ? 'Debe ' : ''}${Math.abs(x) > 0.009 ? U.fmtMoneda(Math.abs(x), v.monedaBase) : 'A mano ✓'}</span>
              </div>`;
            }).join('')}</div>
            ${tr.length ? `
              <h4 class="subtitulo">Para quedar a mano</h4>
              <div class="lista-transfer">${tr.map((x, i) => `
                <div class="transfer">
                  <span><strong>${esc(nombre(x.de))}</strong> → <strong>${esc(nombre(x.para))}</strong></span>
                  <span class="transfer-monto">${U.fmtMoneda(x.monto, v.monedaBase)}</span>
                  <button class="btn btn-suave btn-chico" data-saldar="${i}">Registrar pago</button>
                </div>`).join('')}</div>`
              : v.movimientos.length ? '<p class="texto-suave">Todos están a mano. 🙌</p>' : ''}`
          : '<p class="texto-suave">Viajás solo/a: no hay cuentas para dividir. Si se suma alguien, agregalo en la pestaña Viajeros.</p>'}
        </div>

        <div class="bloque">
          <h3 class="bloque-titulo">Por categoría</h3>
          ${Object.keys(t.porCategoria).length ? `<div class="barras">${CATEGORIAS.filter(c => t.porCategoria[c.id]).map(c => `
            <div class="barra-cat">
              <span class="bc-nombre">${c.icono} ${c.nombre}</span>
              <span class="bc-barra"><span style="width:${Math.round((t.porCategoria[c.id] / maxCat) * 100)}%"></span></span>
              <span class="bc-monto">${U.fmtMoneda(t.porCategoria[c.id], v.monedaBase)}</span>
            </div>`).join('')}</div>` : '<p class="texto-suave">Cuando cargues gastos, acá vas a ver en qué se va la plata.</p>'}
        </div>
      </div>

      <div class="bloque">
        <h3 class="bloque-titulo">Movimientos <span class="contador">${movs.length}</span></h3>
        ${movs.length ? `<div class="lista-movs">${movs.map(m => filaMovimiento(v, m)).join('')}</div>` : `
          <div class="vacio vacio-chico">
            <div class="vacio-icono">💸</div>
            <p>Cargá cada gasto con quién lo pagó y entre quiénes se divide. Tripbox hace las cuentas.</p>
          </div>`}
      </div>`;

    cont.querySelector('[data-a="gasto"]').onclick = () => editar(v, null, 'gasto');
    cont.querySelector('[data-a="presupuesto"]').onclick = () => editarPresupuesto(v);
    cont.querySelector('[data-a="ingreso"]').onclick = () => editar(v, null, 'ingreso');
    cont.querySelectorAll('[data-mov]').forEach(b => b.onclick = () => editar(v, b.dataset.mov));
    cont.querySelectorAll('[data-saldar]').forEach(b => b.onclick = () => {
      const x = tr[Number(b.dataset.saldar)];
      registrarPago(v, x);
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
        <span class="mov-texto"><strong>${esc(nombre(m.persona))} le pagó a ${esc(nombre(m.para))}</strong><small>${U.fmtFecha(m.fecha, 'corto')}</small></span>
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
      <span class="mov-monto">${esIngreso ? '−' : ''}${U.fmtMoneda(m.monto, m.moneda)}${m.moneda !== v.monedaBase ? `<small>${U.fmtMoneda(montoBase(v, m), v.monedaBase)}</small>` : ''}</span>
    </button>`;
  }

  function registrarPago(v, x) {
    U.confirmar(`¿${nombre(x.de)} ya le pagó ${U.fmtMoneda(x.monto, v.monedaBase)} a ${nombre(x.para)}?`, { titulo: 'Registrar pago', textoSi: 'Sí, registrar' }).then(ok => {
      if (!ok) return;
      v.movimientos.push({
        id: U.id('mov'), tipo: 'pago', persona: x.de, para: x.para,
        monto: x.monto, moneda: v.monedaBase, cotizacion: 1,
        fecha: U.hoyISO(), creado: new Date().toISOString(), concepto: 'Pago entre viajeros'
      });
      R.db.guardarViaje(v);
      R.app.refrescar();
      U.toast('Pago registrado.');
    });
  }

  /* ---------- Formulario ---------- */
  function editar(v, id, tipoNuevo) {
    const existente = id ? v.movimientos.find(m => m.id === id) : null;
    if (existente && existente.tipo === 'pago') return editarPago(v, existente);
    const m = existente ? JSON.parse(JSON.stringify(existente)) : {
      tipo: tipoNuevo || 'gasto', concepto: '', categoria: 'comida', monto: '', moneda: v.monedaBase, cotizacion: '',
      fecha: U.hoyISO(), persona: v.participantes.includes('yo') ? 'yo' : v.participantes[0],
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
        <label class="campo"><span>Concepto *</span><input id="mConcepto" value="${esc(m.concepto)}" placeholder="${esGasto ? 'Ej: Cena en el centro' : 'Ej: Reintegro de excursión cancelada'}"></label>
        ${esGasto ? `<div class="chips-elegir chips-chicos">${CATEGORIAS.map(c => `<button type="button" class="chip-op ${m.categoria === c.id ? 'activo' : ''}" data-cat="${c.id}">${c.icono} ${c.nombre}</button>`).join('')}</div>` : ''}
        <div class="grilla-monto">
          <label class="campo"><span>Monto *</span><input id="mMonto" inputmode="decimal" value="${esc(m.monto)}" placeholder="0"></label>
          <label class="campo"><span>Moneda</span><select id="mMoneda">${U.opcionesMoneda(m.moneda)}</select></label>
          <label class="campo"><span>Fecha</span><input type="date" id="mFecha" value="${esc(m.fecha)}"></label>
        </div>
        ${m.moneda !== v.monedaBase ? `<label class="campo"><span>Cotización: 1 ${esc(m.moneda)} = ? ${esc(v.monedaBase)}</span><input id="mCotiz" inputmode="decimal" value="${esc(m.cotizacion)}" placeholder="Ej: 1200"></label>` : ''}
        <label class="campo"><span>${esGasto ? '¿Quién pagó?' : '¿Quién lo recibió?'}</span>
          <select id="mPersona">${v.participantes.map(p => `<option value="${p}" ${m.persona === p ? 'selected' : ''}>${esc(nombre(p))}</option>`).join('')}</select>
        </label>
        ${variosViajeros ? `
          <div class="campo">
            <span>${esGasto ? '¿Entre quiénes se divide?' : '¿A quiénes les corresponde?'}</span>
            <div class="segmentado segmentado-chico">
              <button type="button" data-modo="igual" class="${m.division.modo === 'igual' ? 'activo' : ''}">Partes iguales</button>
              <button type="button" data-modo="montos" class="${m.division.modo === 'montos' ? 'activo' : ''}">Montos distintos</button>
            </div>
            <div class="lista-division">${v.participantes.map(p => `
              <label class="division-fila">
                <input type="checkbox" data-entre="${p}" ${m.division.entre.includes(p) ? 'checked' : ''}>
                <span>${esc(nombre(p))}</span>
                ${m.division.modo === 'montos' ? `<input class="division-monto" data-montode="${p}" inputmode="decimal" value="${esc(m.division.montos[p] || '')}" placeholder="0" ${m.division.entre.includes(p) ? '' : 'disabled'}>`
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
      } else {
        const suma = m.division.entre.reduce((a, p) => a + U.numero(m.division.montos[p]), 0);
        const dif = U.redondear(total - suma);
        control.textContent = Math.abs(dif) < 0.01 ? 'Los montos cierran ✓' : dif > 0 ? `Faltan asignar ${U.fmtMoneda(dif, m.moneda)}` : `Te pasaste por ${U.fmtMoneda(-dif, m.moneda)}`;
        control.classList.toggle('error', Math.abs(dif) >= 0.01);
      }
    }

    function enlazar() {
      f.querySelectorAll('[data-tipo]').forEach(b => b.onclick = () => { leer(); m.tipo = b.dataset.tipo; el.querySelector('.modal-cab h3').textContent = existente ? 'Editar movimiento' : (m.tipo === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso'); pintar(); });
      f.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { m.categoria = b.dataset.cat; f.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('activo', x === b)); });
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

    if (!m.concepto) { U.toast('Poné un concepto.'); return false; }
    if (!(m.monto > 0)) { U.toast('El monto tiene que ser mayor a cero.'); return false; }
    if (m.moneda !== v.monedaBase && !(m.cotizacion > 0)) { U.toast(`Cargá la cotización de ${m.moneda} a ${v.monedaBase}.`); return false; }
    if (!m.division.entre.length) { U.toast('Elegí entre quiénes se divide.'); return false; }
    if (m.division.modo === 'montos') {
      const suma = m.division.entre.reduce((a, p) => a + U.numero(m.division.montos[p]), 0);
      if (Math.abs(suma - m.monto) >= 0.01) { U.toast('Los montos por persona tienen que sumar el total.'); return false; }
      Object.keys(m.division.montos).forEach(p => { if (!m.division.entre.includes(p)) delete m.division.montos[p]; });
    } else {
      m.division.montos = {};
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

  function editarPago(v, m) {
    U.modal({
      titulo: 'Pago entre viajeros',
      cuerpo: `<p><strong>${esc(nombre(m.persona))}</strong> le pagó <strong>${U.fmtMoneda(m.monto, m.moneda)}</strong> a <strong>${esc(nombre(m.para))}</strong> el ${U.fmtFecha(m.fecha, 'largo')}.</p>`,
      acciones: [
        { texto: 'Eliminar pago', clase: 'btn-texto peligro', onClick: () => { eliminar(v, m.id); return false; } },
        { texto: 'Cerrar', clase: 'btn-primario' }
      ]
    });
  }

  async function eliminar(v, id) {
    const ok = await U.confirmar('Se va a eliminar este movimiento y se recalculan las cuentas.', { titulo: 'Eliminar movimiento', textoSi: 'Eliminar', peligro: true });
    if (!ok) return;
    v.movimientos = v.movimientos.filter(x => x.id !== id);
    R.db.guardarViaje(v);
    R.app.refrescar();
    U.toast('Movimiento eliminado.');
  }

  return { CATEGORIAS, render, saldos, transferencias, totales, montoBase, partes, parteDe, personaTieneMovimientos };
})();
