// Ahorro e inversiones: cuánto tenés, dónde y en qué moneda, cotizaciones
// en vivo, conversor y metas.

import { reintegrosCobrados, totalReintegros } from './reintegros.js';
import { money, pesos, esc, num, todayISO, monthName, monedaActual } from './formato.js';
import { holdingsTotal, holdingArs, goalEta, goalPct } from './calculos.js';
import { HOLDING_TYPES, holdingType, ASSETS, assetById, allCategories, catLabel } from './categorias.js';
import { insights } from './economista.js';
import { arsPer, convert, refreshRates, ratesAge, ratesStale, DOLARES, dolarRef, nombreDolar, monedaBase } from './cotizaciones.js';
import { comoAhorroHtml, desafiosHtml } from './asesor.js';
import { resumenProyecto } from './proyectos.js';
import { cuerpo as cuerpoCuentas, patrimonioHtml, panelAhorrar } from './miscuentas.js';
import { cuerpo as sueldoCuerpo } from './sueldo.js';
import { ring, tipCard, icon, screenHead, openModal, closeModal, toast, setModalBody, borrarConDeshacer, ojoMontos, taparMontos } from './interfaz.js';
import { uid } from './almacenamiento.js';
import { lessonCard } from './aprender.js';
import { BILLETERAS_QUE_RINDEN, tnaDe, valorHoy, rinde, refreshRendimientos, tasaDe, textoTasa, nombreBilletera } from './rendimientos.js';
import { parseAmount, guessCategory } from './interprete.js';
import { medioOptions } from './acciones.js';

const nf = (d) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export function fmtAsset(amount, assetId) {
  if (String(assetId).startsWith('USD')) return `US$ ${nf(2).format(amount)}`;
  const a = assetById(assetId);
  if (a.id === 'ARS') return pesos(amount);
  return `${a.sym} ${nf(a.decimals).format(amount)}`;
}

