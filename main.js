/* =========================================================
   Tripbox — arranque, navegación y pantalla de inicio
   Rutas:
     #inicio                 → mis viajes
     #viaje/{id}/{pestaña}   → un viaje (guia, itinerario, documentos, viajeros, gastos)
     #personas               → compañeros de viaje
   ========================================================= */
(function () {
  const U = R.util;
  const { esc } = U;
  const app = document.getElementById('app');
  let rutaAnterior = '';

  function render() {
    if (!R.auth.usuarioActual()) {
      document.body.classList.add('sin-sesion');
      document.title = 'Tripbox · Ingresá';
      R.auth.renderPantalla(app, arrancarSesion);
      return;
    }
    document.body.classList.remove('sin-sesion');
    const hash = location.hash.replace(/^#/, '') || 'inicio';
    const [vista, id, pestana] = hash.split('/');
    document.querySelectorAll('[data-nav]').forEach(a => {
      a.classList.toggle('activo', a.dataset.nav === vista || (vista === 'viaje' && a.dataset.nav === 'inicio'));
    });

    if (vista === 'viaje' && id) {
      const v = R.db.viaje(id);
      if (!v) { location.hash = '#inicio'; return; }
      document.title = `${v.nombre || v.destino} · Tripbox`;
      R.viajes.renderViaje(app, v, pestana || 'guia');
    } else if (vista === 'valijas') {
      document.title = 'Mis listas de valija · Tripbox';
      R.valija.renderMisListas(app);
    } else if (vista === 'personas') {
      document.title = 'Compañeros · Tripbox';
      R.participantes.renderPersonas(app);
    } else {
      document.title = 'Tripbox · Tu viaje, paso a paso';
      renderInicio();
    }
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
    const boton = document.getElementById('btnUsuario');
    const u = R.auth.usuarioActual();
    if (!u) { boton.innerHTML = ''; return; }
    boton.innerHTML = U.avatar(R.db.yo(), 34);
    boton.title = `${u.nombre} · Mi cuenta`;
  }

  function arrancarSesion() {
    R.db.cargar(R.auth.usuarioActual());
    pintarUsuario();
    if (!location.hash || location.hash === '#') location.hash = '#inicio';
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- App instalable ---------- */
  let eventoInstalar = null;
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const esInstalada = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    eventoInstalar = e;
    if ((location.hash || '#inicio').startsWith('#inicio')) refrescar();
  });
  window.addEventListener('appinstalled', () => { eventoInstalar = null; U.toast('¡Tripbox quedó instalada! 🎉'); refrescar(); });
  function puedeInstalar() { return !esInstalada() && (!!eventoInstalar || esIOS); }
  async function instalar() {
    if (eventoInstalar) {
      eventoInstalar.prompt();
      await eventoInstalar.userChoice;
      eventoInstalar = null;
      refrescar();
    } else if (esIOS) {
      U.modal({
        titulo: 'Instalar Tripbox',
        cuerpo: '<ol class="pasos-instalar"><li>Tocá el botón <strong>Compartir</strong> de Safari (el cuadrado con la flecha).</li><li>Elegí <strong>Agregar a inicio</strong>.</li><li>Listo: Tripbox se abre como una app, a pantalla completa.</li></ol>',
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

  window.R.app = { render, refrescar, pintarUsuario, puedeInstalar, instalar };

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
    const pasados = porEstado('pasado').sort((a, b) => (b.fechaFin || '').localeCompare(a.fechaFin || ''));
    const destacado = enCurso[0] || planificando[0];

    app.innerHTML = `
      <section class="hero">
        ${U.paisaje(null, { transporte: destacado ? destacado.perfil.transporte : 'avion', progreso: destacado ? R.motor.progreso(destacado).pct / 100 : 0.55 })}
        <div class="hero-contenido">
          <p class="hero-saludo">${U.saludo()}${esc(nombre)} ☀️</p>
          <h1>${viajes.length ? '¿Seguimos organizando?' : '¿A dónde vamos?'}</h1>
          <p class="hero-frase">${esc(U.frase())}</p>
          <button class="btn btn-primario btn-grande" data-a="nuevo">+ Planificar un viaje</button>
        </div>
      </section>

      ${puedeInstalar() && !leerOculto('instalar') ? `
        <div class="aviso-instalar">
          <span class="ai-icono"></span>
          <div><strong>Instalá Tripbox en tu celular</strong><small>Se abre como una app, a pantalla completa y sin conexión.</small></div>
          <button class="btn btn-primario btn-chico" data-a="instalar">Instalar</button>
          <button class="btn-icono" data-a="ocultarInstalar" aria-label="Ahora no">×</button>
        </div>` : ''}

      ${destacado ? destacadoHTML(destacado) : ''}

      ${!viajes.length ? comoFunciona() : ''}

      ${seccion('En curso', enCurso.filter(v => v !== destacado))}
      ${seccion('Planificando', planificando.filter(v => v !== destacado))}
      ${seccion('Viajes realizados', pasados)}

      <footer class="pie">
        <p>Tus datos se guardan en este dispositivo.</p>
        <div class="pie-acciones">
          <button class="btn btn-texto btn-chico" data-a="exportar">Descargar copia de seguridad</button>
          <label class="btn btn-texto btn-chico">Restaurar copia<input type="file" accept="application/json" id="importar" hidden></label>
        </div>
      </footer>`;

    app.querySelectorAll('[data-a="nuevo"]').forEach(b => b.onclick = () => R.viajes.abrirAsistente());
    const bInst = app.querySelector('[data-a="instalar"]');
    if (bInst) bInst.onclick = instalar;
    const bOcultar = app.querySelector('[data-a="ocultarInstalar"]');
    if (bOcultar) bOcultar.onclick = () => { try { localStorage.setItem('tripbox_oculto_instalar', '1'); } catch (e) { /* sin almacenamiento */ } refrescar(); };
    const sig = app.querySelector('[data-siguiente]');
    if (sig) sig.onclick = e => {
      e.preventDefault();
      const v = R.db.viaje(sig.dataset.viaje);
      location.hash = `#viaje/${v.id}/guia`;
      setTimeout(() => R.vistaGuia.abrirTarea(v, sig.dataset.siguiente), 200);
    };
    app.querySelector('[data-a="exportar"]').onclick = exportar;
    app.querySelector('#importar').onchange = importar;
  }

  function leerOculto(clave) { try { return localStorage.getItem('tripbox_oculto_' + clave) === '1'; } catch (e) { return false; } }

  function destacadoHTML(v) {
    const prog = R.motor.progreso(v);
    const prox = R.motor.proximos(v, 1)[0];
    return `
      <section class="destacado">
        <a class="destacado-portada" href="#viaje/${v.id}/guia" style="background:${U.portada(v.destino)}">
          ${U.paisaje(v)}
          <span class="etiqueta-clara">${R.viajes.estadoViaje(v) === 'en_curso' ? 'Viajando ahora' : 'Tu próximo viaje'}</span>
          <h2>${esc(v.nombre || (v.destinos || []).filter(d => !d.soloDia).map(d => d.nombre).join(' → ') || v.destino)}</h2>
          <p>${esc(R.viajes.destinoCompleto(v))} · ${esc(U.fmtRango(v.fechaInicio, v.fechaFin))}</p>
          <strong class="destacado-cuenta">${esc(R.viajes.cuentaRegresiva(v))}</strong>
        </a>
        <div class="destacado-lado">
          <div class="destacado-progreso">
            ${U.anillo(prog.pct, 76)}
            <div><strong>${prog.hechas} de ${prog.total} pasos</strong><small class="texto-suave">organizados</small></div>
          </div>
          ${prox ? `
            <div class="destacado-siguiente">
              <small>Siguiente paso</small>
              <strong>${R.guia.fase(prox.fase).icono} ${esc(prox.titulo)}</strong>
              <a href="#" class="btn btn-primario btn-chico" data-siguiente="${prox.id}" data-viaje="${v.id}">Resolverlo</a>
            </div>` : `<p class="texto-suave">¡Nada pendiente por ahora! 🌴</p>`}
          <a href="#viaje/${v.id}/guia" class="btn btn-suave btn-chico">Ver el viaje completo →</a>
        </div>
      </section>`;
  }

  function seccion(titulo, lista) {
    if (!lista.length) return '';
    return `
      <section class="seccion-viajes">
        <h2 class="titulo-seccion">${esc(titulo)} <span class="contador">${lista.length}</span></h2>
        <div class="grilla-viajes">${lista.map(R.viajes.tarjeta).join('')}</div>
      </section>`;
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

  /* ---------- Copia de seguridad ---------- */
  function exportar() {
    const blob = new Blob([R.db.exportar()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tripbox-copia-${U.hoyISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    U.toast('Copia descargada. Los archivos adjuntos no se incluyen.');
  }

  function importar(e) {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = async () => {
      const ok = await U.confirmar('Esto reemplaza los datos actuales por los de la copia.', { titulo: 'Restaurar copia', textoSi: 'Restaurar', peligro: true });
      if (!ok) return;
      try {
        R.db.importar(lector.result);
        U.toast('Copia restaurada.');
        render();
      } catch (err) {
        U.toast(err.message || 'No se pudo leer la copia.');
      }
    };
    lector.readAsText(archivo);
  }

  /* ---------- Arranque ---------- */
  if (R.auth.usuarioActual()) R.db.cargar(R.auth.usuarioActual());
  pintarUsuario();
  document.getElementById('btnNuevoViajeBarra').onclick = () => R.viajes.abrirAsistente();
  document.getElementById('btnUsuario').onclick = () => R.auth.abrirMiCuenta();
  document.getElementById('btnNuevoViajeNav').onclick = () => R.viajes.abrirAsistente();
  document.getElementById('btnCuentaNav').onclick = () => R.auth.abrirMiCuenta();
  window.addEventListener('hashchange', () => {
    const ruta = location.hash.split('/').slice(0, 2).join('/');
    const cambioDeVista = ruta !== rutaAnterior;
    rutaAnterior = ruta;
    U.cerrarModal();
    render();
    if (cambioDeVista) window.scrollTo(0, 0);
  });
  rutaAnterior = location.hash.split('/').slice(0, 2).join('/');
  render();
})();
