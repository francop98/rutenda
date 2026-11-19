// Íconos, logo y componentes visuales compartidos.

import { esc, toISO } from './formato.js';
import { allCategories, categoriasOrdenadas } from './categorias.js';

const P = {
  candy: '<path d="M7.5 7.5l9 9"/><rect x="7" y="7" width="10" height="10" rx="5" transform="rotate(45 12 12)"/><path d="M5 9L2.5 6.5 5 5 6.5 2.5 9 5M15 19l2.5 2.5L19 19l2.5-1.5L19 15"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  dumbbell: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 20h20"/>',
  baby: '<circle cx="12" cy="8" r="4"/><path d="M10.5 8h.01M13.5 8h.01M6 21a6 6 0 0 1 12 0"/>',
  paw: '<circle cx="6" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="14" cy="6" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 3-4 2-2 1-4 0-4-2z"/>',
  plane: '<path d="M10.5 13L3 10l1.5-1.5 8 1L17 5a2 2 0 0 1 3 3l-4.5 4.5 1 8L15 22l-3-7.5L8.5 18v3L7 22l-1.5-3.5L2 17l1-1.5h3z"/>',
  doc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7M9 14v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  moves: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M12 14c0-3.5-2.5-6-6-6 0 3.5 2.5 6 6 6z"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  receipt: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  cart: '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 11h10M14 8h3l3 3v8a2 2 0 0 1-4 0v-4h-2"/>',
  food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2.5 1.5-3 4-3 7h3"/>',
  bus: '<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M8 18v3M16 18v3M8 14.5h.01M16 14.5h.01"/>',
  sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 18v2M19 18v2"/>',
  bike: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-7h5l3 7M10 10L8 6H6M15 10l-2-4h3"/>',
  heart: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z"/>',
  shirt: '<path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3z"/><path d="M13 6v12" stroke-dasharray="2 2"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8c-1-3-5-4-5-1.5S10 8 12 8zM12 8c1-3 5-4 5-1.5S14 8 12 8z"/>',
  book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8v.5"/><path d="M12 17h.01"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v13H5a2 2 0 0 1-2-2V5"/><circle cx="16" cy="14" r="1.5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  text: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>',
  paste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
};

export function icon(name, size = 22, width = 2) {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.tag}</svg>`;
}

// Brote lleno (ícono de la app)
export function sprout(size = 24, color = '#C6F36B') {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 48 48"><path d="M24 42V26" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/><path d="M24 26C24 16 31 9 40 9 40 18 33 26 24 26Z" fill="${color}"/><path d="M24 31C24 23 18 18 10 18 10 26 16 31 24 31Z" fill="${color}"/></svg>`;
}

// Logotipo: "pesitos" con el brote en la i
export function wordmark(size = 26, ink = 'var(--ink)', leaf = 'var(--logo-leaf)') {
  const w = Math.round(size * 0.34); const h = Math.round(size * 1.1);
  return `<span class="wordmark" style="font-size:${size}px;color:${ink}" role="img" aria-label="Pesitos"><span aria-hidden="true">pe<span class="wm-dollar">$</span></span><svg aria-hidden="true" width="${w}" height="${h}" viewBox="0 0 16 50"><rect x="4.5" y="22" width="7" height="25" rx="2" fill="currentColor"/><path d="M8 18C8 12 11 8 16 8 16 13 13 17 8 18Z" style="fill:${leaf}"/><path d="M8 19C8 14 5 11 0 11 0 16 3 18.5 8 19Z" style="fill:${leaf}"/></svg><span aria-hidden="true">tos</span></span>`;
}

