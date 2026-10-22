/* =========================================================
   Rutenda — arranque, navegación y pantalla de inicio
   Rutas:
     #inicio                 → mis viajes
     #viaje/{id}/{pestaña}   → un viaje (guia, itinerario, documentos, viajeros, gastos)
     #personas               → compañeros de viaje
     #valijas                → mis listas de valija
     #unirse/{codigo}        → sumarse a un viaje compartido
   ========================================================= */
(function () {
  const U = R.util;
  const { esc } = U;
  const app = document.getElementById('app');
  let rutaAnterior = '';
  let listo = false;

  const esPublica = () => /^#familia\//.test(location.hash);
  function render() {
    if (!listo) return;
    // Link para la familia: se ve sin cuenta
    document.body.classList.toggle('vista-publica', esPublica());
    if (esPublica()) { R.familia.renderPublico(app, location.hash.split('/')[1] || ''); return; }
    if (!R.auth.usuarioActual()) {
      document.body.classList.add('sin-sesion');
      document.title = 'Rutenda · Ingresá';
      R.auth.renderPantalla(app, arrancarSesion);
      return;
    }
    document.body.classList.remove('sin-sesion');
    app.classList.remove('rol-viajero');
    document.body.classList.remove('fondo-inicio');
    // Atajos del ícono y "Compartir → Rutenda"
    const atajo = (location.hash.replace(/^#/, '') || '').split('/')[0];
    if (['cargar', 'compartido', 'hoy'].includes(atajo)) {
      if (atajo === 'hoy') {
        const enCurso = R.db.viajes().find(x => R.viajes.estadoViaje(x) === 'en_curso');
        location.replace(enCurso ? `#viaje/${enCurso.id}/hoy` : '#itinerario');
        return;
      }
      history.replaceState(null, '', '#inicio');
      setTimeout(() => (atajo === 'cargar' ? R.cargar.abrir() : R.compartido.recibir()), 150);
    }
    const hash = location.hash.replace(/^#/, '') || 'inicio';
    const [vista, id, pestana] = hash.split('/');
    document.querySelectorAll('[data-nav]').forEach(a => {
      a.classList.toggle('activo', a.dataset.nav === vista || (vista === 'viaje' && a.dataset.nav === 'viajes'));
    });

    if (vista === 'unirse' && id) {
      R.participantes.renderUnirse(app, id);
    } else if (vista === 'viaje' && id) {
      const v = R.db.viaje(id);
      if (!v) { location.hash = '#inicio'; return; }
      document.title = `${v.nombre || v.destino} · Rutenda`;
      R.viajes.renderViaje(app, v, pestana || '');
    } else if (vista === 'itinerario') {
      document.title = 'Itinerario · Rutenda';
      renderItinerario(id);
    } else if (vista === 'valijas') {
      document.title = 'Mis listas de valija · Rutenda';
      R.valija.renderMisListas(app);
    } else if (vista === 'viajes') {
      document.title = 'Mis viajes · Rutenda';
      renderMisViajes();
    } else if (vista === 'personas') {
      document.title = 'Compañeros · Rutenda';
      R.participantes.renderPersonas(app);
    } else {
      document.title = 'Rutenda · Tu viaje, paso a paso';
      renderInicio();
    }
  }

  /**
   * Cambios que llegan de la nube (otra persona o tu otro dispositivo):
   * se redibuja sin interrumpir lo que estás escribiendo ni un cartel abierto.
   */
  let refrescoPendiente = false;
  function refrescarRemoto() {
    if (U.fondoBloqueado() !== null) { refrescoPendiente = true; return; }
    const activo = document.activeElement;
    if (activo && app.contains(activo) && /INPUT|TEXTAREA|SELECT/.test(activo.tagName)) {
      refrescoPendiente = true;
      activo.addEventListener('blur', () => setTimeout(trasCerrarModal, 50), { once: true });
      return;
    }
    refrescoPendiente = false;
    refrescar();
  }
  function trasCerrarModal() {
    if (refrescoPendiente && U.fondoBloqueado() === null) { refrescoPendiente = false; refrescar(); }
  }

  /** Vuelve a dibujar la vista actual sin perder la posición del scroll. */
  function refrescar() {
    // Si hay un cartel abierto, el fondo está congelado: no tocar el scroll
    if (U.fondoBloqueado() !== null) { render(); return; }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  /** Avatar del usuario en la barra. */
  function pintarUsuario() {
    // La cuenta está en el menú ☰: acá solo actualizamos su descripción
    const boton = document.getElementById('btnMenu');
    const u = R.auth.usuarioActual();
    if (boton) boton.title = u ? `Menú · ${u.nombre}` : 'Menú';
  }

  async function arrancarSesion(u) {
    // En el link de la familia no hace falta esperar tus viajes
    if (esPublica()) { render(); R.db.cargar(u || R.auth.usuarioActual()).then(pintarUsuario).catch(() => {}); return; }
    app.innerHTML = '<div class="pantalla-carga"><span class="marca-logo grande"></span><p>Cargando tus viajes…</p></div>';
    await R.db.cargar(u || R.auth.usuarioActual());
    pintarUsuario();
    if (!location.hash || location.hash === '#') location.hash = '#inicio';
    render();
    window.scrollTo(0, 0);
    R.migracion.ofrecer();
    if (R.tour) R.tour.siCorresponde();
    // Reservas que llegaron por mail
    if (R.bandeja) R.bandeja.cargar().then(l => { if (l.length && /^#?(inicio)?$/.test(location.hash)) refrescar(); }).catch(() => {});
    if (R.recordatorios) { R.recordatorios.actualizar(); R.recordatorios.revisar(); }
    // Pasajes y reservas de los viajes cercanos, guardados para usarlos sin señal
    setTimeout(() => R.db.precargarArchivos().catch(() => {}), 4000);
  }

  /* ---------- Sin conexión ---------- */
  function avisoConexion() {
    const sin = navigator.onLine === false;
    document.body.classList.toggle('sin-conexion', sin);
    let barra = document.getElementById('barraSinConexion');
    if (sin && !barra) {
      barra = document.createElement('div');
      barra.id = 'barraSinConexion';
      barra.className = 'barra-sin-conexion';
      barra.textContent = 'Sin conexión · ves lo último guardado. Lo que cargues se sube cuando vuelva la señal.';
      document.body.prepend(barra);
    } else if (!sin && barra) barra.remove();
  }
  window.addEventListener('offline', avisoConexion);
  window.addEventListener('online', () => { avisoConexion(); if (R.auth.usuarioActual()) R.db.precargarArchivos().catch(() => {}); });
  avisoConexion();

  /* ---------- App instalable ---------- */
  let eventoInstalar = null;
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const esInstalada = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    eventoInstalar = e;
    if ((location.hash || '#inicio').startsWith('#inicio')) refrescar();
  });
  window.addEventListener('appinstalled', () => { eventoInstalar = null; U.toast('¡Rutenda quedó instalada! 🎉'); refrescar(); });
  function puedeInstalar() { return !esInstalada() && (!!eventoInstalar || esIOS); }
  async function instalar() {
    if (eventoInstalar) {
      eventoInstalar.prompt();
      await eventoInstalar.userChoice;
      eventoInstalar = null;
      refrescar();
    } else if (esIOS) {
      U.modal({
        titulo: 'Instalar Rutenda',
        cuerpo: '<ol class="pasos-instalar"><li>Tocá el botón <strong>Compartir</strong> de Safari (el cuadrado con la flecha).</li><li>Elegí <strong>Agregar a inicio</strong>.</li><li>Listo: Rutenda se abre como una app, a pantalla completa.</li></ol>',
        acciones: [{ texto: 'Entendido', clase: 'btn-primario' }]
      });
    } else {
      U.toast('Abrí el menú del navegador y elegí "Instalar app" o "Agregar a pantalla de inicio".');
    }
  }
  if (esInstalada()) document.body.classList.add('instalada');
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  window.R.app = { render, refrescar, refrescarRemoto, trasCerrarModal, pintarUsuario, puedeInstalar, instalar, exportar, importar };

  /* ---------------------------------------------------------
     Pantalla de inicio
     --------------------------------------------------------- */
  function renderInicio() {
    const viajes = R.db.viajes().slice();
    const yo = R.db.yo();
    const nombre = yo.nombre && yo.nombre !== 'Yo' ? `, ${yo.nombre}` : '';
    const porEstado = est => viajes.filter(v => R.viajes.estadoViaje(v) === est);
    const enCurso = porEstado('en_curso');
    const planificando = porEstado('planificando').sort((a, b) => (a.fechaInicio || '9999').localeCompare(b.fechaInicio || '9999'));
    const destacado = enCurso[0] || planificando[0];
    const otrosProximos = planificando.filter(v => v !== destacado).slice(0, 3);
    const hayViajes = viajes.length > 0;

    document.body.classList.toggle('fondo-inicio', hayViajes);
    app.innerHTML = `
      ${hayViajes ? `
      <section class="saludo-inicio">
        <svg class="inicio-deco" viewBox="0 0 600 160" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <path class="id-curva" d="M-20 130 C 90 60, 180 150, 280 90 S 470 30, 620 70"/>
          <path class="id-curva id-curva-2" d="M-20 150 C 110 100, 220 170, 330 120 S 500 70, 620 100"/>
          <path class="id-ruta" d="M60 118 C 160 70, 240 130, 330 92 S 470 46, 548 58"/>
          <circle class="id-punto" cx="60" cy="118" r="5"/><circle class="id-meta" cx="548" cy="58" r="9"/><circle class="id-meta-c" cx="548" cy="58" r="3.5"/>
        </svg>
        <div>
          <p class="fecha-hoy">${esc(new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
          <p class="hero-saludo">${U.saludo()}${esc(nombre)} ☀️</p>
          <h1>${enCurso.length ? '¡Buen viaje!' : destacado ? '¿Seguimos organizando?' : '¿A dónde vamos?'}</h1>
        </div>
        <button class="btn btn-suave btn-chico" data-a="nuevo">+ Nuevo viaje</button>
      </section>` : `
      <section class="hero">
        ${U.paisaje(null, { transporte: 'avion', progreso: 0.55 })}
        <div class="hero-contenido">
          <p class="hero-saludo">${U.saludo()}${esc(nombre)} ☀️</p>
          <h1>¿A dónde vamos?</h1>
          <p class="hero-frase">${esc(U.frase())}</p>
          <button class="btn btn-primario btn-grande" data-a="nuevo">+ Planificar un viaje</button>
          <button class="btn btn-texto hero-ejemplo" data-a="tour">¿Primera vez? Mirá cómo funciona →</button>
        </div>
      </section>`}

      ${puedeInstalar() && !leerOculto('instalar') ? `
        <div class="aviso-instalar">
          <span class="ai-icono"></span>
          <div><strong>Instalá Rutenda en tu celular</strong><small>Se abre como una app, a pantalla completa y sin conexión.</small></div>
          <button class="btn btn-primario btn-chico" data-a="instalar">Instalar</button>
          <button class="btn-icono" data-a="ocultarInstalar" aria-label="Ahora no">×</button>
        </div>` : ''}

      ${R.recordatorios ? R.recordatorios.avisosHTML() : ''}
      ${R.bandeja ? R.bandeja.inicioHTML() : ''}

      ${enCurso.map(v => R.itinerario.hoyHTML(v)).join('')}
      ${R.cierre ? R.cierre.inicioHTML() : ''}

      ${destacado ? destacadoHTML(destacado) : ''}
      ${destacado && R.salida ? R.salida.tarjetaHTML(destacado) : ''}

      ${!hayViajes ? comoFunciona() : ''}

      ${otrosProximos.length ? `
        <section class="seccion-viajes">
          <div class="cab-seccion-chica"><h2 class="titulo-seccion">También en camino</h2><a href="#viajes" class="btn btn-texto btn-chico">Ver todos →</a></div>
          <div class="lista-compacta">${otrosProximos.map(filaViaje).join('')}</div>
        </section>` : viajes.length > 1 ? `<p class="ir-viajes"><a href="#viajes" class="btn btn-texto btn-chico">Ver todos mis viajes (${viajes.length}) →</a></p>` : ''}`;

    app.querySelectorAll('[data-a="nuevo"]').forEach(b => b.onclick = () => R.viajes.abrirAsistente());
    const bTour = app.querySelector('[data-a="tour"]');
    if (bTour) bTour.onclick = () => R.tour.iniciar();
    const bInst = app.querySelector('[data-a="instalar"]');
    if (bInst) bInst.onclick = instalar;
    const bOcultar = app.querySelector('[data-a="ocultarInstalar"]');
    if (bOcultar) bOcultar.onclick = () => { try { localStorage.setItem('rutenda_oculto_instalar', '1'); } catch (e) { /* sin almacenamiento */ } refrescar(); };
    enCurso.forEach(v => R.itinerario.enlazarHoy(app, v));
    if (destacado && R.salida) R.salida.enlazar(app, destacado);
    if (R.recordatorios) R.recordatorios.enlazarAvisos(app);
    if (R.bandeja) R.bandeja.enlazarInicio(app);
    if (R.cierre) R.cierre.enlazar(app);
  }

  /** Fila compacta de un viaje (inicio y listas). */
  function filaViaje(v) {
    const prog = R.motor.progreso(v);
    const est = R.viajes.estadoViaje(v);
    return `
      <a class="fila-viaje" href="#viaje/${v.id}">
        <span class="fv-portada" style="background:${R.paisaje.fondo(v)}">${R.paisaje.TEMAS[R.paisaje.tema(v)].icono}</span>
        <span class="fv-texto">
          <strong>${esc(v.nombre || (v.destinos || []).filter(d => !d.soloDia).map(d => d.nombre).join(' → ') || v.destino)}</strong>
          <small>${esc(U.fmtRango(v.fechaInicio, v.fechaFin))} · ${esc(R.viajes.cuentaRegresiva(v))}</small>
          ${R.viajes.siguienteHTML(v)}
        </span>
        ${est === 'pasado' ? '<span class="fv-estado">✓</span>' : `<span class="fv-pct">${prog.pct}%</span>`}
      </a>`;
  }

  /* ---------------------------------------------------------
     Mis viajes: todos, con filtros
     --------------------------------------------------------- */
  let filtroViajes = 'todos';
  function renderMisViajes() {
    const viajes = R.db.viajes().slice();
    const estado = v => {
      const e = R.viajes.estadoViaje(v);
      return e === 'planificando' && !v.fechaInicio ? 'sin_fecha' : e;
    };
    const grupos = [
      { id: 'en_curso', titulo: 'En curso', icono: '🧳' },
      { id: 'planificando', titulo: 'Próximos', icono: '🗓️' },
      { id: 'sin_fecha', titulo: 'Sin fechas', icono: '💭' },
      { id: 'pasado', titulo: 'Finalizados', icono: '📸' }
    ].map(g => {
      const lista = viajes.filter(v => estado(v) === g.id);
      lista.sort((a, b) => g.id === 'pasado' ? (b.fechaFin || '').localeCompare(a.fechaFin || '') : (a.fechaInicio || '9999').localeCompare(b.fechaInicio || '9999'));
      return Object.assign(g, { lista });
    });
    if (filtroViajes !== 'todos' && !grupos.some(g => g.id === filtroViajes && g.lista.length)) filtroViajes = 'todos';
    const visibles = grupos.filter(g => g.lista.length && (filtroViajes === 'todos' || g.id === filtroViajes));

    app.innerHTML = `
      <section class="cab-mis-viajes">
        <div>
          <h1 class="titulo-pagina">Mis viajes</h1>
          <p class="texto-suave">${viajes.length ? U.plural(viajes.length, 'viaje', 'viajes') : 'Todavía no cargaste viajes.'}</p>
        </div>
        <div class="acciones-fila">
          ${viajes.some(v => !v.ejemplo) ? '<button class="btn btn-texto btn-chico" data-a="mapaViajes">🗺️ Mapa</button>' : ''}
          <a class="btn btn-texto btn-chico" href="#personas">👥 Compañeros</a>
          <button class="btn btn-primario btn-chico" data-a="nuevo">+ Nuevo viaje</button>
        </div>
      </section>
      ${viajes.length ? `
      ${viajes.length >= 4 ? `<div class="chips-filtro filtro-viajes">
        <button class="${filtroViajes === 'todos' ? 'activo' : ''}" data-filtro-viajes="todos">Todos</button>
        ${grupos.filter(g => g.lista.length).map(g => `<button class="${filtroViajes === g.id ? 'activo' : ''}" data-filtro-viajes="${g.id}">${g.titulo} <span>${g.lista.length}</span></button>`).join('')}
      </div>` : ''}
      ${(viajes.length >= 4 ? visibles : grupos.filter(g => g.lista.length)).map(g => `
        <section class="seccion-viajes">
          <h2 class="titulo-seccion">${g.icono} ${esc(g.titulo)} <span class="contador">${g.lista.length}</span></h2>
          <div class="grilla-viajes">${g.lista.map(R.viajes.tarjeta).join('')}</div>
        </section>`).join('')}` : `
      <div class="vacio">
        <div class="vacio-icono">🧭</div>
        <h3>Tu primer viaje te espera</h3>
        <p>Cargá a dónde vas y Rutenda te arma la guía paso a paso.</p>
        <button class="btn btn-primario" data-a="nuevo">+ Planificar un viaje</button>
      </div>`}

      <footer class="pie">
        <p>${R.db.modo() === 'nube' ? '☁️ Tus datos están guardados en tu cuenta y se sincronizan en tus dispositivos.' : 'Tus datos se guardan en este dispositivo.'} La copia de seguridad está en Mi cuenta.</p>
      </footer>`;

    app.querySelectorAll('[data-a="nuevo"]').forEach(b => b.onclick = () => R.viajes.abrirAsistente());
    const bMapa = app.querySelector('[data-a="mapaViajes"]');
    if (bMapa) bMapa.onclick = () => {
      const { el } = U.modal({ titulo: 'Tus viajes en el mapa', subtitulo: '🟢 Próximos · 🟡 Ya fuiste', ancho: true, cuerpo: '<div id="mapaTodos"></div>' });
      R.mapa.mostrarTodos(el.querySelector('#mapaTodos'), R.db.viajes());
    };
    app.querySelectorAll('[data-filtro-viajes]').forEach(b => b.onclick = () => { filtroViajes = b.dataset.filtroViajes; renderMisViajes(); });
  }

  function leerOculto(clave) { try { return localStorage.getItem('rutenda_oculto_' + clave) === '1'; } catch (e) { return false; } }

  function destacadoHTML(v) {
    const prog = R.motor.progreso(v);
    const prox = R.motor.proximos(v, 1)[0];
    const viajando = R.viajes.estadoViaje(v) === 'en_curso';
    // Todo dentro de la tarjeta: portada, cuenta regresiva, avance y lo que sigue
    return `
      <section class="destacado">
        <article class="destacado-portada" style="background:${R.paisaje.fondo(v)}">
          ${U.paisaje(v)}
          <a class="dp-enlace" href="#viaje/${v.id}" aria-label="Abrir ${esc(v.nombre || v.destino || 'el viaje')}"></a>
          <div class="dp-arriba">
            <span class="etiqueta-clara">${viajando ? 'Viajando ahora' : 'Tu próximo viaje'}</span>
            <strong class="destacado-cuenta">${esc(R.viajes.cuentaRegresiva(v))}</strong>
          </div>
          <h2>${esc(v.nombre || (v.destinos || []).filter(d => !d.soloDia).map(d => d.nombre).join(' → ') || v.destino)}</h2>
          <p class="dp-meta">${esc(R.viajes.destinoCompleto(v))} · ${esc(U.fmtRango(v.fechaInicio, v.fechaFin))}</p>
          <div class="dp-pie">
            <div class="dp-avance">
              ${U.anillo(prog.pct, 54)}
              <div><strong>${prog.hechas} de ${prog.total} pasos</strong><small>organizados</small></div>
            </div>
            ${prox ? `
              <div class="dp-siguiente">
                <small>Lo que sigue</small>
                <strong>${R.guia.fase(prox.fase).icono} ${esc(prox.titulo)}</strong>
              </div>
              <a href="#" class="btn btn-primario btn-chico dp-boton" data-siguiente="${prox.id}" data-viaje="${v.id}">Resolverlo →</a>`
            : `<div class="dp-siguiente"><strong>¡Nada pendiente por ahora! 🌴</strong></div>`}
          </div>
        </article>
        ${semanaHTML(v)}
      </section>`;
  }

  /** Lo que conviene resolver en los próximos 7 días (o que ya está atrasado). */
  function semanaHTML(v) {
    if (!R.db.puedeOrganizar(v)) return '';
    const hoy = U.hoyISO();
    const tope = U.sumarDias(hoy, 7);
    const lista = R.motor.analizar(v)
      .filter(t => !t.rec && !t.resuelta && !t.bloqueada && t.fechaLimite && t.fechaLimite <= tope)
      .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
    if (!lista.length) return '';
    const cuando = f => { const d = U.diasEntre(hoy, f); return d < 0 ? `atrasado ${U.plural(-d, 'día', 'días')}` : d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`; };
    return `
      <div class="dp-semana">
        <div class="dps-cab"><strong>📅 Esta semana</strong><span class="contador">${lista.length}</span></div>
        ${lista.slice(0, 3).map(t => `
          <div class="dps-fila ${t.fechaLimite < hoy ? 'atrasado' : ''}">
            <span class="dps-texto">${R.guia.fase(t.fase).icono} ${esc(t.titulo)}<small>${esc(cuando(t.fechaLimite))}</small></span>
            <button type="button" class="btn-texto-mini" data-siguiente="${t.id}" data-viaje="${v.id}">Resolver</button>
          </div>`).join('')}
        ${lista.length > 3 ? `<a class="dps-mas" href="#viaje/${v.id}/guia">Ver ${U.plural(lista.length - 3, 'cosa más', 'cosas más')} →</a>` : ''}
      </div>`;
  }

  function comoFunciona() {
    const items = [
      ['🧭', 'Guía paso a paso', 'Te digo qué resolver primero, qué después y para cuándo, según tu viaje.'],
      ['🔄', 'Prioridades inteligentes', '¿Cambió algo? Te armo el orden para reorganizar sin estrés.'],
      ['📁', 'Todo en un lugar', 'Pasajes, reservas y documentos siempre a mano.'],
      ['💸', 'Cuentas claras', 'Gastos compartidos, quién le debe a quién y el historial con quién viajaste.']
    ];
    return `
      <section class="como-funciona">
        ${items.map(([i, t, d]) => `<div class="cf-item"><span>${i}</span><strong>${t}</strong><p>${d}</p></div>`).join('')}
      </section>`;
  }

  /* ---------- Itinerario (barra de abajo): el del viaje que estás haciendo o el próximo ---------- */
  function viajesConItinerario() {
    const hoy = U.hoyISO();
    const todos = R.db.viajes().filter(v => !v.ejemplo);
    const lista = todos.length ? todos : R.db.viajes();
    const est = v => R.viajes.estadoViaje(v);
    const peso = v => est(v) === 'en_curso' ? 0 : est(v) === 'planificando' ? 1 : 2;
    return lista.slice().sort((a, b) => peso(a) - peso(b)
      || (peso(a) === 2 ? (b.fechaFin || '').localeCompare(a.fechaFin || '') : (a.fechaInicio || '9999').localeCompare(b.fechaInicio || '9999')))
      .filter(v => est(v) !== 'pasado' || (v.fechaFin && v.fechaFin >= U.sumarDias(hoy, -30)) || lista.every(x => est(x) === 'pasado'));
  }
  function renderItinerario(idElegido) {
    const lista = viajesConItinerario();
    if (!lista.length) {
      app.innerHTML = `
        <section class="encabezado-simple"><h1>Itinerario</h1></section>
        ${U.vacio({ icono: '🗓️', titulo: 'Todavía no tenés viajes', texto: 'Armá uno y acá vas a ver cada día: traslados, alojamiento y lo que vas a hacer.', boton: '+ Nuevo viaje', accion: 'nuevo' })}`;
      app.querySelector('[data-a="nuevo"]').onclick = () => R.viajes.abrirAsistente();
      return;
    }
    const v = lista.find(x => x.id === idElegido) || lista[0];
    app.classList.toggle('rol-viajero', !R.db.puedeOrganizar(v));
    const cuando = x => R.viajes.estadoViaje(x) === 'en_curso' ? '✈️ Ahora' : R.viajes.estadoViaje(x) === 'pasado' ? 'Ya fue' : (x.fechaInicio ? U.fmtFecha(x.fechaInicio, 'dia') : 'Sin fecha');
    const nombre = x => x.nombre || (x.destinos || []).filter(d => d.nombre && !d.soloDia).map(d => d.nombre).join(' → ') || x.destino || 'Viaje';
    app.innerHTML = `
      <section class="itin-global-cab">
        ${lista.length > 1 ? `<div class="itin-global-viajes" role="tablist" aria-label="Viaje">${lista.map(x => `
          <a href="#itinerario/${x.id}" role="tab" aria-selected="${x.id === v.id}" class="itin-global-viaje ${x.id === v.id ? 'activo' : ''}">
            <span class="punto" style="background:${R.paisaje.fondo(x)}"></span><span><strong>${esc(nombre(x))}</strong><small>${esc(cuando(x))}</small></span></a>`).join('')}</div>` : ''}
        ${lista.length > 1 ? `<a class="itin-global-link" href="#viaje/${v.id}/guia">Abrir este viaje →</a>`
          : `<a class="itin-global-ir" href="#viaje/${v.id}/guia"><span class="punto" style="background:${R.paisaje.fondo(v)}"></span><span><strong>${esc(nombre(v))}</strong><small>${esc(U.fmtRango(v.fechaInicio, v.fechaFin))}</small></span><b>Abrir el viaje →</b></a>`}
      </section>
      <div class="itin-global"></div>`;
    R.itinerario.render(v, app.querySelector('.itin-global'));
    // Viajando: arranca en el día de hoy
    const hoyEl = app.querySelector('.itin-global .dia.hoy');
    if (hoyEl && !idElegido) setTimeout(() => hoyEl.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);
  }

  /* ---------- Copia de seguridad (desde Mi cuenta) ---------- */
  function exportar() {
    const blob = new Blob([R.db.exportar()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rutenda-copia-${U.hoyISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    R.db.guardarPrefs({ ultimaCopia: U.hoyISO() });
    U.toast('Copia descargada. Guardala en Drive o en tu mail.');
  }

  function importar(archivo, alTerminar) {
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = async () => {
      const ok = await U.confirmar('Se suman los viajes de la copia. Si alguno ya está, se reemplaza por el de la copia. No se borra nada.', { titulo: 'Restaurar copia', textoSi: 'Restaurar' });
      if (!ok) return;
      try {
        const r = R.db.importar(lector.result);
        U.toast(r.nuevos || r.actualizados ? `Listo: ${[r.nuevos ? U.plural(r.nuevos, 'viaje nuevo', 'viajes nuevos') : '', r.actualizados ? U.plural(r.actualizados, 'actualizado', 'actualizados') : ''].filter(Boolean).join(' y ')}.` : 'La copia no tenía viajes para sumar.');
        render();
        if (alTerminar) alTerminar();
      } catch (err) {
        U.toast(err.message || 'No se pudo leer la copia.');
      }
    };
    lector.readAsText(archivo);
  }

  /* ---------- "Resolverlo": abre el paso directo desde una tarjeta ---------- */
  function abrirSiguiente(e) {
    const sig = e.target.closest && e.target.closest('[data-siguiente]');
    if (!sig || !app.contains(sig)) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    const v = R.db.viaje(sig.dataset.viaje);
    if (!v) return;
    location.hash = `#viaje/${v.id}/guia`;
    setTimeout(() => R.vistaGuia.abrirTarea(v, sig.dataset.siguiente), 200);
  }
  app.addEventListener('click', abrirSiguiente, true);
  app.addEventListener('keydown', abrirSiguiente, true);

  /* ---------- Arranque ---------- */
  R.db.alCambiar(() => { if (listo && R.auth.usuarioActual()) { refrescarRemoto(); if (R.recordatorios) R.recordatorios.actualizar(); } });
  R.auth.alCambiarUsuario(u => { if (!u) { listo = true; render(); } });
  document.getElementById('btnNuevoViajeBarra').onclick = () => R.viajes.abrirAsistente();
  document.getElementById('btnNuevoViajeNav').onclick = () => R.viajes.abrirAsistente();
  document.getElementById('btnMenu').onclick = () => R.menu.abrir();
  document.getElementById('btnCargarNav').onclick = () => R.cargar.abrir();
  document.getElementById('btnCargarBarra').onclick = () => R.cargar.abrir();
  /* ---------- Botón "Volver" en todas las pantallas (menos el inicio) ---------- */
  const pila = [];
  const clavePila = h => { const p = (h || '#inicio').replace(/^#/, '').split('/'); return p[0] === 'viaje' ? 'viaje/' + p[1] : p[0] || 'inicio'; };
  function padre(h) {
    const p = (h || '').replace(/^#/, '').split('/');
    if (p[0] === 'viaje') return '#viajes';
    return '#inicio';
  }
  function anotarRuta() {
    const h = location.hash || '#inicio';
    const k = clavePila(h);
    if (pila.length > 1 && clavePila(pila[pila.length - 2]) === k) pila.pop();
    if (pila.length && clavePila(pila[pila.length - 1]) === k) pila[pila.length - 1] = h;
    else pila.push(h);
    if (pila.length > 30) pila.shift();
    const b = document.getElementById('btnAtras');
    if (b) b.hidden = k === 'inicio' || !R.auth.usuarioActual();
  }
  document.getElementById('btnAtras').onclick = () => {
    const destino = pila.length > 1 ? pila[pila.length - 2] : padre(location.hash);
    location.hash = destino;
  };
  window.addEventListener('hashchange', anotarRuta);
  window.addEventListener('hashchange', () => {
    if (R.menu) R.menu.cerrar();
    const ruta = location.hash.split('/').slice(0, 2).join('/');
    const cambioDeVista = ruta !== rutaAnterior;
    rutaAnterior = ruta;
    U.cerrarModal();
    render();
    if (cambioDeVista) window.scrollTo(0, 0);
  });
  // Teclado abierto en el celular: escondemos la barra inferior para que no quede flotando
  (function () {
    const esCampo = el => el && (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(el.type) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    const revisar = () => {
      const vv = window.visualViewport;
      const achicado = vv ? vv.height < window.innerHeight * 0.78 : false;
      document.body.classList.toggle('teclado-abierto', esCampo(document.activeElement) || achicado);
    };
    document.addEventListener('focusin', revisar);
    document.addEventListener('focusout', () => setTimeout(revisar, 60));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', revisar);
  })();
  rutaAnterior = location.hash.split('/').slice(0, 2).join('/');
  app.innerHTML = '<div class="pantalla-carga"><span class="marca-logo grande"></span><p>Abriendo Rutenda…</p></div>';
  R.auth.iniciar().then(async u => {
    listo = true;
    setTimeout(anotarRuta, 0);
    if (u) await arrancarSesion(u); else render();
  });
})();
