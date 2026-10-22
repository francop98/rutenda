/* =========================================================
   Rutenda — utilidades generales
   Fechas, formato, modales, avisos y piezas visuales comunes.
   ========================================================= */
window.R = window.R || {};

/** Versión de la app (cambios chicos: 10.1, 10.2…; cambios grandes: 11, 12…). Igual que VERSION en sw.js. */
window.R.VERSION = '17';

R.util = (function () {
  const pad = n => String(n).padStart(2, '0');

  const MONEDAS = ['ARS', 'USD', 'EUR', 'BRL', 'CLP', 'UYU', 'PYG', 'BOB', 'PEN', 'COP', 'MXN', 'GBP'];

  function id(prefijo) {
    return (prefijo || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ---------- Fechas (siempre ISO local yyyy-mm-dd) ---------- */
  function aISO(f) { return f.getFullYear() + '-' + pad(f.getMonth() + 1) + '-' + pad(f.getDate()); }
  function hoyISO() { return aISO(new Date()); }
  function aFecha(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
  function sumarDias(iso, n) {
    const f = aFecha(iso);
    if (!f) return null;
    f.setDate(f.getDate() + n);
    return aISO(f);
  }
  /** Días desde a hasta b (b - a). */
  function diasEntre(a, b) {
    const fa = aFecha(a), fb = aFecha(b);
    if (!fa || !fb) return null;
    return Math.round((fb - fa) / 86400000);
  }
  function fmtFecha(iso, estilo) {
    const f = aFecha(iso);
    if (!f) return '';
    let op;
    if (estilo === 'largo') op = { weekday: 'long', day: 'numeric', month: 'long' };
    else if (estilo === 'corto') op = { day: 'numeric', month: 'short' };
    else if (estilo === 'dia') op = { weekday: 'short', day: 'numeric', month: 'short' };
    else op = { day: 'numeric', month: 'short', year: 'numeric' };
    return f.toLocaleDateString('es-AR', op);
  }
  function fmtRango(a, b) {
    if (!a) return 'Fechas a definir';
    if (!b || a === b) return fmtFecha(a);
    const fa = aFecha(a), fb = aFecha(b);
    if (fa.getFullYear() === fb.getFullYear() && fa.getMonth() === fb.getMonth()) return fa.getDate() + ' al ' + fmtFecha(b);
    if (fa.getFullYear() === fb.getFullYear()) return fmtFecha(a, 'corto') + ' al ' + fmtFecha(b);
    return fmtFecha(a) + ' – ' + fmtFecha(b);
  }
  function plural(n, uno, varios) { return n + ' ' + (Math.abs(n) === 1 ? uno : varios); }

  /* ---------- Números ---------- */
  function redondear(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function fmtMoneda(n, moneda) {
    try {
      return new Intl.NumberFormat('es-AR', {
        style: 'currency', currency: moneda || 'ARS', maximumFractionDigits: 2, minimumFractionDigits: 0
      }).format(n || 0);
    } catch (e) {
      return (moneda || '') + ' ' + redondear(n).toLocaleString('es-AR');
    }
  }
  function fmtTamano(b) {
    if (!b && b !== 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return Math.round(b / 1024) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  function numero(valor) {
    if (typeof valor === 'number') return valor;
    const n = parseFloat(String(valor || '').replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  /* ---------- Colores e identidad visual ---------- */
  function hash(str) {
    let h = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  const PORTADAS = [
    ['#2f7d7b', '#9cc9b9'], // mar y laguna
    ['#c9785a', '#f2c48d'], // atardecer
    ['#466a8f', '#a9c6dd'], // cielo
    ['#6d8a5c', '#cfdcb2'], // montaña
    ['#8a5a7a', '#e2b9c8'], // lavanda
    ['#b8893a', '#f1dc9e'], // desierto
    ['#3d6e70', '#e7c9a1']  // costa
  ];
  function portada(texto) {
    const [a, b] = PORTADAS[hash(texto) % PORTADAS.length];
    return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
  }
  const COLORES_PERSONA = ['#2E5A52', '#c9785a', '#466a8f', '#6d8a5c', '#8a5a7a', '#b8893a', '#5b6f9e', '#a05d5d'];
  function colorPersona(semilla) { return COLORES_PERSONA[hash(semilla) % COLORES_PERSONA.length]; }
  function iniciales(nombre) {
    const partes = String(nombre || '?').trim().split(/\s+/);
    return ((partes[0] || '?')[0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
  }
  function avatar(persona, tam) {
    if (!persona) return '';
    const t = tam || 34;
    return `<span class="avatar" style="width:${t}px;height:${t}px;font-size:${Math.round(t * 0.4)}px;background:${persona.color || colorPersona(persona.id)}" title="${esc(persona.nombre)}">${esc(iniciales(persona.nombre))}</span>`;
  }

  /** Anillo de progreso hecho con conic-gradient. */
  function anillo(pct, tam, etiqueta) {
    const t = tam || 64;
    const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
    return `<div class="anillo" style="--p:${p};width:${t}px;height:${t}px">
      <div class="anillo-centro"><strong>${p}%</strong>${etiqueta ? `<span>${esc(etiqueta)}</span>` : ''}</div>
    </div>`;
  }

  function saludo() {
    const h = new Date().getHours();
    if (h < 6) return 'Buenas noches';
    if (h < 13) return 'Buen día';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  }

  const FRASES = [
    'Cada gran viaje empieza con un primer paso bien elegido.',
    'Organizá con calma hoy, disfrutá sin apuro mañana.',
    'Lo importante primero; lo lindo, siempre.',
    'Un plan claro deja más lugar para la sorpresa.',
    'Menos pendientes, más horizonte.',
    'Viajar liviano también es viajar sin preocupaciones.',
    'El mejor souvenir es haberlo disfrutado tranquilo.'
  ];
  function frase() {
    const d = new Date();
    return FRASES[(d.getDate() + d.getMonth()) % FRASES.length];
  }

  /** Paisaje decorativo (ver paisajeviaje.js): personalizado si recibe un viaje. */
  function paisaje(v, opciones) { return R.paisaje ? R.paisaje.svg(v || null, opciones) : ''; }

  /* ---------- Modal ---------- */
  let modalActivo = null;
  let scrollGuardado = null;

  /** Congela el fondo mientras hay un cartel abierto (también en iPhone). */
  function bloquearFondo() {
    if (scrollGuardado !== null) return;
    scrollGuardado = window.scrollY || 0;
    document.body.style.top = `-${scrollGuardado}px`;
    document.body.classList.add('sin-scroll');
  }
  function liberarFondo() {
    if (scrollGuardado === null) return;
    const y = scrollGuardado;
    scrollGuardado = null;
    document.body.classList.remove('sin-scroll');
    document.body.style.top = '';
    window.scrollTo(0, y);
  }
  function fondoBloqueado() { return scrollGuardado; }

  function modal(opciones) {
    const { titulo, cuerpo, acciones = [], ancho, alAbrir, alCerrar, subtitulo } = opciones;
    cerrarModal();
    const capa = document.getElementById('capaModal');
    const el = document.createElement('div');
    el.className = 'modal-fondo';
    el.innerHTML = `
      <div class="modal ${ancho ? 'modal-ancho' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
        <div class="modal-cab">
          <div>
            <h3>${esc(titulo)}</h3>
            ${subtitulo ? `<p class="modal-sub">${esc(subtitulo)}</p>` : ''}
          </div>
          <button class="modal-x" type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-cuerpo">${cuerpo || ''}</div>
        ${acciones.length ? `<div class="modal-pie">${acciones.map((a, i) =>
          `<button type="button" class="btn ${a.clase || 'btn-suave'}" data-accion="${i}">${esc(a.texto)}</button>`).join('')}</div>` : ''}
      </div>`;
    capa.appendChild(el);
    bloquearFondo();
    el.addEventListener('mousedown', e => { if (e.target === el) cerrarModal(); });
    el.querySelector('.modal-x').addEventListener('click', cerrarModal);
    el.querySelectorAll('[data-accion]').forEach(b => {
      b.addEventListener('click', () => {
        const a = acciones[Number(b.dataset.accion)];
        const r = a.onClick ? a.onClick(el) : undefined;
        if (r !== false && modalActivo && modalActivo.el === el) cerrarModal();
      });
    });
    modalActivo = { el, alCerrar };
    if (alAbrir) alAbrir(el);
    return { el, cerrar: cerrarModal };
  }

  function cerrarModal() {
    if (!modalActivo) return;
    const { el, alCerrar } = modalActivo;
    modalActivo = null;
    el.remove();
    liberarFondo();
    if (alCerrar) alCerrar();
    if (R.app && R.app.trasCerrarModal) setTimeout(R.app.trasCerrarModal, 0);
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarModal(); });

  function confirmar(mensaje, opciones) {
    const op = opciones || {};
    return new Promise(resolver => {
      let respondido = false;
      modal({
        titulo: op.titulo || '¿Seguro?',
        cuerpo: `<p class="texto-suave">${esc(mensaje)}</p>`,
        acciones: [
          { texto: op.textoNo || 'Cancelar', clase: 'btn-suave', onClick: () => { respondido = true; resolver(false); } },
          { texto: op.textoSi || 'Confirmar', clase: op.peligro ? 'btn-peligro' : 'btn-primario', onClick: () => { respondido = true; resolver(true); } }
        ],
        alCerrar: () => { if (!respondido) resolver(false); }
      });
    });
  }

  /* ---------- Aviso breve ---------- */
  let temporizadorToast = null;
  function toast(mensaje) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = mensaje;
    t.classList.add('visible');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => t.classList.remove('visible'), 3200);
  }

  function opcionesMoneda(seleccionada) {
    return MONEDAS.map(m => `<option value="${m}" ${m === seleccionada ? 'selected' : ''}>${m}</option>`).join('');
  }

  /**
   * Fechas vacías con data-sugerir: al abrir el calendario arranca en esa fecha
   * (por ejemplo, la vuelta arranca en la fecha de ida) en vez de en hoy.
   */
  function sugerirFechas(cont) {
    cont.querySelectorAll('input[type="date"][data-sugerir]').forEach(el => {
      const poner = () => { if (!el.value && el.dataset.sugerir) el.value = el.dataset.sugerir; };
      el.addEventListener('pointerdown', poner);
      el.addEventListener('focus', poner);
    });
  }

  /** Campo de contraseña con botón para mostrarla u ocultarla. */
  function campoClave(id, etiqueta, autocomplete) {
    return `<label class="campo campo-clave"><span>${esc(etiqueta)}</span>
      <span class="clave-envoltura"><input id="${id}" type="password" autocomplete="${autocomplete || 'current-password'}">
      <button type="button" class="ver-clave" data-ver-clave="${id}" aria-label="Mostrar contraseña" aria-pressed="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="tachado" d="M4 4l16 16"/></svg>
      </button></span></label>`;
  }
  function enlazarClaves(cont) {
    cont.querySelectorAll('[data-ver-clave]').forEach(b => b.onclick = e => {
      e.preventDefault();
      const input = cont.querySelector('#' + b.dataset.verClave);
      const ver = input.type === 'password';
      input.type = ver ? 'text' : 'password';
      b.classList.toggle('visible', ver);
      b.setAttribute('aria-pressed', String(ver));
      b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
  }

  return {
    campoClave, enlazarClaves, sugerirFechas,
    MONEDAS, fondoBloqueado, id, esc, aISO, hoyISO, aFecha, sumarDias, diasEntre, fmtFecha, fmtRango, plural,
    redondear, fmtMoneda, fmtTamano, numero, hash, portada, colorPersona, iniciales, avatar,
    anillo, saludo, frase, paisaje, modal, cerrarModal, confirmar, toast, opcionesMoneda
  };
})();