export function ring(p, size = 72, stroke = 8, label = '', color = 'var(--green)', track = 'var(--track)') {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const v = Math.max(0, Math.min(1, p));
  return `<svg class="ring" role="img" aria-label="${esc(label || Math.round(v * 100) + '%')}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:${track}" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    ${size >= 60 ? `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" style="fill:var(--ink)" font-size="${Math.round(size * 0.22)}" font-weight="800">${Math.round(v * 100)}%</text>` : ''}
  </svg>`;
}

export function tipCard(t) {
  const amber = t.tone === 'warn';
  return `<div class="card ${amber ? 'amber' : ''}">
    <div class="tip-head">${amber ? `<span style="color:var(--amber)">${icon('bulb', 22)}</span>` : `<span class="badge">${sprout(17)}</span>`}<strong>${esc(t.title)}</strong></div>
    <p class="text">${esc(t.text)}</p>
    ${t.cta || t.id ? `<div class="btn-row">
      ${t.cta ? `<button class="btn small ${amber ? '' : 'green'}" data-action="${t.cta.action}" ${t.cta.id ? `data-id="${esc(t.cta.id)}"` : ''}>${esc(t.cta.label)}</button>` : ''}
      ${t.id ? `<button class="btn small" data-action="tipNo" data-tip="${esc(t.id)}">${/^promo-/.test(t.id) ? 'No esta vez' : 'Ocultar'}</button>` : ''}
    </div>` : ''}
  </div>`;
}

// ---------- modal (hoja inferior con "volver") ----------
// Se puede deslizar: hacia arriba y abajo para recorrerla, y hacia abajo desde
// arriba de todo (o desde la manija) para cerrarla.
function activarDeslizar(sheet) {
  if (sheet.dataset.deslizar) return;
  sheet.dataset.deslizar = '1';
  let y0 = 0; let dy = 0; let t0 = 0; let arrastrando = false; let posible = false;
  sheet.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const enManija = e.target.closest('.modal-grab, .modal-head');
    posible = enManija || sheet.scrollTop <= 0;
    y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); arrastrando = false;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (!posible) return;
    dy = e.touches[0].clientY - y0;
    if (!arrastrando && dy > 8 && (sheet.scrollTop <= 0 || e.target.closest('.modal-grab, .modal-head'))) { arrastrando = true; sheet.style.transition = 'none'; }
    if (!arrastrando) { if (dy < 0) posible = false; return; }
    if (e.cancelable) e.preventDefault();
    sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, { passive: false });
  const soltar = () => {
    if (!arrastrando) return;
    arrastrando = false;
    const rapido = dy > 60 && Date.now() - t0 < 250;
    sheet.style.transition = 'transform .18s ease-out';
    if (dy > Math.min(140, sheet.offsetHeight * 0.3) || rapido) {
      sheet.style.transform = 'translateY(100%)';
      setTimeout(() => { sheet.style.transition = ''; sheet.style.transform = ''; closeModal(); }, 170);
    } else {
      sheet.style.transform = '';
      setTimeout(() => { sheet.style.transition = ''; }, 200);
    }
  };
  sheet.addEventListener('touchend', soltar);
  sheet.addEventListener('touchcancel', soltar);
}

// ---------- la pantalla de atrás no se mueve ----------
// Con una hoja, el menú o el tutorial abiertos, el fondo queda fijo (también en iPhone,
// donde overflow:hidden no alcanza): se fija el body en su lugar y se devuelve al cerrar.
const bloqueos = new Set(); let scrollGuardado = 0;
export function bloquearFondo(quien) {
  if (bloqueos.has(quien)) return;
  if (!bloqueos.size) {
    scrollGuardado = window.scrollY || document.documentElement.scrollTop || 0;
    const b = document.body.style;
    b.position = 'fixed'; b.top = `-${scrollGuardado}px`; b.left = '0'; b.right = '0'; b.width = '100%'; b.overflow = 'hidden';
  }
  bloqueos.add(quien);
}
export function liberarFondo(quien) {
  if (!bloqueos.delete(quien) || bloqueos.size) return;
  const b = document.body.style;
  b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.width = ''; b.overflow = '';
  window.scrollTo(0, scrollGuardado);
}

const modal = () => document.getElementById('modal');
let lastFocus = null;
const stack = []; // pantallas anteriores dentro del modal

function paint(title, body, animate) {
  const m = modal();
  const sheet = m.querySelector('.modal-sheet');
  activarDeslizar(sheet);
  sheet.innerHTML = `<div class="modal-grab" aria-hidden="true"></div><div class="modal-head">
      <button class="icon-btn back" data-action="modalBack" aria-label="${stack.length ? 'Volver' : 'Cerrar'}">${icon('back', 20, 2.2)}</button>
      <h2 id="modal-title">${esc(title)}</h2>
    </div><div class="modal-body ${animate || ''}">${body}</div>`;
  const first = sheet.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea');
  if (first && window.matchMedia('(pointer: fine)').matches) setTimeout(() => first.focus(), 30);
}

// openModal(título, html) abre una hoja nueva. Con { push: true } la apila
// sobre la actual y el botón "volver" regresa a la anterior.
export function openModal(title, body, opts = {}) {
  const m = modal();
  if (m.hidden) { lastFocus = document.activeElement; stack.length = 0; }
  else if (opts.push) stack.push({ title: m.querySelector('#modal-title').textContent, body: m.querySelector('.modal-body').innerHTML });
  else stack.length = 0;
  m.hidden = false;
  bloquearFondo('modal');
  // alto: la hoja ocupa toda la altura desde el principio, así lo que aparece abajo no empuja el formulario
  m.querySelector('.modal-sheet').classList.toggle('alto', !!opts.alto);
  paint(title, body, opts.push ? 'slide-in' : '');
}
export function modalBack() {
  const prev = stack.pop();
  if (!prev) return closeModal();
  paint(prev.title, prev.body, 'slide-back');
}
export function closeModal() {
  const m = modal();
  if (m.hidden) return;
  stack.length = 0;
  m.hidden = true;
  liberarFondo('modal');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

// Barra superior de una pantalla con flecha para volver
// ---------- elegir mes y año (para todos los calendarios) ----------
// abrirSelectorMes({ actual: 'AAAA-MM', min, max, accion, marcados, titulo })
// Al tocar un mes se llama a la acción `accion` con data-mk. El año se elige igual:
// tocando el año se abre la grilla de años.
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
let selCfg = null;
const hoyMk = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
function selectorHtml() {
  const c = selCfg;
  const yMin = Number(c.min.slice(0, 4)); const yMax = Number(c.max.slice(0, 4));
  if (c.vista === 'anio') {
    const anios = []; for (let y = yMax; y >= yMin; y--) anios.push(y);
    return `<div data-selmes><p class="small muted" style="margin:0">Elegí el año</p>
      <div class="meses-grid anios-grid">${anios.map((y) => `<button class="mes-op${y === c.anio ? ' on' : ''}${(c.marcados && [...c.marcados].some((k) => k.startsWith(y + '-'))) ? ' datos' : ''}" data-action="selElegirAnio" data-y="${y}" aria-pressed="${y === c.anio}">${y}</button>`).join('')}</div></div>`;
  }
  return `<div data-selmes><div class="month-nav anio-nav">
      <button class="icon-btn" data-action="selElegirAnio" data-y="${c.anio - 1}" aria-label="Año anterior" ${c.anio <= yMin ? 'disabled' : ''}>${icon('back', 18, 2.2)}</button>
      <button class="mes-btn" data-action="selVerAnios" aria-label="Elegir el año">${c.anio} ${icon('chevron', 14, 2.4)}</button>
      <button class="icon-btn" data-action="selElegirAnio" data-y="${c.anio + 1}" aria-label="Año siguiente" ${c.anio >= yMax ? 'disabled' : ''} style="transform:scaleX(-1)">${icon('back', 18, 2.2)}</button>
    </div>
    <div class="meses-grid">${MESES_CORTOS.map((n, i) => {
      const k = `${c.anio}-${String(i + 1).padStart(2, '0')}`;
      return `<button class="mes-op${k === c.actual ? ' on' : ''}${c.marcados && c.marcados.has(k) ? ' datos' : ''}" data-action="${c.accion}" data-mk="${k}" ${k < c.min || k > c.max ? 'disabled' : ''} aria-pressed="${k === c.actual}">${n}</button>`;
    }).join('')}</div>
    ${c.marcados ? `<span class="small muted">${esc(c.nota || 'El puntito marca los meses con movimientos.')}</span>` : ''}
    ${c.actual !== hoyMk() && hoyMk() >= c.min && hoyMk() <= c.max ? `<button class="btn small block" data-action="${c.accion}" data-mk="${hoyMk()}">Ir a este mes</button>` : ''}</div>`;
}
export function abrirSelectorMes(cfg) {
  selCfg = { titulo: 'Elegí el mes', ...cfg, anio: Number(cfg.actual.slice(0, 4)), vista: 'mes' };
  openModal(selCfg.titulo, selectorHtml());
}
const repintarSelector = () => { const n = document.querySelector('#modal [data-selmes]'); if (n && selCfg) n.outerHTML = selectorHtml(); };
export const selectorActions = {
  selVerAnios() { if (!selCfg) return; selCfg.vista = 'anio'; repintarSelector(); },
  selElegirAnio(ctx, el) { if (!selCfg) return; selCfg.anio = Number(el.dataset.y); selCfg.vista = 'mes'; repintarSelector(); },
};
/** Botón con el nombre del mes que abre el selector. */
export const botonMes = (mk, accion) => { const [y, m] = mk.split('-').map(Number); return `<button class="mes-btn" data-action="${accion}" aria-label="Elegir mes y año">${['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][m - 1]} ${y} ${icon('chevron', 14, 2.4)}</button>`; };

// ---------- ocultar montos (Ahorro e Ingresos) ----------
// Se recuerda en este dispositivo. Tapa los importes con puntitos; los porcentajes quedan.
const K_OCULTAR = 'pesitos_ocultar';
// Mi plata (clave 'ahorro'): queda como lo dejaste la última vez (visible u oculto).
// Ocultar es libre; para volver a mostrar los montos te pido el PIN o la huella.
const PROTEGIDAS = ['ahorro'];
export const montoProtegido = (clave) => PROTEGIDAS.includes(clave);
export function montosOcultos(clave) {
  try { return JSON.parse(localStorage.getItem(K_OCULTAR) || '{}')[clave] === true; } catch { return false; }
}
export function alternarMontos(clave) {
  let o = {}; try { o = JSON.parse(localStorage.getItem(K_OCULTAR) || '{}'); } catch { /* nada */ }
  o[clave] = !o[clave];
  try { localStorage.setItem(K_OCULTAR, JSON.stringify(o)); } catch { /* nada */ }
  return o[clave];
}
export const ojoMontos = (clave) => { const o = montosOcultos(clave); return `<button class="icon-btn" data-action="alternarMontos" data-clave="${clave}" aria-pressed="${o}" aria-label="${o ? 'Mostrar los montos' : 'Ocultar los montos'}">${icon(o ? 'eyeOff' : 'eye', 20)}</button>`; };
/** Tapa los montos ($ 12.345, −$500, US$ 1.234) de un pedazo de pantalla si están ocultos. */
export function taparMontos(html, clave) {
  if (!montosOcultos(clave)) return html;
  return html.replace(/[−-]?(US\$ ?|CLP\$ ?|R\$ ?|\$U ?|\$ ?|€ ?|₿ ?|ETH ?|USDT ?|g )\d[\d.]*(,\d+)?/g, (m, pre) => `${pre.trim()} ••••••`);
}

export function screenHead(title, extra = '', subtitle = '') {
  return `<div class="topbar">
    <div class="head-left">
      <button class="icon-btn back" data-action="goBack" aria-label="Volver">${icon('back', 20, 2.2)}</button>
      <div><h1 class="title">${esc(title)}</h1>${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ''}</div>
    </div>
    ${extra}
  </div>`;
}

// Carga rápida con selector Gasto / Ingreso (Gasto por defecto)
// Ícono de una categoría: el emoji que eligió el usuario o el dibujo de Pesitos
export function catIcon(c, size = 18) {
  return c && c.emoji ? `<span class="cat-emoji" style="font-size:${Math.round(size * 1.05)}px" aria-hidden="true">${c.emoji}</span>` : icon((c && c.icon) || 'tag', size);
}

export function quickForm(id, s = null, medioHtml = '') {
  const cats = s ? categoriasOrdenadas(s) : allCategories();
  return `<form class="quick-card" data-submit="quickAdd" autocomplete="off">
    <div class="quick-top">
      <label class="fecha-chip">${icon('calendar', 15)} <span data-fecha-txt>Hoy</span> ${icon('chevron', 12, 2.6)}
        <input id="${id}-date" name="date" type="date" value="${toISO(new Date())}" max="${toISO(new Date())}" data-change="quickFecha" aria-label="Fecha del movimiento"></label>
      <button type="button" class="link-btn" data-action="cargaDetallada">Añadir detalles ${icon('chevron', 12, 2.6)}</button>
    </div>
    <div class="kind-toggle" role="group" aria-label="Tipo de movimiento">
      <button type="button" data-action="setKind" data-kind="expense" aria-pressed="true">${icon('down', 16, 2.4)} Gasto</button>
      <button type="button" data-action="setKind" data-kind="income" aria-pressed="false">${icon('up', 16, 2.4)} Ingreso</button>
    </div>
    <input type="hidden" name="kind" value="expense">
    <div class="quick">
      <label for="${id}" class="sr-only">Anotá un movimiento</label>
      <input id="${id}" name="q" data-input="quickTexto" placeholder="Ej: Supermercado 48.000" data-ph-expense="Ej: Supermercado 48.000" data-ph-income="Ej: Venta 85.000" enterkeyhint="done">
      <button type="button" class="icon-btn" data-action="openPaste" aria-label="Cargar comprobante">${icon('receipt', 20)}</button>
      <button type="submit" class="icon-btn dark" aria-label="Anotar">${icon('plus', 20, 2.2)}</button>
    </div>
    <input type="hidden" name="category" value="auto">
    ${s && (s.proyectos || []).some((p) => !p.cerrado) ? `<input type="hidden" name="proyecto" value="">
    <div class="medio-fila"><span class="medio-label">Proyecto</span><div class="medio-row" role="radiogroup" aria-label="Proyecto">
      <button type="button" class="medio-chip" role="radio" data-action="pickProyecto" data-v="" aria-checked="true">Ninguno</button>
      ${s.proyectos.filter((p) => !p.cerrado).map((p) => `<button type="button" class="medio-chip" role="radio" data-action="pickProyecto" data-v="${esc(p.id)}" aria-checked="false">📁 ${esc(p.nombre)}</button>`).join('')}</div></div>` : ''}
    <input type="search" class="cat-buscar" placeholder="Buscar categoría" aria-label="Buscar categoría" data-input="catFiltrar" autocomplete="off" hidden>
    <div class="cat-row" role="radiogroup" aria-label="Categoría">
      <button type="button" class="cat-chip cat-lupa" data-action="catLupa" aria-label="Buscar categoría"><span class="cat-chip-ic">${icon('search', 18)}</span><span>Buscar</span></button>
      <button type="button" class="cat-chip" role="radio" data-action="pickCat" data-id="auto" aria-checked="true"><span class="cat-chip-ic">${icon('sprout', 18)}</span><span>Automática</span></button>
      ${cats.map((c) => `<button type="button" class="cat-chip" role="radio" data-action="pickCat" data-id="${esc(c.id)}" aria-checked="false"><span class="cat-chip-ic">${catIcon(c, 18)}</span><span>${esc(c.short || c.label)}</span></button>`).join('')}
      <button type="button" class="cat-chip mas" data-action="openCatManager" aria-label="Crear, ordenar u ocultar categorías"><span class="cat-chip-ic">${icon('plus', 18, 2.4)}</span><span>Más</span></button>
    </div>
    ${Array.isArray(medioHtml) && medioHtml.length > 1 ? `<input type="hidden" name="medio" value="">
    <div class="medio-fila"><span class="medio-label" data-medio-label>Pagás con</span>
      <div class="medio-row" role="radiogroup" aria-label="Con qué pagás">${medioHtml.filter((m) => m.top).map((m) => `<button type="button" class="medio-chip${m.tarjeta ? ' tarjeta' : ''}" role="radio" data-action="pickMedio" data-v="${esc(m.v)}" aria-checked="${m.v === ''}">${m.tarjeta ? icon('card', 14) : ''}${esc(m.tarjeta ? m.label.replace(/^Tarjeta /, '') : m.label)}</button>`).join('')}</div>${medioHtml.some((m) => !m.top) ? `<button type="button" class="medio-otro" data-action="medioOtro" aria-haspopup="dialog" aria-label="Otro medio de pago">Otro ${icon('chevron', 12, 2.6)}</button>` : ''}</div>` : ''}
  </form>`;
}
export function setModalBody(selector, html) {
  const el = modal().querySelector(selector);
  if (el) el.innerHTML = html;
}

// ---------- toast ----------
let toastTimer;
// toast('Guardado') o toast('Borraste Coto', { label: 'Deshacer', fn: () => … })
export function toast(msg, accion = null) {
  const t = document.getElementById('toast');
  t.innerHTML = '';
  const span = document.createElement('span'); span.textContent = msg; t.appendChild(span);
  if (accion) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-btn'; b.textContent = accion.label;
    b.onclick = () => { t.hidden = true; clearTimeout(toastTimer); accion.fn(); };
    t.appendChild(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, accion ? 6000 : 3200);
}

/** Borra algo con la opción de deshacerlo durante unos segundos. */
export function borrarConDeshacer(ctx, mensaje, borrar) {
  const antes = JSON.stringify(ctx.state);
  ctx.commit(borrar);
  toast(mensaje, { label: 'Deshacer', fn: () => { const prev = JSON.parse(antes); ctx.commit((s) => { for (const k of Object.keys(s)) if (!(k in prev)) delete s[k]; Object.assign(s, prev); }); toast('Listo, lo recuperé'); } });
}

export function hydrateNavIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
}


// ---------- listas con buscador ----------
// Los desplegables largos (más de 6 opciones) se abren en una hoja propia: la lista
// arranca arriba de todo, con un buscador para ir filtrando, y la opción elegida a la vista.
const MIN_OPCIONES = 7;
let listaSel = null;
const normalizar = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function hojaLista() {
  let h = document.getElementById('lista-sheet');
  if (h) return h;
  h = document.createElement('div');
  h.id = 'lista-sheet'; h.className = 'lista-sheet'; h.hidden = true;
  h.innerHTML = `<div class="ls-fondo" data-ls-cerrar></div><div class="ls-panel" role="dialog" aria-modal="true">
    <div class="ls-top"><strong data-ls-titulo></strong><button type="button" class="icon-btn" data-ls-cerrar aria-label="Cerrar">${icon('close', 20)}</button></div>
    <input type="search" class="ls-buscar" placeholder="Escribí para buscar" autocomplete="off" aria-label="Buscar en la lista">
    <div class="ls-items" role="listbox"></div></div>`;
  document.body.appendChild(h);
  h.addEventListener('click', (e) => {
    if (e.target.closest('[data-ls-cerrar]')) { cerrarLista(); return; }
    const op = e.target.closest('[data-ls-v]');
    if (op && listaSel) {
      listaSel.value = op.dataset.lsV;
      listaSel.dispatchEvent(new Event('change', { bubbles: true }));
      listaSel.dispatchEvent(new Event('input', { bubbles: true }));
      cerrarLista();
    }
  });
  h.querySelector('.ls-buscar').addEventListener('input', (e) => pintarLista(e.target.value));
  return h;
}
function pintarLista(q = '') {
  const h = hojaLista(); const sel = listaSel; if (!sel) return;
  const qq = normalizar(q.trim());
  let html = ''; let grupo = null; let n = 0;
  for (const o of sel.querySelectorAll('option')) {
    if (o.disabled && !o.value) continue;
    if (qq && !normalizar(o.textContent).includes(qq)) continue;
    const g = o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null;
    if (g !== grupo) { grupo = g; if (g) html += `<span class="ls-grupo">${esc(g)}</span>`; }
    html += `<button type="button" class="ls-op${o.value === sel.value ? ' on' : ''}" role="option" aria-selected="${o.value === sel.value}" data-ls-v="${esc(o.value)}">${esc(o.textContent)}</button>`;
    n++;
  }
  h.querySelector('.ls-items').innerHTML = n ? html : '<p class="empty">No hay opciones con eso.</p>';
}
export function abrirLista(sel) {
  listaSel = sel;
  const h = hojaLista();
  const lab = sel.id ? document.querySelector(`label[for="${sel.id}"]`) : null;
  h.querySelector('[data-ls-titulo]').textContent = (lab && lab.textContent.trim()) || sel.getAttribute('aria-label') || 'Elegí una opción';
  const b = h.querySelector('.ls-buscar'); b.value = '';
  pintarLista('');
  h.hidden = false;
  requestAnimationFrame(() => {
    h.classList.add('abierta');
    const on = h.querySelector('.ls-op.on'); if (on) on.scrollIntoView({ block: 'center' });
  });
}
function cerrarLista() {
  const h = document.getElementById('lista-sheet');
  if (!h || h.hidden) return;
  h.classList.remove('abierta'); h.hidden = true; listaSel = null;
}
const conLista = (t) => { const sel = t && t.closest && t.closest('select'); return sel && !sel.disabled && !sel.multiple && sel.options.length >= MIN_OPCIONES ? sel : null; };
// con mouse: se abre al apretar
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return;
  const sel = conLista(e.target); if (!sel) return;
  e.preventDefault(); sel.blur();
  abrirLista(sel);
}, true);
// con el dedo: se abre solo si tocás y soltás sin mover (si estás scrolleando, no)
let toqueSel = null;
document.addEventListener('touchstart', (e) => { const sel = conLista(e.target); toqueSel = sel ? { sel, x: e.touches[0].clientX, y: e.touches[0].clientY, movio: false } : null; }, { passive: true, capture: true });
document.addEventListener('touchmove', (e) => { if (toqueSel && (Math.abs(e.touches[0].clientX - toqueSel.x) > 8 || Math.abs(e.touches[0].clientY - toqueSel.y) > 8)) toqueSel.movio = true; }, { passive: true, capture: true });
document.addEventListener('touchend', (e) => {
  const t = toqueSel; toqueSel = null;
  if (!t || t.movio || conLista(e.target) !== t.sel) return;
  if (e.cancelable) e.preventDefault();
  t.sel.blur(); abrirLista(t.sel);
}, { passive: false, capture: true });
// por las dudas (algunos celulares abren su propia lista con el click)
document.addEventListener('click', (e) => { if (conLista(e.target)) e.preventDefault(); }, true);
document.addEventListener('mousedown', (e) => { const sel = e.target.closest && e.target.closest('select'); if (sel && sel.options.length >= MIN_OPCIONES) e.preventDefault(); }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarLista(); });

