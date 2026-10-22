/* =========================================================
   Rutenda — tour de la app
   Recorrido corto que resalta cada parte de la pantalla y
   explica para qué sirve. Aparece la primera vez y se puede
   volver a ver desde "Mi cuenta".
   ========================================================= */
window.R = window.R || {};

R.tour = (function () {
  const U = R.util;
  const { esc } = U;

  const PASOS = [
    { titulo: '¡Bienvenido a Rutenda! 👋', texto: 'Te muestro en un minuto cómo funciona. Podés saltearlo cuando quieras.' },
    { sel: ['#btnNuevoViajeNav', '#btnNuevoViajeBarra'], titulo: 'Armá un viaje', texto: 'Con el + de arriba. Tres preguntas: a dónde vas, cuándo y qué ya tenés. Con eso Rutenda arma tu guía paso a paso.' },
    { sel: ['#btnCargarNav', '#btnCargarBarra'], titulo: 'Cargá al toque', texto: 'Un gasto, un documento o algo para la valija, sin entrar al viaje. Si estás viajando, ya sabe a qué viaje va.' },
    { sel: ['.nav-inferior [data-nav="viajes"]', '.barra .nav [data-nav="viajes"]'], titulo: 'Tus viajes', texto: 'Los próximos, el que estás haciendo y los que ya hiciste, con el mapa de todos tus destinos.' },
    { sel: ['.nav-inferior [data-nav="valijas"]', '.barra .nav [data-nav="valijas"]'], titulo: 'Listas de valija', texto: 'Armá una vez lo que llevás siempre y sumalo a cada viaje con un toque.' },
    { sel: ['#btnMenu'], titulo: 'El menú ☰', texto: 'Tus datos, el modo claro u oscuro, la copia de seguridad y tus compañeros de viaje.' },
    { titulo: 'Adentro de cada viaje', texto: '🧭 Guía: qué resolver y en qué orden.\n🗓️ Itinerario: los días y tu lista de qué hacer.\n💸 Gastos: quién pagó y cuentas claras.\n🧳 Valija y 📁 Docs: todo a mano, también sin señal.\n☀️ Y mientras viajás, la pestaña Hoy con lo de cada día.' }
  ];

  let i = 0, capa = null;

  function visible(sel) {
    for (const s of [].concat(sel || [])) {
      const el = document.querySelector(s);
      if (el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') return el;
    }
    return null;
  }

  function limpiar() { /* nada que limpiar: el foco se dibuja en la capa */ }

  function pintar() {
    limpiar();
    const p = PASOS[i];
    const el = visible(p.sel);
    if (el) el.scrollIntoView({ block: 'nearest' });
    const r = el ? el.getBoundingClientRect() : null;
    capa.classList.toggle('tour-sin-objetivo', !el);
    capa.innerHTML = (r ? `<div class="tour-foco" style="top:${r.top - 6}px;left:${r.left - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>` : '') + `
      <div class="tour-tarjeta" role="dialog" aria-modal="true" aria-label="${esc(p.titulo)}">
        <small>${i + 1} de ${PASOS.length}</small>
        <h3>${esc(p.titulo)}</h3>
        <p>${esc(p.texto).replace(/\n/g, '<br>')}</p>
        <div class="tour-acciones">
          <button type="button" class="btn btn-texto btn-chico" data-tour="saltar">${i === PASOS.length - 1 ? '' : 'Saltar'}</button>
          <span>
            ${i > 0 ? '<button type="button" class="btn btn-suave btn-chico" data-tour="atras">Atrás</button>' : ''}
            <button type="button" class="btn btn-primario btn-chico" data-tour="seguir">${i === PASOS.length - 1 ? '¡Listo!' : 'Siguiente'}</button>
          </span>
        </div>
      </div>`;
    // La tarjeta va del lado contrario al elemento resaltado
    const t = capa.querySelector('.tour-tarjeta');
    if (r) {
      const abajo = r.top < window.innerHeight / 2;
      t.style.top = abajo ? Math.min(r.bottom + 16, window.innerHeight - 280) + 'px' : 'auto';
      t.style.bottom = abajo ? 'auto' : Math.max(window.innerHeight - r.top + 16, 16) + 'px';
    }
    capa.querySelector('[data-tour="seguir"]').onclick = () => { if (i === PASOS.length - 1) cerrar(); else { i++; pintar(); } };
    const at = capa.querySelector('[data-tour="atras"]');
    if (at) at.onclick = () => { i--; pintar(); };
    capa.querySelector('[data-tour="saltar"]').onclick = cerrar;
  }

  function cerrar() {
    limpiar();
    if (capa) capa.remove();
    capa = null;
    document.removeEventListener('keydown', teclas);
    window.removeEventListener('resize', repintar);
    R.db.guardarPrefs({ tourVisto: true });
  }
  function teclas(e) { if (e.key === 'Escape') cerrar(); }
  function repintar() { if (capa) pintar(); }

  function iniciar() {
    if (capa) return;
    if (location.hash && !/^#(inicio)?$/.test(location.hash)) location.hash = '#inicio';
    i = 0;
    capa = document.createElement('div');
    capa.className = 'tour-capa';
    document.body.appendChild(capa);
    document.addEventListener('keydown', teclas);
    window.addEventListener('resize', repintar);
    setTimeout(pintar, 120);
  }

  /** La primera vez que entrás. */
  function siCorresponde() {
    try { if (R.db.prefs().tourVisto) return; } catch (e) { return; }
    // Solo desde el inicio (no interrumpe, por ejemplo, cuando entrás con una invitación)
    if (location.hash && !/^#(inicio)?$/.test(location.hash)) return;
    setTimeout(() => { if (!location.hash || /^#(inicio)?$/.test(location.hash)) iniciar(); }, 700);
  }

  return { iniciar, siCorresponde, cerrar, PASOS };
})();