// Cotizaciones que se pueden mostrar (vos elegís cuáles)
export const COTIZ_OPCIONES = [
  ...DOLARES.map(([id, nombre]) => ({ id, nombre, grupo: 'Dólares' })),
  { id: 'EUR', nombre: 'Euro', grupo: 'Otras monedas' }, { id: 'BRL', nombre: 'Real', grupo: 'Otras monedas' },
  { id: 'UYU', nombre: 'Peso uruguayo', grupo: 'Otras monedas' }, { id: 'CLP', nombre: 'Peso chileno', grupo: 'Otras monedas' },
  { id: 'BTC', nombre: 'Bitcoin', grupo: 'Cripto y oro' }, { id: 'ETH', nombre: 'Ethereum', grupo: 'Cripto y oro' },
  { id: 'USDT', nombre: 'USDT', grupo: 'Cripto y oro' }, { id: 'XAU', nombre: 'Oro (gramo)', grupo: 'Cripto y oro' },
];
const COTIZ_DEF = ['oficial', 'blue', 'bolsa', 'tarjeta', 'EUR', 'BTC'];
const cotizElegidas = (s) => ((s.settings || {}).cotizVer && s.settings.cotizVer.length ? s.settings.cotizVer : COTIZ_DEF);
function filaCotiz(s, id) {
  const r = s.rates || {}; const c = r.crypto || {}; const dol = r.dolares || {};
  const o = COTIZ_OPCIONES.find((x) => x.id === id); if (!o) return null;
  if (dol[id] || DOLARES.some(([x]) => x === id)) { const d = dol[id] || (id === 'blue' ? r.USD : null); return { label: o.nombre, main: d ? `${d.compra ? `${pesos(d.compra)} / ` : ''}${pesos(d.venta)}` : null, sub: d && d.compra ? 'compra / venta' : 'venta', ref: id === dolarRef(s) }; }
  if (['EUR', 'BRL', 'UYU', 'CLP'].includes(id)) return { label: o.nombre, main: r[id] ? pesos(r[id].venta) : null, sub: 'venta' };
  const usdV = c[id]; const ars = usdV ? arsPer(s, id) : 0;
  return { label: o.nombre, main: usdV ? `US$ ${nf(id === 'BTC' || id === 'ETH' ? 0 : 2).format(usdV)}` : null, sub: ars ? pesos(ars) : '' };
}
function quotes(s, enModal = false) {
  const rows = cotizElegidas(s).map((id) => filaCotiz(s, id)).filter(Boolean);
  const any = rows.some((x) => x.main);
  return `<div class="card">
    <div class="topbar"><strong style="font-size:14px">${enModal ? 'Las que elegiste' : 'Cotizaciones'}</strong>
      <span class="head-actions"><button class="chip" data-action="elegirCotiz">${icon('grid', 14, 2.2)} Elegir</button><button class="chip" data-action="refreshQuotes" aria-label="Actualizar cotizaciones">${icon('refresh', 14, 2.2)}</button></span></div>
    ${any ? `<div class="quotes">${rows.map((x) => `<div class="quote"><span class="k">${x.label}${x.ref ? ' <span class="chip-mini">Tu referencia</span>' : ''}</span><span class="v">${x.main || '—'}</span><span class="small muted">${x.sub || ''}</span></div>`).join('')}</div>`
      : '<p class="text muted">Todavía no pude traer las cotizaciones (sin conexión). Se cargan solas apenas haya internet.</p>'}
    ${any && ratesStale(s) ? `<span class="pill warn" style="align-self:flex-start">Sin conexión: valores de ${ratesAge(s)}</span>` : ''}
    <span class="small muted">Se actualizan solas cada 5 minutos · dólares y monedas vía DolarApi · cripto y oro vía CoinGecko · ${ratesAge(s)}</span>
  </div>`;
}
function elegirCotizBody(s) {
  const sel = new Set(cotizElegidas(s));
  const grupos = [...new Set(COTIZ_OPCIONES.map((o) => o.grupo))];
  return `<p class="small muted" style="margin:0">Tocá las que querés ver (en Ahorros, con tu plata convertida, y en Herramientas → Cotizaciones).</p>
    ${grupos.map((g) => `<span class="small" style="font-weight:800">${g}</span><div class="chips">${COTIZ_OPCIONES.filter((o) => o.grupo === g).map((o) => `<button class="chip toggle" data-action="toggleCotiz" data-id="${o.id}" aria-pressed="${sel.has(o.id)}">${esc(o.nombre)}</button>`).join('')}</div>`).join('')}
    <div class="field"><label for="dol-ref">Dólar para pasar tus ahorros y gastos en dólares a pesos</label><select id="dol-ref" data-change="setDolarRef">${DOLARES.map(([id, n]) => `<option value="${id}" ${id === dolarRef(s) ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <span class="hint">Si cobrás o ahorrás en dólares por el banco, el MEP o el oficial suelen ser los más reales.</span></div>`;
}

let vista = 'cuentas'; // 'cuentas' | 'mis' | 'sueldo' | 'plan'
let monedaTab = ''; // pestaña del widget de ahorros (ARS, USD, EUR...)
let comoAbierto = false; // "Cómo ahorro" desplegado (se mantiene al tocar una regla)
document.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'como-ahorro') comoAbierto = e.target.open; }, true);

// ---------- ahorros por moneda ----------
const PLURAL = { ARS: 'Pesos', USD: 'Dólares', EUR: 'Euros', BRL: 'Reales', UYU: 'Pesos uruguayos', CLP: 'Pesos chilenos', XAU: 'Oro', BTC: 'Bitcoin', ETH: 'Ethereum', USDT: 'USDT' };
const nombreMon = (c) => PLURAL[c] || assetById(c).label;
/** Ahorros agrupados por moneda: [{ cur, cant (en esa moneda), ars (en tu moneda), items }], tu moneda primero. */
function porMoneda(s) {
  const base = monedaBase(s);
  const g = {};
  for (const h of s.holdings || []) {
    const cur = h.currency || 'ARS';
    const x = g[cur] || (g[cur] = { cur, cant: 0, ars: 0, items: [] });
    x.cant += valorHoy(s, h); x.ars += holdingArs(s, h); x.items.push({ ...h, ars: holdingArs(s, h) });
  }
  if (!g[base]) g[base] = { cur: base, cant: 0, ars: 0, items: [] };
  return Object.values(g).sort((a, b) => (a.cur === base ? -1 : b.cur === base ? 1 : b.ars - a.ars));
}
function cotizDe(s, cur) {
  if (cur === 'USD') return `${nombreDolar(dolarRef(s)).toLowerCase()} a ${pesos(arsPer(s, 'USD'))}`;
  const v = arsPer(s, cur);
  return v ? `${assetById(cur).label.toLowerCase()} a ${pesos(v)}` : 'sin cotización';
}
// el widget verde: una tarjeta por cada moneda en la que ahorrás, para deslizar (como el de Inicio)
function slideMoneda(s, g, grupos, total) {
  const base = monedaBase(s);
  const enBase = g.cur === base;
  return `<div class="card green slide" style="gap:12px;padding:20px">
      <span class="hero-label">Ahorrado en ${esc(nombreMon(g.cur).toLowerCase())}</span>
      <span style="font-size:34px;font-weight:800;letter-spacing:-1px;line-height:1.1">${enBase ? money(g.ars) : fmtAsset(g.cant, g.cur)}</span>
      ${enBase ? (grupos.length > 1 ? `<span class="small on-green-muted">Con todas tus monedas: <b style="color:#fff">${money(total)}</b></span>` : '') : g.ars > 0 || !g.cant ? `<span class="small on-green-muted">Equivale a <b style="color:#fff">${money(g.ars)}</b> · ${esc(cotizDe(s, g.cur))}</span>` : '<span class="small on-green-muted">Todavía no tengo la cotización: la traigo apenas haya conexión.</span>'}
      ${g.ars > 0 && g.items.length > 1 ? `<div class="dist" role="img" aria-label="Distribución de tus ahorros en ${esc(nombreMon(g.cur).toLowerCase())}">${g.items.filter((h) => h.ars > 0).map((h) => `<span style="width:${(h.ars / g.ars) * 100}%;background:${holdingType(h.type).color}"></span>`).join('')}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:2px">
        ${g.items.map((h) => `<button class="row" data-action="editHolding" data-id="${h.id}" style="color:#fff;border-color:rgba(255,255,255,.12);padding:8px 0">
          <span style="width:10px;height:10px;border-radius:3px;background:${holdingType(h.type).color};flex-shrink:0"></span>
          <span class="grow"><span class="name" style="font-weight:600">${esc(h.name || holdingType(h.type).label)}</span>${tnaDe(s, h) ? `<span class="meta on-green-muted">Rinde ${String(tnaDe(s, h)).replace('.', ',')}% anual</span>` : ''}</span>
          <span class="amount">${enBase ? money(h.ars) : fmtAsset(valorHoy(s, h), h.currency)}</span>
        </button>`).join('') || `<span class="small on-green-muted">${grupos.length > 1 ? `No tenés ahorros en ${esc(nombreMon(g.cur).toLowerCase())}.` : 'Todavía no cargaste dónde tenés tus ahorros.'}</span>`}
      </div>
      <div class="btn-row"><button class="btn small" data-action="newHolding" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.35)">+ Agregar dónde ahorrás</button></div>
    </div>`;
}
function widgetAhorros(s) {
  const grupos = porMoneda(s);
  const total = grupos.reduce((a, g) => a + g.ars, 0);
  if (grupos.length === 1) return slideMoneda(s, grupos[0], grupos, total).replace('card green slide', 'card green');
  // carrusel infinito (como el de Inicio): copia de la última al principio y de la primera al final
  const n = grupos.length;
  const i = Math.max(0, grupos.findIndex((g) => g.cur === monedaTab));
  const slides = grupos.map((g) => slideMoneda(s, g, grupos, total));
  const copia = (h) => h.replace('class="card green slide"', 'class="card green slide copia" aria-hidden="true" inert');
  const todas = [copia(slides[n - 1]), ...slides, copia(slides[0])];
  requestAnimationFrame(() => { const c = document.querySelector('[data-ahcar]'); if (c) c.scrollLeft = pasoAh(c) * (i + 1); });
  return `<div class="hero-wrap"><div class="hero-carrusel ah-carrusel" data-ahcar data-n="${n}" aria-roledescription="carrusel" aria-label="Tus ahorros por moneda">${todas.join('')}</div>
    <div class="hero-puntos" role="tablist">${grupos.map((g, k) => `<button role="tab" data-action="ahorroIr" data-i="${k}" data-v="${g.cur}" aria-label="Ver ${esc(nombreMon(g.cur).toLowerCase())}" aria-selected="${k === i}"></button>`).join('')}</div></div>`;
}
const pasoAh = (c) => { const a = c.children[0]; const b = c.children[1]; return a && b ? b.offsetLeft - a.offsetLeft : Math.max(1, c.clientWidth); };
const realAh = (c) => { const n = Number(c.dataset.n) || 1; const p = Math.round(c.scrollLeft / Math.max(1, pasoAh(c))); return (p - 1 + n) % n; };
// al llegar a una copia, salta (sin animación) a la tarjeta real
const vueltaAh = (c) => { const n = Number(c.dataset.n); const w = pasoAh(c); const p = Math.round(c.scrollLeft / Math.max(1, w)); if (p === 0) c.scrollLeft = w * n; else if (p === n + 1) c.scrollLeft = w; };
let finAh = 0;
// al deslizar: se marca el puntito, se recuerda la moneda y se da la vuelta
document.addEventListener('scroll', (e) => {
  const c = e.target;
  if (!c || !c.matches || !c.matches('[data-ahcar]')) return;
  const k = realAh(c);
  const puntos = c.parentElement.querySelectorAll('.hero-puntos button');
  puntos.forEach((b, j) => b.setAttribute('aria-selected', String(j === k)));
  if (puntos[k]) monedaTab = puntos[k].dataset.v;
  clearTimeout(finAh); finAh = setTimeout(() => vueltaAh(c), 140);
}, true);
document.addEventListener('scrollend', (e) => { const c = e.target; if (c && c.matches && c.matches('[data-ahcar]')) { clearTimeout(finAh); vueltaAh(c); } }, true);

// el cuadro de cotizaciones, pero con tu plata: cuánto son tus ahorros en cada moneda
function conversionAhorros(s) {
  const totalArs = (s.holdings || []).reduce((a, h) => a + valorHoy(s, h) * (arsPer(s, h.currency || 'ARS') || 0), 0);
  if (!(totalArs > 0)) return '';
  const r = s.rates || {}; const dol = r.dolares || {};
  const tiles = cotizElegidas(s).map((id) => {
    const o = COTIZ_OPCIONES.find((x) => x.id === id); if (!o) return null;
    let precio = 0; let cur = id;
    if (DOLARES.some(([x]) => x === id)) { const d = dol[id] || (id === 'blue' ? r.USD : null); precio = (d && d.venta) || 0; cur = 'USD'; }
    else precio = arsPer(s, id);
    return { label: o.nombre, main: precio ? fmtAsset(totalArs / precio, cur) : null, sub: precio ? `a ${pesos(precio)}${['BTC', 'ETH', 'USDT', 'XAU'].includes(id) ? '' : ' (venta)'}` : 'sin cotización' };
  }).filter(Boolean);
  return `<div class="card">
    <div class="topbar"><strong style="font-size:14px">En otras monedas</strong>
      <span class="head-actions"><button class="chip" data-action="elegirCotiz">${icon('grid', 14, 2.2)} Elegir</button><button class="chip" data-action="refreshQuotes" aria-label="Actualizar cotizaciones">${icon('refresh', 14, 2.2)}</button></span></div>
    <span class="small muted">Todo lo que tenés ahorrado (${money(totalArs)}), convertido a cada cotización.</span>
    <div class="quotes">${tiles.map((x) => `<div class="quote"><span class="k">${esc(x.label)}</span><span class="v">${x.main || '—'}</span><span class="small muted">${x.sub}</span></div>`).join('')}</div>
    <span class="small muted">${ratesStale(s) ? 'Sin conexión: valores de ' : 'Cotizaciones: '}${ratesAge(s)}. Todas las cotizaciones están en Herramientas.</span>
  </div>`;
}

let patAbierto = false;
/** Abrir Mi plata en una pestaña (las rutas viejas #/cuentas llegan acá). */
export function renderVista(s, v) { vista = v; return render(s); }

// Mi plata → Metas: una sola lista, separada en dos familias.
//  · Fondos fijos: plata que querés tener siempre (goal tipo 'fondo'). Sin fecha de fin; si la usás, la reponés.
//  · Objetivos: algo que querés lograr. Puede ser juntar hasta un monto (goal común), juntar y después
//    gastarlo en algo (proyecto con meta enlazada) o solo llevar la cuenta de lo que gastás en algo (proyecto sin ahorro).
function filaFondo(g) {
  return `<button class="row" data-action="openGoal" data-id="${g.id}">
    <span class="cat-icon green">${icon('wallet', 18)}</span>
    <span class="grow"><span class="name">${esc(g.name)}</span><span class="meta">${g.target ? `${money(g.saved)} de ${money(g.target)} · ` : ''}${esc(goalEta(g).text)}</span></span>
    <span class="amount ${g.saved < 0 ? 'neg' : ''}">${money(g.saved)}</span>
  </button>`;
}
function filaObjetivo(g) {
  return `<button class="row" data-action="openGoal" data-id="${g.id}">
    ${ring(goalPct(g), 40, 5, `${g.name}`)}
    <span class="grow"><span class="name">${esc(g.name)}${g.main ? ' <span class="pill lime" style="margin-left:4px">Principal</span>' : ''}</span><span class="meta">Juntar plata · ${g.target ? `${money(g.saved)} de ${money(g.target)} · ` : ''}${esc(goalEta(g).text)}</span></span>
    <span class="amount">${Math.round(goalPct(g) * 100)}%</span>
  </button>`;
}
function filaProyecto(s, p) {
  const r = resumenProyecto(s, p);
  const obj = p.presupuesto || (r.meta && r.meta.target) || 0;
  const sub = r.meta
    ? `Juntar y gastar · ${r.gastado ? `ahorrado ${money(r.ahorrado)} · gastado ${money(r.gastado)} · ${r.queda >= 0 ? `te quedan ${money(r.queda)}` : `te pasaste ${money(-r.queda)}`}` : `${money(r.ahorrado)}${obj ? ` de ${money(obj)}` : ''}`}`
    : `Solo gastos · llevás ${money(r.gastado)}${obj ? ` de ${money(obj)}` : ''}`;
  return `<button class="row" data-action="verProyecto" data-id="${esc(p.id)}">
    ${r.meta && obj ? ring(Math.min(1, r.ahorrado / obj), 40, 5, p.nombre) : `<span class="cat-icon ${p.cerrado ? '' : 'green'}">${icon('folder', 18)}</span>`}
    <span class="grow"><span class="name">${esc(p.nombre)}${p.cerrado ? ' <span class="pill">Terminado</span>' : ''}</span><span class="meta">${sub}</span></span>
    ${icon('chevron', 16)}</button>`;
}
function metasLista(s) {
  const fondos = (s.goals || []).filter((g) => g.tipo === 'fondo');
  const metas = (s.goals || []).filter((g) => g.tipo !== 'fondo' && g.tipo !== 'proyecto');
  const proys = (s.proyectos || []).slice().sort((a, b) => (a.cerrado === b.cerrado ? (b.creado || '').localeCompare(a.creado || '') : a.cerrado ? 1 : -1));
  const objetivos = [...metas.map(filaObjetivo), ...proys.map((p) => filaProyecto(s, p))];
  return `<div class="section-title"><span>Tus metas</span><button data-action="openGoalForm">+ Nueva</button></div>
    ${taparMontos(`<span class="sub-titulo">Fondos fijos <span>plata que querés tener siempre</span></span>
    <div class="card tight">${fondos.length ? fondos.map(filaFondo).join('') : '<p class="empty">Plata que querés tener siempre a mano, sin fecha de fin: un respaldo para la casa, un colchón para cuando cambies de trabajo. Si la usás, la volvés a llenar.</p>'}</div>
    <span class="sub-titulo">Objetivos <span>algo que querés lograr</span></span>
    <div class="card tight">${objetivos.length ? objetivos.join('') : '<p class="empty">Algo que querés lograr: juntar para una bici nueva, pagarte un curso, un viaje o arreglar algo de la casa.</p>'}</div>`, 'ahorro')}`;
}

// ---------- Destinar: a qué fue la plata de un fondo, objetivo o proyecto ----------
// g.destinos = [{ id, date, monto, destino: 'gasto'|'disponible'|'ahorro', nota, desde, hacia, sigue }]
//  · gasto: queda como gasto pagado con ahorros (no baja "Hoy podés gastar").
//  · disponible: vuelve a tu plata del mes (ingreso extra): sube lo que podés gastar.
//  · ahorro: pasa a otro ahorro o inversión; si sigue siendo para la meta, la meta no baja.
// "Salió de" (opcional) descuenta del ahorro donde estaba la plata.
const DESTINOS = {
  gasto: ['A un gasto', 'Lo anoto como gasto pagado con ahorros: no te baja lo que podés gastar.'],
  disponible: ['A mi plata disponible', 'Vuelve a tu plata del mes: sube lo que podés gastar.'],
  ahorro: ['A otro ahorro o inversión', 'Cambia dónde está la plata: tu total ahorrado no cambia.'],
};
function destinarForm(s, g, proy = '') {
  const holds = s.holdings || [];
  const optH = (sel = '') => holds.map((h) => `<option value="${esc(h.id)}" ${sel === h.id ? 'selected' : ''}>${esc(h.name || holdingType(h.type).label)}</option>`).join('');
  const esProy = g.tipo === 'proyecto';
  return `<form class="form" data-submit="guardarDestino"><input type="hidden" name="id" value="${esc(g.id)}"><input type="hidden" name="proy" value="${esc(proy)}">
    <p class="small muted" style="margin:0">${esProy ? `Lo ahorrado para "${esc(g.name)}"` : `Hay ${money(g.saved)} en "${esc(g.name)}"`}. ¿A qué destinaste esta plata?</p>
    <div class="field-row"><div class="field"><label for="ds-mo">Monto</label><input id="ds-mo" name="monto" inputmode="decimal" required placeholder="Ej: 40.000"></div>
      <div class="field"><label for="ds-fe">¿Cuándo?</label><input id="ds-fe" name="date" type="date" value="${todayISO()}" max="${todayISO()}"></div></div>
    <div class="destinos" role="radiogroup" aria-label="Destino">${Object.entries(DESTINOS).map(([k, [t, sub]], i) => `<label class="check destino-op"><input type="radio" name="destino" value="${k}" ${i === 0 ? 'checked' : ''} data-change="destinoCambio"> <span><b>${t}</b><br><span class="small muted">${esProy && k === 'gasto' ? 'Lo anoto como gasto del proyecto: se descuenta de lo ahorrado.' : sub}</span></span></label>`).join('')}</div>
    <div data-dest="gasto" style="display:flex;flex-direction:column;gap:10px">
      <div class="field-row"><div class="field"><label for="ds-no">¿En qué?</label><input id="ds-no" name="nota" placeholder="${g.tipo === 'fondo' ? 'Ej: Cambio de cubiertas' : 'Ej: Seña del alquiler'}"></div>
        <div class="field"><label for="ds-ca">Categoría</label><select id="ds-ca" name="categoria"><option value="">Automática</option>${allCategories().map((c) => `<option value="${c.id}" ${c.id === g.categoria ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div></div>
    </div>
    <div data-dest="disponible" hidden><div class="field"><label for="ds-cu">¿A qué cuenta?</label><select id="ds-cu" name="cuenta">${medioOptions(s, '', { conTarjetas: false, auto: true })}</select></div></div>
    <div data-dest="ahorro" hidden style="display:flex;flex-direction:column;gap:10px">
      <div class="field"><label for="ds-ha">¿A dónde?</label><select id="ds-ha" name="hacia" data-change="destinoCambio">${optH()}<option value="nuevo" ${holds.length ? '' : 'selected'}>Otro: lo escribo</option></select></div>
      <div class="field" data-dest-nuevo ${holds.length ? 'hidden' : ''}><label for="ds-hn">Nombre</label><input id="ds-hn" name="haciaNombre" placeholder="Ej: Plazo fijo a 60 días"></div>
      <div class="field"><span class="small" style="font-weight:700">¿Sigue siendo para "${esc(g.name)}"?</span>
        <label class="check"><input type="radio" name="sigue" value="si" checked> <span>Sí: ${esProy ? 'lo ahorrado' : 'la meta'} no baja, solo cambia dónde está</span></label>
        <label class="check"><input type="radio" name="sigue" value="no"> <span>No: ${esProy ? 'baja lo ahorrado del proyecto' : 'baja la meta'}</span></label></div>
    </div>
    ${holds.length ? `<div class="field"><label for="ds-de">¿De qué ahorro salió? (opcional)</label><select id="ds-de" name="desde"><option value="">No sé / no lo descuento</option>${optH()}</select><span class="hint">Si lo elegís, descuento el monto de ese ahorro.</span></div>` : ''}
    <button class="btn primary block" type="submit">Destinar</button>
  </form>`;
}
function destinosHtml(s, g) {
  const l = (g.destinos || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  if (!l.length) return '';
  const hn = (id, n) => n || ((s.holdings || []).find((h) => h.id === id) || {}).name || 'otro ahorro';
  return `<div class="card tight"><strong style="padding:8px 0 0">A qué destinaste</strong>${l.map((x) => `<div class="row"><span class="grow"><span class="name">${x.destino === 'gasto' ? esc(x.nota || 'Un gasto') : x.destino === 'disponible' ? 'A tu plata disponible' : `A ${esc(hn(x.hacia, x.haciaNombre))}`}</span><span class="meta">${x.date.split('-').reverse().join('/')}${x.destino === 'ahorro' ? (x.sigue ? ' · sigue para la meta' : ' · ya no es para la meta') : ''}</span></span><span class="amount">${money(x.monto)}</span></div>`).join('')}</div>`;
}
// suma o resta (en pesos) a un ahorro, en su moneda
function moverEnAhorro(s, id, pesosMonto, fecha) {
  const h = (s.holdings || []).find((x) => x.id === id); if (!h) return;
  const tc = arsPer(s, h.currency || 'ARS') || 1;
  h.amount = Math.max(0, Math.round((valorHoy(s, h) + pesosMonto / tc) * 100) / 100);
  h.since = fecha;
}

// "+ Nueva": primero elegís qué es
function elegirMeta(paso = '') {
  const op = (accion, titulo, texto, ej, extra = '') => `<button class="card elegir-meta" data-action="${accion}"${extra}><strong>${titulo}</strong><span class="small">${texto}</span><span class="small muted">${ej}</span></button>`;
  if (paso === 'objetivo') return `<div style="display:flex;flex-direction:column;gap:10px">
    <p class="small muted" style="margin:0">¿Qué querés hacer con este objetivo?</p>
    ${op('nuevaMetaComun', 'Juntar hasta llegar a un monto', 'Te muestro cuánto llevás y cuándo llegás a este ritmo.', 'Ej: bici nueva, la seña de un alquiler')}
    ${op('nuevoProyecto', 'Juntar y después gastarlo en algo', 'Ahorrás para algo puntual y después ves cuánto gastaste de lo que juntaste.', 'Ej: un viaje, pintar el depto, una fiesta', ' data-ahorrar="1"')}
    ${op('nuevoProyecto', 'Solo llevar la cuenta de lo que gasto', 'Para algo que vas pagando sin haber ahorrado antes. Juntás sus gastos y ves el total.', 'Ej: una obra en cuotas, el casamiento de un amigo', ' data-ahorrar="0"')}
  </div>`;
  return `<div style="display:flex;flex-direction:column;gap:10px">
    ${op('nuevoFondo', 'Un fondo fijo', 'Plata que querés tener siempre, sin fecha de fin. Si la usás, la volvés a llenar.', 'Ej: respaldo para arreglos de la casa, colchón para un cambio de trabajo')}
    ${op('nuevaMetaObjetivo', 'Un objetivo', 'Algo que querés lograr: llegar a un monto, comprarte algo, un viaje.', 'Ej: un curso, un instrumento, un viaje')}
  </div>`;
}

export function render(s) {
  const total = holdingsTotal(s);
  const items = s.holdings.map((h) => ({ ...h, ars: holdingArs(s, h) }));

  return `<section class="screen">
    ${screenHead('Mi plata', ojoMontos('ahorro'))}

    ${taparMontos(patrimonioHtml(s, patAbierto), 'ahorro')}

    <div class="tabs tabs-4" role="tablist" aria-label="Sección" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <button role="tab" data-action="ahorroVista" data-v="cuentas" aria-pressed="${vista === 'cuentas'}">Cuentas</button>
      <button role="tab" data-action="ahorroVista" data-v="mis" aria-pressed="${vista === 'mis'}">Ahorros</button>
      <button role="tab" data-action="ahorroVista" data-v="sueldo" aria-pressed="${vista === 'sueldo'}">Ingresos</button>
      <button role="tab" data-action="ahorroVista" data-v="plan" aria-pressed="${vista === 'plan'}">Metas</button>
    </div>
    ${vista === 'sueldo' ? sueldoCuerpo(s, 'ahorro') : ''}

    ${vista === 'cuentas' ? `<div class="btn-row"><button class="btn small" data-action="nuevaTransferencia">${icon('swap', 18)} Transferir entre cuentas</button><button class="btn small" data-action="irAhorros">${icon('sprout', 18)} Pasar a ahorros</button></div>
    ${taparMontos(cuerpoCuentas(s), 'ahorro')}` : ''}

    ${vista === 'mis' ? taparMontos(widgetAhorros(s), 'ahorro') : ''}
    ${vista === 'mis' && !s.espacio ? `<div id="pasar-ahorros">${taparMontos(panelAhorrar(s), 'ahorro')}</div>${taparMontos(comoAhorroHtml(s, comoAbierto), 'ahorro')}` : ''}

    ${vista === 'mis' ? `
    ${taparMontos((() => { const tot = Object.values(s.savedByApp || {}).reduce((a, v) => a + (Number(v) || 0), 0) + totalReintegros(reintegrosCobrados(s)); return tot ? `<button class="card logro" data-action="ahorroPesitosInfo"><span class="logro-ic">🏆</span><span class="grow"><b>Con Pesitos te ahorraste</b><span class="small muted">Reintegros, promos y desafíos</span></span><b class="logro-v">${money(tot)}</b></button>` : ''; })(), 'ahorro')}
    ${taparMontos(conversionAhorros(s), 'ahorro')}

    ` : vista === 'plan' ? `${metasLista(s)}
    <button class="btn small block" data-action="openGoalCalc">${icon('sprout', 18)} ¿Cuánto tengo que ahorrar por mes para llegar?</button>
    ${desafiosHtml(s)}` : ''}
  </section>`;
}

function goalForm(g = {}, s = {}) {
  const fondo = g.tipo === 'fondo';
  return `<form class="form" data-submit="saveGoal">
    <input type="hidden" name="id" value="${esc(g.id || '')}">
    <input type="hidden" name="tipo" value="${fondo ? 'fondo' : g.tipo === 'proyecto' ? 'proyecto' : 'meta'}">
    ${g.id && g.tipo !== 'proyecto' ? `<div class="seg" role="radiogroup" aria-label="Es un">
      <button type="button" role="radio" data-action="goalTipo" data-v="fondo" aria-checked="${fondo}">Fondo fijo</button>
      <button type="button" role="radio" data-action="goalTipo" data-v="meta" aria-checked="${!fondo}">Objetivo</button>
    </div>` : ''}
    <p class="small muted" style="margin:0" data-g-txt>${fondo ? 'Plata que querés tener siempre, sin fecha de fin. Podés sumarle un poco todos los meses y, si la usás para algo, la volvés a llenar sin que te baje lo que podés gastar.' : 'Te muestro cuánto llevás y en qué mes llegás a este ritmo.'}</p>
    <div class="field"><label for="g-n">Nombre</label><input id="g-n" name="name" value="${esc(g.name || '')}" placeholder="${fondo ? 'Ej: Respaldo para la casa' : 'Ej: Bici nueva'}" required></div>
    <div class="field-row">
      <div class="field"><label for="g-t" data-g-tl>${fondo ? 'Tope del fondo (opcional)' : 'Cuánto necesitás'}</label><input id="g-t" name="target" inputmode="decimal" value="${g.target || ''}" placeholder="${fondo ? 'Sin tope' : 'Ej: 1.500.000'}"></div>
      <div class="field"><label for="g-s">Ya tenés</label><input id="g-s" name="saved" inputmode="decimal" value="${g.saved || ''}" placeholder="Ej: 0"></div>
    </div>
    <div class="field"><label for="g-m">Aporte por mes</label><input id="g-m" name="monthly" inputmode="decimal" value="${g.monthly || ''}" placeholder="Ej: 30.000"></div>
    <div data-g-fondo ${fondo ? '' : 'hidden'}>
      <div class="field"><label for="g-c">¿Para qué gastos? (opcional)</label><select id="g-c" name="categoria"><option value="">Cualquiera</option>${allCategories().map((c) => `<option value="${c.id}" ${c.id === g.categoria ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select><span class="hint">Al cargar un gasto de esa categoría te propongo sacarlo del fondo.</span></div>
      <label class="check"><input type="checkbox" name="auto" ${g.auto !== false ? 'checked' : ''}> <span>Apartarlo todos los meses<br><span class="small muted">El aporte se suma a lo que te toca ahorrar y se descuenta de lo que podés gastar, como tus reglas.</span></span></label>
    </div>
    <label class="check" data-g-main ${fondo ? 'hidden' : ''}><input type="checkbox" name="main" ${g.main ? 'checked' : ''}> <span>Es mi meta principal<br><span class="small muted">Aparece en Inicio con su avance.</span></span></label>
    <button class="btn primary block" type="submit">Guardar</button>
    ${g.id ? `<button class="btn ghost block" type="button" data-action="deleteGoal" data-id="${g.id}">Borrar</button>` : ''}
  </form>`;
}

// ¿Rinde intereses? Billeteras con tasa automática u otra tasa que cargás vos
function rindeFields(s, h, type) {
  const tasas = (s.rendimientos && s.rendimientos.tasas) || {};
  const sel = h.rinde || (rinde(type) ? (type === 'plazo_fijo' ? 'manual' : '') : 'no');
  const pf = Object.entries((s.rendimientos && s.rendimientos.plazoFijo) || {}).sort((a, b) => b[1] - a[1]);
  const pfHint = pf.length ? `Hoy los bancos pagan entre ${String(pf[pf.length - 1][1]).replace('.', ',')}% y ${String(pf[0][1]).replace('.', ',')}% anual para clientes.` : '';
  const since = h.since || todayISO();
  return `<div class="rinde-box" ${rinde(type) ? '' : 'hidden'}>
    <div class="field"><label for="h-r">¿Te da intereses?</label><select id="h-r" name="rinde" data-change="rindeChanged">
      <option value="" ${!sel ? 'selected' : ''}>Elegí…</option>
      ${BILLETERAS_QUE_RINDEN.map((b) => `<option value="${b.id}" ${sel === b.id ? 'selected' : ''}>${b.nombre}${tasas[b.id] ? ` · hoy ${String(tasas[b.id].tna).replace('.', ',')}%${tasas[b.id].tope ? ` hasta ${money(tasas[b.id].tope)}` : ''}` : ''}</option>`).join('')}
      <option value="manual" ${sel === 'manual' ? 'selected' : ''}>Otra: escribo la tasa (TNA)</option>
      <option value="no" ${sel === 'no' ? 'selected' : ''}>No da intereses</option></select>
      <span class="hint">Con las billeteras de la lista, la tasa se actualiza sola todos los días.</span></div>
    <div class="field-row">
      <div class="field" data-tna ${sel === 'manual' ? '' : 'hidden'}><label for="h-tna">Tasa anual (TNA %)</label><input id="h-tna" name="tna" inputmode="decimal" value="${h.tna ? String(h.tna).replace('.', ',') : ''}" placeholder="Ej: 32,5"></div>
      <div class="field"><label for="h-since">Este monto lo tenés desde</label><input id="h-since" name="since" type="date" value="${esc(since)}" max="${todayISO()}"></div>
    </div>
    ${type === 'plazo_fijo' && pfHint ? `<span class="small muted">${pfHint}</span>` : ''}
    <span class="small muted">Desde esa fecha te sumo los intereses de cada día. Cuando veas tu saldo real, actualizá el monto y listo.</span>
  </div>`;
}

function holdingForm(h = {}, s = {}) {
  const type = h.type || 'remunerada';
  return `<form class="form" data-submit="saveHolding">
    <input type="hidden" name="id" value="${esc(h.id || '')}">
    <div class="field"><label for="h-t">¿Dónde o en qué?</label><select id="h-t" name="type" data-change="holdingTypeChanged">${HOLDING_TYPES.map((t) => `<option value="${t.id}" ${t.id === type ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>
    <div class="field"><label for="h-n">Nombre</label><input id="h-n" name="name" value="${esc(h.name || '')}" placeholder="Ej: Mercado Pago, Plazo fijo Provincia, Binance"></div>
    <div class="field-row">
      <div class="field"><label for="h-a">Cantidad</label><input id="h-a" name="amount" inputmode="decimal" value="${h.amount ?? ''}" placeholder="Ej: 300.000" required></div>
      <div class="field"><label for="h-c">Moneda o activo</label><select id="h-c" name="currency">${ASSETS.map((a) => `<option value="${a.id}" ${a.id === (h.currency || holdingType(type).asset) ? 'selected' : ''}>${a.label}</option>`).join('')}</select></div>
    </div>
    <span class="small muted">Cargá la cantidad en su moneda (por ejemplo, 0,005 bitcoin o 10 gramos de oro): la paso a pesos con la cotización del día.</span>
    ${rindeFields(s, h, type)}
    <div class="field"><label for="h-m">Vence el (plazos fijos, opcional)</label><input id="h-m" name="maturity" type="date" value="${esc(h.maturity || '')}"><span class="hint">Te lo muestro en "Vas a cobrar" y te aviso para renovarlo o moverlo.</span></div>
    <button class="btn primary block" type="submit">Guardar</button>
    ${h.id ? `<button class="btn ghost block" type="button" data-action="deleteHolding" data-id="${h.id}">Borrar</button>` : ''}
  </form>`;
}

// conversor: pesos, todos los dólares, otras monedas, cripto y oro
const CRIPTO = ['BTC', 'ETH', 'USDT', 'XAU'];
const CONV_GRUPOS = () => [
  ['Pesos y dólares', [['ARS', 'Pesos'], ...DOLARES.map(([id, n]) => [`USD:${id}`, n])]],
  ['Monedas', ASSETS.filter((a) => !['ARS', 'USD'].includes(a.id) && !CRIPTO.includes(a.id)).map((a) => [a.id, a.label]).sort((a, b) => a[1].localeCompare(b[1], 'es'))],
  ['Cripto y oro', ASSETS.filter((a) => CRIPTO.includes(a.id)).map((a) => [a.id, a.label])],
];
const CONV = () => CONV_GRUPOS().flatMap(([, l]) => l);
const convLabel = (id) => (CONV().find(([x]) => x === id) || [, assetById(id).label])[1];
function converterBody(s, d = { amount: '', from: `USD:${dolarRef(s)}`, to: 'ARS' }) {
  const opts = (sel) => CONV_GRUPOS().map(([g, l]) => `<optgroup label="${g}">${l.map(([id, n]) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${n}</option>`).join('')}</optgroup>`).join('');
  const mundo = [d.from, d.to].some((x) => assetById(x).mundo && !(s.rates || {})[x]);
  const r = convert(s, d.amount, d.from, d.to);
  return `<form class="form" data-submit="convert">
    <div class="field"><label for="cv-a">Cantidad</label><input id="cv-a" name="amount" inputmode="decimal" value="${d.amount === '' ? '' : esc(String(d.amount))}" placeholder="Ej: 100"></div>
    <div class="conv-row">
      <div class="field"><label for="cv-f">De</label><select id="cv-f" name="from">${opts(d.from)}</select></div>
      <button type="button" class="icon-btn" data-action="swapCurrencies" aria-label="Invertir monedas">${icon('swap', 20)}</button>
      <div class="field"><label for="cv-t">A</label><select id="cv-t" name="to">${opts(d.to)}</select></div>
    </div>
    <button class="btn primary block" type="submit">Convertir</button>
  </form>
  <div class="result ok"><span class="small">${esc(String(d.amount).replace('.', ','))} ${esc(convLabel(d.from))} =</span><strong style="font-size:24px">${r == null ? 'Sin cotización' : fmtAsset(r, d.to)}</strong><span class="small">Con cotización de venta · ${ratesAge(s)}</span>${mundo ? `<span class="small">Esa moneda la cruzo con el ${esc(nombreDolar(dolarRef(s)).toLowerCase())}. <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">Rates By Exchange Rate API</a></span>` : ''}</div>`;
}

export const actions = {
  ahorroVista(ctx, el) { vista = el.dataset.v; ctx.render(); },
  irMetas(ctx) { vista = 'plan'; ctx.go('ahorro'); },
  ahorroIr(ctx, el) { monedaTab = el.dataset.v; const c = document.querySelector('[data-ahcar]'); if (c) c.scrollTo({ left: pasoAh(c) * (Number(el.dataset.i) + 1), behavior: 'smooth' }); },
  // Herramientas → Cotizaciones
  openCotizaciones(ctx) { openModal('Cotizaciones', `<div id="cotiz-modal" style="display:flex;flex-direction:column;gap:12px">${quotes(ctx.state, true)}</div>`); },
  // todo lo de pasar plata a ahorros está en Mi plata → Ahorros
  irAhorros(ctx) {
    vista = 'mis'; closeModal();
    if (location.hash === '#/ahorro') ctx.render(); else ctx.go('ahorro');
    setTimeout(() => { const el = document.getElementById('pasar-ahorros'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 120);
  },
  patToggle(ctx) { patAbierto = !patAbierto; ctx.render(); },
  refreshQuotes(ctx) {
    toast('Actualizando cotizaciones…');
    refreshRates(ctx, true).then((ok) => { toast(ok ? 'Cotizaciones actualizadas' : 'Sin conexión: uso las últimas guardadas'); const m = document.getElementById('cotiz-modal'); if (m) m.innerHTML = quotes(ctx.state, true); });
  },
  elegirCotiz(ctx) { openModal('Cotizaciones', `<div id="cotiz-body" class="form">${elegirCotizBody(ctx.state)}</div>`); },
  toggleCotiz(ctx, el) {
    ctx.commit((s) => {
      s.settings = s.settings || {};
      const cur = new Set(cotizElegidas(s)); const id = el.dataset.id;
      if (cur.has(id)) { if (cur.size > 1) cur.delete(id); } else cur.add(id);
      s.settings.cotizVer = COTIZ_OPCIONES.map((o) => o.id).filter((x) => cur.has(x));
    });
    setModalBody('#cotiz-body', elegirCotizBody(ctx.state));
  },
  setDolarRef(ctx, el) { ctx.commit((s) => { s.settings.dolarRef = el.value; }); toast(`Uso el ${nombreDolar(el.value).toLowerCase()} para tus dólares`); },
  openConverter(ctx) { openModal('Conversor de monedas', `<div id="conv-body">${converterBody(ctx.state)}</div>`); },
  convert(ctx, d) {
    const raw = String(d.amount || '').trim();
    const amount = parseFloat((/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw) ? raw.replace(/\./g, '') : raw).replace(',', '.')) || 0;
    setModalBody('#conv-body', converterBody(ctx.state, { amount, from: d.from, to: d.to }));
  },
  swapCurrencies(ctx, el) {
    const f = el.closest('form');
    const a = f.querySelector('[name=from]'); const b = f.querySelector('[name=to]');
    [a.value, b.value] = [b.value, a.value];
    f.requestSubmit();
  },
  holdingTypeChanged(ctx, el) {
    const t = holdingType(el.value);
    const f = el.closest('form');
    const cur = f.querySelector('[name=currency]');
    if (cur) cur.value = t.asset;
    const box = f.querySelector('.rinde-box');
    if (box) box.hidden = !rinde(el.value);
  },
  rindeChanged(ctx, el) {
    const f = el.closest('form');
    const t = f.querySelector('[data-tna]');
    if (t) t.hidden = el.value !== 'manual';
  },
  openGoalForm() { openModal('¿Qué querés crear?', elegirMeta()); },
  nuevaMetaObjetivo() { openModal('Un objetivo', elegirMeta('objetivo'), { push: true }); },
  nuevaMetaComun(ctx) { openModal('Juntar hasta un monto', goalForm({}, ctx.state), { push: true }); },
  nuevoFondo(ctx) { openModal('Fondo fijo', goalForm({ tipo: 'fondo' }, ctx.state), { push: true }); },
  goalTipo(ctx, el) {
    const f = el.closest('form'); const fondo = el.dataset.v === 'fondo';
    f.querySelector('[name=tipo]').value = el.dataset.v;
    f.querySelectorAll('[data-action=goalTipo]').forEach((b) => b.setAttribute('aria-checked', String(b === el)));
    f.querySelector('[data-g-fondo]').hidden = !fondo; f.querySelector('[data-g-main]').hidden = fondo;
    f.querySelector('[data-g-tl]').textContent = fondo ? 'Tope del fondo (opcional)' : 'Cuánto necesitás';
    f.querySelector('#g-t').placeholder = fondo ? 'Sin tope' : 'Ej: 1.500.000';
    f.querySelector('[data-g-txt]').textContent = fondo ? 'Plata que querés tener siempre, sin fecha de fin. Podés sumarle un poco todos los meses y, si la usás para algo, la volvés a llenar sin que te baje lo que podés gastar.' : 'Te muestro cuánto llevás y en qué mes llegás a este ritmo.';
  },
  openGoal(ctx, el) {
    const g = ctx.state.goals.find((x) => x.id === el.dataset.id);
    if (!g) return;
    if (g.tipo === 'fondo') {
      const usos = ctx.state.expenses.filter((e) => e.fondoId === g.id && !e.destinoId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
      openModal(g.name, `<div class="card green"><span class="hero-label">Hay en el fondo</span><span class="hero-number" style="font-size:32px">${money(g.saved)}</span><span class="small on-green-muted">${esc(goalEta(g).text)}</span></div>
        <button class="btn block" data-action="destinarMeta" data-id="${g.id}">${icon('swap', 18)} Destinar</button>
        <form class="form" data-submit="contribute"><input type="hidden" name="id" value="${g.id}">
          <div class="field"><label for="c-a">Sumar al fondo</label><input id="c-a" name="amount" inputmode="decimal" placeholder="Ej: 30.000" required></div>
          <div class="field"><label for="c-f1">¿Cuándo?</label><input id="c-f1" name="date" type="date" value="${todayISO()}" max="${todayISO()}"></div>
          <button class="btn green block" type="submit">Aportar</button></form>
        ${usos.length ? `<div class="card tight"><strong style="padding:8px 0 0">Lo que salió del fondo</strong>${usos.map((e) => `<div class="row"><span class="grow"><span class="name">${esc(e.note)}</span><span class="meta">${esc(catLabel(e.category))} · ${e.date.split('-').reverse().join('/')}</span></span><span class="amount">−${money(e.amount)}</span></div>`).join('')}</div>` : ''}
        ${destinosHtml(ctx.state, g)}
        <button class="btn small block" data-action="editGoal" data-id="${g.id}">Editar fondo</button>`);
      return;
    }
    openModal(g.name, `<div class="card"><strong>${g.target ? `${money(g.saved)} de ${money(g.target)}` : `${money(g.saved)} juntados`}</strong><span class="text muted">${esc(goalEta(g).text)}</span></div>
      <form class="form" data-submit="contribute">
        <input type="hidden" name="id" value="${g.id}">
        <div class="field"><label for="c-a">Sumar a esta meta</label><input id="c-a" name="amount" inputmode="decimal" placeholder="Ej: 50.000" required></div>
        <div class="field"><label for="c-f2">¿Cuándo?</label><input id="c-f2" name="date" type="date" value="${todayISO()}" max="${todayISO()}"></div>
        <button class="btn green block" type="submit">Aportar</button>
      </form>
      ${g.saved > 0 ? `<button class="btn block" data-action="destinarMeta" data-id="${g.id}">${icon('swap', 18)} Destinar</button>` : ''}
      ${destinosHtml(ctx.state, g)}
      <button class="btn small block" data-action="editGoal" data-id="${g.id}">Editar meta</button>`);
  },
  destinarMeta(ctx, el) {
    const g = ctx.state.goals.find((x) => x.id === el.dataset.id); if (!g) return;
    openModal(`Destinar: ${g.name}`, destinarForm(ctx.state, g, el.dataset.proy || ''), { push: !document.getElementById('modal').hidden });
  },
  destinoCambio(ctx, el) {
    const f = el.closest('form'); const v = (f.querySelector('[name=destino]:checked') || {}).value;
    f.querySelectorAll('[data-dest]').forEach((x) => { x.hidden = x.dataset.dest !== v; });
    const n = f.querySelector('[data-dest-nuevo]'); if (n) n.hidden = (f.querySelector('[name=hacia]') || {}).value !== 'nuevo';
  },
  guardarDestino(ctx, d) {
    const monto = num(d.monto); if (!(monto > 0)) { toast('Poné el monto'); return; }
    const fecha = d.date && d.date <= todayISO() ? d.date : todayISO();
    const destino = ['gasto', 'disponible', 'ahorro'].includes(d.destino) ? d.destino : 'gasto';
    if (destino === 'ahorro' && d.hacia === 'nuevo' && !String(d.haciaNombre || '').trim()) { toast('Escribí a dónde la pasaste'); return; }
    let nombre = ''; const did = uid();
    ctx.commit((s) => {
      const g = s.goals.find((x) => x.id === d.id); if (!g) return;
      nombre = g.name;
      const esProy = g.tipo === 'proyecto';
      const reg = { id: did, date: fecha, monto, destino };
      if (d.desde) { moverEnAhorro(s, d.desde, -monto, fecha); reg.desde = d.desde; }
      if (destino === 'gasto') {
        const nota = String(d.nota || '').trim() || g.name;
        reg.nota = nota;
        s.expenses.push({ id: uid(), date: fecha, amount: monto, category: d.categoria || g.categoria || guessCategory(nota, s.learned), note: nota, installments: 1, fromSavings: true, destinoId: did,
          ...(g.tipo === 'fondo' ? { fondoId: g.id } : {}), ...(esProy && (d.proy || g.proyectoId) ? { proyectoId: d.proy || g.proyectoId } : {}) });
        // en un proyecto, lo gastado ya se descuenta de lo ahorrado (no bajo la meta dos veces)
        if (!esProy) g.saved = Math.round((g.saved - monto) * 100) / 100;
      } else if (destino === 'disponible') {
        const cuenta = String(d.cuenta || '').startsWith('acc:') ? d.cuenta.slice(4) : '';
        s.incomes.push({ id: uid(), date: fecha, amount: monto, type: 'extra', note: `De "${g.name}"`, destinoId: did, ...(cuenta ? { accountId: cuenta } : {}) });
        g.saved = Math.round((g.saved - monto) * 100) / 100;
      } else {
        let hid = d.hacia;
        if (hid === 'nuevo') { hid = uid(); s.holdings.push({ id: hid, type: 'otros', name: String(d.haciaNombre).trim(), amount: 0, currency: 'ARS', since: fecha }); reg.haciaNombre = String(d.haciaNombre).trim(); }
        moverEnAhorro(s, hid, monto, fecha); reg.hacia = hid;
        reg.sigue = d.sigue !== 'no';
        if (!reg.sigue) g.saved = Math.round((g.saved - monto) * 100) / 100;
      }
      g.destinos = [...(g.destinos || []), reg];
    });
    closeModal();
    toast(destino === 'gasto' ? `Listo: ${money(monto)} de "${nombre}" a un gasto` : destino === 'disponible' ? `Listo: ${money(monto)} de "${nombre}" vuelven a tu plata disponible` : `Listo: ${money(monto)} de "${nombre}" cambiaron de lugar`);
  },
  editGoal(ctx, el) {
    const g = ctx.state.goals.find((x) => x.id === el.dataset.id);
    if (g) openModal(g.tipo === 'fondo' ? 'Editar fondo' : 'Editar meta', goalForm(g, ctx.state), { push: true });
  },
  usarFondo(ctx, d) {
    const amount = num(d.amount); if (!amount) return;
    let queda = 0; let nombre = '';
    ctx.commit((s) => {
      const g = s.goals.find((x) => x.id === d.id); if (!g) return;
      g.saved = Math.round((g.saved - amount) * 100) / 100; queda = g.saved; nombre = g.name;
      const note = String(d.note || '').trim() || g.name;
      s.expenses.push({ id: uid(), date: d.date && d.date <= todayISO() ? d.date : todayISO(), amount, category: g.categoria || guessCategory(note, s.learned), note, installments: 1, fromSavings: true, fondoId: g.id });
    });
    closeModal(); toast(queda < 0 ? `Listo, pero el fondo "${nombre}" quedó en ${money(queda)}: te faltaba plata` : `Listo: salió del fondo "${nombre}". Quedan ${money(queda)}`);
  },
  contribute(ctx, d) {
    const amount = num(d.amount);
    if (!amount) return;
    let done = false; let name = '';
    ctx.commit((s) => {
      const g = s.goals.find((x) => x.id === d.id);
      if (!g) return;
      g.saved += amount; name = g.name; done = g.target > 0 && g.saved >= g.target;
      s.transfers.push({ id: uid(), date: d.date && d.date <= todayISO() ? d.date : todayISO(), amount, note: `Aporte a ${g.name}` });
    });
    closeModal(); toast(done ? `¡Cumpliste "${name}"!` : `Sumaste ${money(amount)} a "${name}"`);
  },
  saveGoal(ctx, d) {
    if (!String(d.name || '').trim()) return;
    ctx.commit((s) => {
      const fondo = d.tipo === 'fondo';
      const data = { name: d.name.trim(), target: num(d.target), saved: num(d.saved), monthly: num(d.monthly), main: !fondo && !!d.main, tipo: fondo ? 'fondo' : d.tipo === 'proyecto' ? 'proyecto' : 'meta', ...(fondo ? { categoria: d.categoria || '', auto: !!d.auto } : {}) };
      if (data.main) s.goals.forEach((g) => { g.main = false; });
      if (!fondo && !s.goals.some((g) => g.tipo !== 'fondo' && g.id !== d.id)) data.main = true;
      const g = s.goals.find((x) => x.id === d.id);
      if (g) Object.assign(g, data); else s.goals.push({ id: uid(), ...data });
    });
    closeModal(); toast(d.tipo === 'fondo' ? 'Fondo guardado' : 'Meta guardada');
  },
  deleteGoal(ctx, el) { closeModal(); borrarConDeshacer(ctx, 'Meta borrada', (s) => { s.goals = s.goals.filter((x) => x.id !== el.dataset.id); }); },
  newHolding(ctx) { refreshRendimientos(ctx); openModal('¿Dónde ahorrás?', holdingForm({}, ctx.state)); },
  editHolding(ctx, el) {
    const h = ctx.state.holdings.find((x) => x.id === el.dataset.id);
    if (!h) return;
    const hoy = valorHoy(ctx.state, h);
    // el formulario muestra el valor de hoy (con intereses); si no lo cambiás, se mantiene la fecha
    const vista = hoy !== h.amount ? { ...h, amount: Math.round(hoy * 100) / 100, since: todayISO(), _orig: h.amount } : h;
    openModal('Editar', holdingForm(vista, ctx.state));
  },
  saveHolding(ctx, d) {
    const amount = num(d.amount) || parseAmount(d.amount);
    if (!amount) { toast('Ingresá una cantidad'); return; }
    const tna = num(d.tna);
    ctx.commit((s) => {
      const conRinde = rinde(d.type) && d.rinde && d.rinde !== 'no';
      const data = { type: d.type, name: d.name.trim() || holdingType(d.type).label.replace(/ \(.*\)$/, ''), amount, currency: d.currency, maturity: d.maturity || '',
        rinde: rinde(d.type) ? (d.rinde || '') : 'no', tna: d.rinde === 'manual' ? tna : 0, since: conRinde ? (d.since || todayISO()) : '' };
      const h = s.holdings.find((x) => x.id === d.id);
      if (h) Object.assign(h, data); else s.holdings.push({ id: uid(), ...data });
    });
    closeModal(); toast('Guardado');
  },
  deleteHolding(ctx, el) { closeModal(); borrarConDeshacer(ctx, 'Ahorro borrado', (s) => { s.holdings = s.holdings.filter((x) => x.id !== el.dataset.id); }); },
};