// Al tocar un campo dentro de una ventana, que quede arriba y a la vista (no tapado por el teclado).
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!el.closest || !el.closest('#modal') || !el.matches('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea')) return;
  const arriba = el.closest('.ciudad-picker, .banco-picker');
  setTimeout(() => el.scrollIntoView({ block: arriba ? 'start' : 'center', behavior: 'smooth' }), 280);
});

// ---------- listas que se ordenan arrastrando ----------
// <div data-sortable="accion"> con filas [data-sort-id] y una manija [data-grip].
// Al soltar, dispara la acción con data-ids="id1,id2,…" (el orden nuevo).
let arr = null;
function soltarOrden(lista, ids) {
  const b = document.createElement('button');
  b.type = 'button'; b.hidden = true; b.dataset.action = lista.dataset.sortable; b.dataset.ids = ids.join(',');
  lista.appendChild(b); b.click(); b.remove();
}
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest && e.target.closest('[data-grip]');
  if (!h || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const fila = h.closest('[data-sort-id]'); const lista = fila && fila.closest('[data-sortable]');
  if (!lista) return;
  e.preventDefault();
  const filas = [...lista.querySelectorAll('[data-sort-id]')];
  const tops = filas.map((f) => f.getBoundingClientRect().top);
  const paso = filas.length > 1 ? (tops[tops.length - 1] - tops[0]) / (filas.length - 1) : fila.offsetHeight;
  const idx = filas.indexOf(fila);
  arr = { fila, lista, filas, paso, idx, nuevo: idx, y0: e.clientY };
  fila.classList.add('arrastrando');
  try { h.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
});
document.addEventListener('pointermove', (e) => {
  if (!arr) return;
  e.preventDefault();
  const dy = e.clientY - arr.y0;
  arr.fila.style.transform = `translateY(${dy}px)`;
  const n = Math.max(0, Math.min(arr.filas.length - 1, arr.idx + Math.round(dy / arr.paso)));
  arr.nuevo = n;
  arr.filas.forEach((f, j) => {
    if (j === arr.idx) return;
    let t = '';
    if (arr.idx < n && j > arr.idx && j <= n) t = `translateY(${-arr.paso}px)`;
    else if (n < arr.idx && j >= n && j < arr.idx) t = `translateY(${arr.paso}px)`;
    f.style.transform = t;
  });
}, { passive: false });
function terminarArrastre() {
  if (!arr) return;
  const { filas, idx, nuevo, lista, fila } = arr; arr = null;
  filas.forEach((f) => { f.style.transform = ''; });
  fila.classList.remove('arrastrando');
  if (nuevo === idx) return;
  const ids = filas.map((f) => f.dataset.sortId);
  const [m] = ids.splice(idx, 1); ids.splice(nuevo, 0, m);
  soltarOrden(lista, ids);
}
document.addEventListener('pointerup', terminarArrastre);
document.addEventListener('pointercancel', terminarArrastre);
// con teclado: flechas arriba/abajo sobre la manija
document.addEventListener('keydown', (e) => {
  const h = e.target.closest && e.target.closest('[data-grip]');
  if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  const fila = h.closest('[data-sort-id]'); const lista = fila && fila.closest('[data-sortable]');
  if (!lista) return;
  e.preventDefault();
  const ids = [...lista.querySelectorAll('[data-sort-id]')].map((f) => f.dataset.sortId);
  const i = ids.indexOf(fila.dataset.sortId); const j = i + (e.key === 'ArrowUp' ? -1 : 1);
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  soltarOrden(lista, ids);
  requestAnimationFrame(() => { const g = document.querySelector(`[data-sortable] [data-sort-id="${CSS.escape(ids[j])}"] [data-grip]`); if (g) g.focus(); });
});

