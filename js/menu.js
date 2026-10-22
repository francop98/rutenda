/* =========================================================
   Rutenda — menú ☰ (arriba a la izquierda)
   Tu cuenta y lo que se usa de vez en cuando: tus datos,
   apariencia, copia de seguridad, compañeros, el tour,
   instalar la app y cerrar sesión.
   ========================================================= */
window.R = window.R || {};

R.menu = (function () {
  const U = R.util;
  const { esc } = U;
  let capa = null;

  function ultimaCopia() {
    const f = R.db.prefs().ultimaCopia;
    if (!f) return 'Nunca descargaste una copia';
    const d = U.diasEntre(f, U.hoyISO());
    return 'Última: ' + (d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`);
  }

  function html() {
    const u = R.auth.usuarioActual();
    const yo = R.db.yo();
    const op = (id, icono, texto, sub, extra) => `
      <button type="button" class="menu-item ${extra || ''}" data-menu="${id}">
        <span class="menu-icono">${icono}</span>
        <span class="menu-texto"><strong>${texto}</strong>${sub ? `<small>${sub}</small>` : ''}</span>
      </button>`;
    return `
      <div class="menu-fondo" data-menu="cerrar"></div>
      <aside class="menu-panel" role="dialog" aria-modal="true" aria-label="Menú">
        <div class="menu-cab">
          ${yo ? U.avatar(yo, 46) : ''}
          <div class="menu-quien"><strong>${esc(u ? [u.nombre, u.apellido].filter(Boolean).join(' ') : '')}</strong><small>${esc(u ? u.email : '')}</small></div>
          <button type="button" class="menu-x" data-menu="cerrar" aria-label="Cerrar menú">×</button>
        </div>
        <nav class="menu-lista">
          ${op('datos', '👤', 'Mis datos', 'Nombre, documento, alias y recordatorios')}
          ${op('personas', '👥', 'Compañeros', 'Con quién viajaste')}
          ${R.bandeja && R.db.modo() === 'nube' ? op('bandeja', '📥', 'Reservas por mail', R.bandeja.pendientes() ? `${R.bandeja.pendientes()} para sumar` : 'Reenviá a ' + R.bandeja.CASILLA) : ''}
          ${op('anio', '📊', 'Mi año viajero', 'Días, países y kilómetros')}
          <div class="menu-item menu-tema">
            <span class="menu-icono">🎨</span>
            <span class="menu-texto"><strong>Apariencia</strong>
              <span class="segmentado segmentado-tema" role="group" aria-label="Modo de la app">${[['auto', 'Automático'], ['claro', '☀️ Claro'], ['oscuro', '🌙 Oscuro']].map(([k, n]) =>
                `<button type="button" data-tema="${k}" class="${U.tema() === k ? 'activo' : ''}">${n}</button>`).join('')}</span>
              <small class="menu-sub">Tamaño de letra</small>
              <span class="segmentado segmentado-tema" role="group" aria-label="Tamaño de letra">${[['normal', 'Normal'], ['grande', 'Grande'], ['enorme', 'Más grande']].map(([k, n]) =>
                `<button type="button" data-letra="${k}" class="${U.letra() === k ? 'activo' : ''}">${n}</button>`).join('')}</span>
            </span>
          </div>
          ${op('copia', '💾', 'Descargar copia de seguridad', ultimaCopia())}
          <label class="menu-item" data-menu="restaurar">
            <span class="menu-icono">📂</span>
            <span class="menu-texto"><strong>Restaurar una copia</strong><small>Suma los viajes del archivo, no borra nada</small></span>
            <input type="file" accept="application/json,.json" id="menuRestaurar" hidden>
          </label>
          ${op('tour', '🧭', 'Ver el tour de la app')}
          ${R.app.puedeInstalar() ? op('instalar', '📲', 'Instalar Rutenda como app') : ''}
          ${op('salir', '🚪', 'Cerrar sesión', '', 'peligro')}
        </nav>
        <p class="menu-version">Rutenda · versión ${esc(R.VERSION)}</p>
      </aside>`;
  }

  function abrir() {
    if (!R.auth.usuarioActual()) return;
    if (capa) { cerrar(); return; }
    U.cerrarModal();
    capa = document.createElement('div');
    capa.className = 'menu-capa';
    capa.innerHTML = html();
    document.body.appendChild(capa);
    document.body.classList.add('menu-abierto');
    requestAnimationFrame(() => capa && capa.classList.add('visible'));
    document.addEventListener('keydown', teclas);
    enlazar();
    const primero = capa.querySelector('.menu-item');
    if (primero) primero.focus({ preventScroll: true });
  }

  function cerrar() {
    if (!capa) return;
    const c = capa;
    capa = null;
    c.classList.remove('visible');
    document.body.classList.remove('menu-abierto');
    document.removeEventListener('keydown', teclas);
    setTimeout(() => c.remove(), 220);
  }
  function teclas(e) { if (e.key === 'Escape') cerrar(); }

  function enlazar() {
    capa.querySelectorAll('[data-menu="cerrar"]').forEach(x => x.onclick = cerrar);
    const ir = (fn) => () => { cerrar(); setTimeout(fn, 60); };
    const acciones = {
      datos: ir(() => R.auth.abrirMiCuenta()),
      personas: ir(() => { location.hash = '#personas'; }),
      bandeja: ir(() => R.bandeja.abrir()),
      anio: ir(() => R.anio.abrir()),
      copia: ir(() => R.app.exportar()),
      tour: ir(() => R.tour.iniciar()),
      instalar: ir(() => R.app.instalar()),
      salir: ir(async () => {
        const ok = await U.confirmar('Vas a salir de tu cuenta en este dispositivo. Tus viajes quedan guardados.', { titulo: 'Cerrar sesión', textoSi: 'Cerrar sesión' });
        if (!ok) return;
        R.auth.salir().then(() => { location.hash = '#inicio'; location.reload(); });
      })
    };
    capa.querySelectorAll('button[data-menu]').forEach(b => { if (acciones[b.dataset.menu]) b.onclick = acciones[b.dataset.menu]; });
    capa.querySelector('#menuRestaurar').onchange = e => { const f = e.target.files[0]; cerrar(); if (f) R.app.importar(f); };
    capa.querySelectorAll('[data-letra]').forEach(x => x.onclick = () => {
      U.aplicarLetra(x.dataset.letra);
      capa.querySelectorAll('[data-letra]').forEach(y => y.classList.toggle('activo', y === x));
    });
    capa.querySelectorAll('[data-tema]').forEach(x => x.onclick = () => {
      U.aplicarTema(x.dataset.tema);
      capa.querySelectorAll('[data-tema]').forEach(y => y.classList.toggle('activo', y === x));
    });
  }

  return { abrir, cerrar, abierto: () => !!capa };
})();