// ---------- separador de miles mientras escribís ----------
// En los campos de montos (inputmode="decimal") y en la carga rápida, los números de
// 4 cifras o más se separan solos con puntos: 1234567 → 1.234.567. La coma es el
// decimal. En porcentajes y tasas no van puntos de miles: el punto se toma como coma (2.5 → 2,5).
const conPuntos = (int) => int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
function ponerCursor(el, cuantos, cuenta) {
  // deja el cursor después de la misma cantidad de dígitos (y comas) que antes
  const v = el.value; let n = 0; let pos = v.length;
  if (cuantos === 0) pos = 0;
  else for (let i = 0; i < v.length; i++) { if (cuenta.test(v[i])) n++; if (n === cuantos) { pos = i + 1; break; } }
  try { el.setSelectionRange(pos, pos); } catch { /* algunos campos no lo permiten */ }
}
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || el.type !== 'text' && el.type !== '' && el.type !== 'search') return;
  const montos = el.inputMode === 'decimal';
  const rapida = el.name === 'q' && el.closest('.quick-card');
  if (!montos && !rapida) return;
  const caret = el.selectionStart ?? el.value.length;
  if (montos) {
    let v = el.value;
    // porcentajes y tasas: el punto es la coma decimal y no llevan miles
    const esPct = /pct|tna|tasa|porc|interes/i.test(el.name + ' ' + el.id) || /%/.test(el.placeholder + ' ' + ((el.labels && el.labels[0] && el.labels[0].textContent) || ''));
    if (esPct) { if (e.data === '.') { el.value = v.slice(0, caret - 1) + ',' + v.slice(caret); try { el.setSelectionRange(caret, caret); } catch { /* nada */ } } return; }
    if (/[^\d.,\s$-]/.test(v)) return; // texto ("US$ 10", "20%"): no lo toco
    const antes = v.slice(0, caret).replace(/[^\d,]/g, '').length;
    const limpio = v.replace(/[\s$.]/g, '');
    const [int, ...dec] = limpio.split(',');
    const nuevo = (v.trim().startsWith('-') ? '-' : '') + conPuntos(int.replace(/-/g, '')) + (dec.length ? ',' + dec.join('') : '');
    if (nuevo !== el.value) { el.value = nuevo; ponerCursor(el, antes, /[\d,]/); }
    return;
  }
  // carga rápida: solo los números largos sueltos (no fechas ni horas)
  const v = el.value;
  const antes = v.slice(0, caret).replace(/[^\d]/g, '').length;
  const nuevo = v.replace(/(^|[^\d/:,.])(\d[\d.]*\d)(?![\d/:])/g, (m, pre, numTxt) => {
    const d = numTxt.replace(/\./g, '');
    return d.length >= 4 ? pre + conPuntos(d) : pre + numTxt;
  });
  if (nuevo !== v) { el.value = nuevo; ponerCursor(el, antes, /\d/); }
}, true);

// ---------- flechita para volver arriba ----------
// Cuando bajás y dejás de ver la flecha de volver (o el título), aparece abajo a la
// derecha un botón que te lleva arriba. También dentro de las hojas largas.
(() => {
  let btn = null;
  const crear = () => {
    btn = document.createElement('button');
    btn.className = 'arriba'; btn.type = 'button'; btn.hidden = true;
    btn.setAttribute('aria-label', 'Volver arriba');
    btn.innerHTML = icon('up', 20, 2.6);
    btn.addEventListener('click', () => {
      const sheet = !modal().hidden && modal().querySelector('.modal-sheet');
      if (sheet && sheet.scrollTop > 0) sheet.scrollTo({ top: 0, behavior: 'smooth' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(btn);
  };
  const revisar = () => {
    if (!btn) crear();
    const m = modal();
    const sheet = m && !m.hidden && m.querySelector('.modal-sheet');
    let ver;
    if (sheet) ver = sheet.scrollTop > 280;
    else {
      const head = document.querySelector('#app .screen > .topbar');
      ver = head ? head.getBoundingClientRect().bottom < -120 : window.scrollY > 400;
    }
    if (document.getElementById('drawer') && !document.getElementById('drawer').hidden) ver = false;
    if (document.querySelector('#app .guide')) ver = false; // en el arranque no hace falta
    if (btn.hidden !== !ver) btn.hidden = !ver; // solo si cambia (si no, el observador se llama a sí mismo)
    if (btn.classList.contains('en-hoja') !== !!sheet) btn.classList.toggle('en-hoja', !!sheet);
  };
  document.addEventListener('scroll', revisar, { capture: true, passive: true });
  window.addEventListener('hashchange', () => setTimeout(revisar, 50));
  new MutationObserver((ms) => { if (ms.some((m) => m.target !== btn)) revisar(); }).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
})();
