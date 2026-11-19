// Acciones compartidas entre pantallas: carga rápida, edición de
// movimientos, "¿Me lo compro?", comprobantes, cierre semanal,
// medios de pago, sugerencias de mejora y ajustes.

import { uid, emptyState, clear, migrate } from './almacenamiento.js';
import { parseEntry, merchantKey } from './interprete.js';
import { allWallets, CATEGORIES, allCategories, catLabel, WALLETS, setCustomCategories, setCustomWallets, PROVINCES, provinceLabel, categoriasOrdenadas, soloEmoji, catReal } from './categorias.js';
import { money, esc, todayISO, num, monthKey, relDay, normalize, toISO, addDays, parseISO, MONTHS, monthDiff } from './formato.js';
import { parseAmount } from './interprete.js';
import { weekSummary } from './calculos.js';
import { suggestions, renderSuggestion } from './guia.js';
import { LESSONS } from './aprender.js';
import { buyImpact, expectedBalance, mainGoal, lastSalary, cuotasReales, budget, holdingsTotal, periodoDe, notaCobro } from './calculos.js';
import { statementDates, statementOf, resumenDeCompra } from './agenda.js';
import { demoState } from './ejemplo.js';
import { detectarReintegro, promosCandidatas } from './reintegros.js';
import { openModal, closeModal, modalBack, toast, setModalBody, icon, catIcon, borrarConDeshacer, alternarMontos, selectorActions, montoProtegido, montosOcultos } from './interfaz.js';
import { bloqueoActivo, pedirPin } from './bloqueo.js';
import { OPTIONS_TEXT, DISCLAIMER, promosStatus, promosForDay } from './economista.js';
import { ratesAge, arsPer, aBase, monedaBase } from './cotizaciones.js';
import { valorHoy } from './rendimientos.js';
import { listaCuentas, cuentaPrincipal, nombreCuenta } from './cuentas.js';
import { avancePresupuesto } from './presupuestos.js';
import { ASSETS } from './categorias.js';
import { extraerEtiquetas, etiquetasDeTexto } from './formato.js';
import { lastIpc, refreshLive, expectedInflation } from './datosvivos.js';

const catOptions = (sel) => allCategories().map((c) => `<option value="${c.id}" ${c.id === catReal(sel) ? 'selected' : ''}>${esc(c.emoji ? c.emoji + ' ' : '')}${esc(c.label)}</option>`).join('');
const MONEDAS = ASSETS.filter((a) => ['ARS', 'USD', 'EUR', 'BRL', 'UYU', 'CLP', 'USDT'].includes(a.id));

/** Opciones de "con qué pagaste": cuentas y tarjetas de crédito. Valor: 'acc:<id>' o 'card:<id>'. */
export function medioOptions(s, sel, { conTarjetas = true, auto = false } = {}) {
  const ppal = cuentaPrincipal(s);
  return `${auto ? `<option value="">Automático (${esc(nombreCuenta(s, ppal))})</option>` : ''}
    <optgroup label="Cuentas">${listaCuentas(s).map((c) => `<option value="acc:${esc(c.id)}" ${sel === 'acc:' + c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>
    ${conTarjetas && s.cards.length ? `<optgroup label="Tarjetas de crédito">${s.cards.map((c) => `<option value="card:${esc(c.id)}" ${sel === 'card:' + c.id ? 'selected' : ''}>Tarjeta ${esc(c.name)}</option>`).join('')}</optgroup>` : ''}`;
}
/** Medios para elegir con un toque en la carga rápida (el primero es la cuenta principal). */
let formMedio = null;
// Marca un medio en el formulario rápido. Si no está entre los chips visibles, ocupa el lugar del último.
function elegirMedio(ctx, form, v, manual, sugerido = false) {
  const input = form.querySelector('[name=medio]'); if (!input) return;
  input.value = v;
  if (manual) form.dataset.medioManual = '1';
  let chip = form.querySelector(`[data-action=pickMedio][data-v="${CSS.escape(v)}"]`);
  if (!chip) {
    const m = mediosRapidos(ctx.state).find((x) => x.v === v); if (!m) return;
    chip = form.querySelector('[data-action=pickMedio].extra');
    if (!chip) { chip = document.createElement('button'); chip.type = 'button'; chip.setAttribute('role', 'radio'); chip.dataset.action = 'pickMedio'; form.querySelector('.medio-row').prepend(chip); }
    chip.className = `medio-chip extra${m.tarjeta ? ' tarjeta' : ''}`; chip.dataset.v = v; chip.innerHTML = `${m.tarjeta ? icon('card', 14) : ''}${esc(m.tarjeta ? m.label.replace(/^Tarjeta /, '') : m.label)}`;
  }
  form.querySelectorAll('[data-action=pickMedio]').forEach((b) => { b.setAttribute('aria-checked', String(b === chip)); b.classList.toggle('sugerido', b === chip && sugerido); });
  chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  promoEnVivo(ctx, form);
}

// Mientras escribís en la carga rápida: si ese gasto tiene promo con el medio elegido,
// te lo muestro y te pregunto ahí mismo si la usás (y el tope, si el banco no lo publica).
// Si otro de tus medios te devuelve más, te lo sugiero.
function gastoProvisorio(ctx, form, medio) {
  const q = form.querySelector('[name=q]'); if (!q) return null;
  if ((form.querySelector('[name=kind]') || {}).value === 'income') return null;
  const texto = extraerEtiquetas(q.value).texto; if (!texto.trim()) return null;
  const p = parseEntry(texto, ctx.state.learned); if (!p.amount) return null;
  const [t, id] = String(medio ?? (form.querySelector('[name=medio]') || {}).value ?? '').split(':');
  const cat = (form.querySelector('[name=category]') || {}).value;
  const cardId = t === 'card' ? id : t === 'acc' ? undefined : detectCard(ctx.state, texto);
  return { id: '__vivo', date: (form.querySelector('[name=date]') || {}).value || todayISO(), amount: p.amount, note: p.note, category: cat && cat !== 'auto' ? cat : p.category, installments: 1,
    ...(cardId ? { cardId } : { accountId: t === 'acc' ? id : cuentaPrincipal(ctx.state) }) };
}
// Checkbox "Pagué con promo o cashback": solo si lo marcás se cuenta el reintegro.
// Al lado te aviso si hay una promo con ese medio; al marcarlo, te muestro cuánto te
// devuelven (y el tope si el banco no lo publica). Si no encuentro ninguna, la cargás a mano.
// gastos pagados con un fondo o con tus ahorros: la plata sale de ahí (y vuelve si lo borrás o lo cambiás)
function sacarDeAhorro(s, h, monto) {
  if (h.since) { h.amount = Math.round((valorHoy(s, h) - monto) * 100) / 100; h.since = todayISO(); } else h.amount = Math.round(((Number(h.amount) || 0) - monto) * 100) / 100;
}
function devolverOrigen(s, x) {
  if (!x) return;
  if (x.fondoId) { const gf = (s.goals || []).find((g) => g.id === x.fondoId); if (gf) gf.saved = Math.round((gf.saved + x.amount) * 100) / 100; }
  if (x.holdingId) { const h = (s.holdings || []).find((y) => y.id === x.holdingId); if (h) sacarDeAhorro(s, h, -x.amount); }
}
// buscador de categorías de la carga rápida: deja solo las que coinciden
function actions_catFiltrar(form, q) {
  const t = normalize(String(q || '').trim());
  form.querySelectorAll('.cat-row [data-action=pickCat]').forEach((b) => { b.hidden = !!t && b.dataset.id !== 'auto' && !normalize(b.textContent).includes(t); });
  if (t) { const prim = [...form.querySelectorAll('.cat-row [data-action=pickCat]')].find((b) => !b.hidden && b.dataset.id !== 'auto'); if (prim) prim.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}
function promoEnVivo() { /* las promos ya no se marcan al cargar: se cargan cuando llegan */ }
export { promoEnVivo };
export function mediosRapidos(s) {
  const ppal = cuentaPrincipal(s);
  const todos = [
    { v: '', label: nombreCuenta(s, ppal), principal: true, grupo: 'Cuentas y billeteras' },
    ...listaCuentas(s).filter((c) => c.id !== ppal).map((c) => ({ v: `acc:${c.id}`, label: c.name, grupo: 'Cuentas y billeteras' })),
    ...(s.cards || []).map((c) => ({ v: `card:${c.id}`, label: `Tarjeta ${c.name}`, tarjeta: true, grupo: 'Tarjetas de crédito' })),
    // tarjetas elegidas en "Mis medios de pago" que todavía no cargaste en Tarjetas
    ...allWallets().filter((w) => w.kind === 'Tarjetas' && (s.wallets || []).includes(w.id)
      && !(s.cards || []).some((c) => normalize(c.name).includes(normalize(w.name)) || normalize(w.name).includes(normalize(c.name))))
      .map((w) => ({ v: `falta:${w.id}`, label: w.name, tarjeta: true, falta: true, grupo: 'Tarjetas sin cargar' })),
  ];
  // los que más usaste en los últimos 2 meses van primero (la cuenta principal siempre está)
  const desde = toISO(addDays(new Date(), -60));
  const usos = {};
  for (const e of s.expenses || []) if (e.date >= desde) { const m = medioDe(e); const k = m === `acc:${ppal}` ? '' : m; usos[k] = (usos[k] || 0) + 1; }
  todos.forEach((m, i) => { m.usos = usos[m.v] || 0; m.i = i; });
  const top = todos.filter((m) => !m.falta).sort((a, b) => b.usos - a.usos || a.i - b.i).slice(0, 3);
  if (!top.some((m) => m.principal)) top[top.length - 1] = todos[0];
  top.forEach((m) => { m.top = true; });
  return [...top.sort((a, b) => b.usos - a.usos || a.i - b.i), ...todos.filter((m) => !m.top)];
}
export const medioDe = (e) => (e.cardId ? `card:${e.cardId}` : e.accountId ? `acc:${e.accountId}` : '');

export function entryForm(s, e, kind) {
  const isIncome = kind === 'income';
  const B = monedaBase(s);
  const cur = e.currency || B;
  const original = e.original || e.amount;
  const sh = e.shared || null;
  const splits = Array.isArray(e.splits) ? e.splits : [];
  const medio = medioDe(e) || `acc:${cuentaPrincipal(s)}`;
  const montoTxt = (v) => (v ? String(Math.round(v * 100) / 100).replace('.', ',') : '');
  return `<form class="form" data-submit="saveEntry" data-change-form="entry">
    <input type="hidden" name="id" value="${esc(e.id || '')}">
    <input type="hidden" name="kind" value="${kind}">
    <div class="field-row money-row">
      <div class="field"><label for="f-amount">${sh ? 'Total del gasto' : 'Monto'}</label><input id="f-amount" name="amount" inputmode="decimal" required value="${montoTxt(sh ? (cur === B ? sh.total : original) : original)}" placeholder="${B === 'USD' ? 'Ej: 35' : 'Ej: 48.000'}"></div>
      <div class="field"><label for="f-cur">Moneda</label><select id="f-cur" name="currency" data-change="entryCurrency">${MONEDAS.map((a) => `<option value="${a.id}" ${a.id === cur ? 'selected' : ''}>${a.id === 'ARS' ? 'Pesos' : a.label}</option>`).join('')}</select></div>
    </div>
    <div class="field" data-cur-box ${cur === B ? 'hidden' : ''}><label for="f-rate">Cotización (${B === 'USD' ? 'dólares' : 'pesos'} por unidad)</label><input id="f-rate" name="rate" inputmode="decimal" value="${e.rate && cur !== B ? montoTxt(e.rate) : ''}" placeholder="${cur !== B && aBase(s, cur) ? `Hoy: ${montoTxt(aBase(s, cur))}` : B === 'USD' ? 'Ej: 0,0007' : 'Ej: 1.200'}"><span class="hint">Si la dejás vacía, uso la cotización del día. Si pagaste con otra (por ejemplo, dólar tarjeta), escribila.</span></div>
    <div class="field"><label for="f-note">Descripción</label><input id="f-note" name="note" value="${esc(e.note || '')}" placeholder="Ej: Coto, nafta, cena con amigos"></div>
    ${isIncome
      ? `<div class="field-row"><div class="field"><label for="f-type">Tipo</label><select id="f-type" name="type"><option value="sueldo" ${e.type === 'sueldo' ? 'selected' : ''}>Cobro del mes</option><option value="extra" ${e.type !== 'sueldo' ? 'selected' : ''}>Ingreso extra</option></select></div>
         <div class="field"><label for="f-acc">Entró en</label><select id="f-acc" name="medio">${medioOptions(s, medio, { conTarjetas: false })}</select></div></div>
         ${e.id && (e.type === 'sueldo' || e.laboral) ? `<div class="field"><label for="f-per">Mes al que corresponde</label><input id="f-per" name="periodo" type="month" value="${periodoDe(e)}"><span class="hint">A qué mes corresponde este cobro. Con esto se arma la evolución de tus ingresos.</span></div>` : ''}`
      : `<div class="field"><label for="f-cat">Categoría</label><select id="f-cat" name="category">${catOptions(e.category)}</select><span class="hint">Si la corregís, la próxima vez la reconozco sola.</span></div>
         <label class="check"><input type="checkbox" name="dividir" data-change="entryToggle" data-box="split" ${splits.length ? 'checked' : ''}> <span>Dividir en varias categorías<br><span class="small muted">Ej: en el súper compraste comida y cosas de limpieza.</span></span></label>
         <div class="split-box" data-box-id="split" ${splits.length ? '' : 'hidden'}>
           ${[0, 1, 2, 3].map((i) => `<div class="field-row"><select name="sc${i}" aria-label="Categoría ${i + 1}">${catOptions((splits[i] || {}).category || (i === 0 ? e.category : ''))}</select><input name="sa${i}" inputmode="decimal" aria-label="Monto ${i + 1}" placeholder="Monto" value="${montoTxt((splits[i] || {}).amount)}"></div>`).join('')}
           <span class="hint">Las partes tienen que sumar el total. La que dejes vacía no se usa.</span>
         </div>
         <div class="field"><label for="f-medio">Con qué pagaste</label><select id="f-medio" name="medio">${medioOptions(s, medio)}</select></div>
         <input type="hidden" name="installments" value="${e.installments > 1 ? e.installments : 1}">
         ${e.installments > 1 ? `<span class="hint">En ${e.installments} cuotas: las cuotas se manejan en Por pagar → Tarjetas.</span>` : ''}
         ${(() => { const r = e.id ? cuotasReales(s, e) : null; return r ? `<div class="card lime" style="padding:12px 14px"><span class="small"><b>Con la inflación, esta compra te sale ${money(r.pv)}</b> en plata del día que compraste (en vez de ${money(r.total)}): ${money(r.licuado)} menos. Llevás ${r.pagadas} de ${r.n} cuotas.${r.estimadas ? ` ${r.estimadas === r.n ? 'Todas las cuotas usan' : `${r.estimadas} cuota${r.estimadas > 1 ? 's usan' : ' usa'}`} la inflación esperada hasta que el INDEC publique el dato.` : ''}</span></div>` : ''; })()}`}
    ${(() => {
      if (isIncome) return '';
      const fondos = (s.goals || []).filter((g) => g.tipo === 'fondo');
      const base = monedaBase(s);
      const ahorros = (s.holdings || []).filter((h) => (h.currency || 'ARS') === base);
      if (!fondos.length && !ahorros.length) return '';
      const sel = e.fondoId ? `fondo:${e.fondoId}` : e.holdingId ? `ahorro:${e.holdingId}` : '';
      return `<div class="field"><label for="f-orig">¿De dónde sale la plata?</label><select id="f-orig" name="origen"><option value="">De la plata del mes</option>
        ${fondos.length ? `<optgroup label="Fondos">${fondos.map((g) => `<option value="fondo:${esc(g.id)}" ${sel === 'fondo:' + g.id ? 'selected' : ''}>${esc(g.name)} (hay ${money(g.saved)})</option>`).join('')}</optgroup>` : ''}
        ${ahorros.length ? `<optgroup label="Tus ahorros">${ahorros.map((h) => `<option value="ahorro:${esc(h.id)}" ${sel === 'ahorro:' + h.id ? 'selected' : ''}>${esc(h.name)} (hay ${money(valorHoy(s, h))})</option>`).join('')}</optgroup>` : ''}
      </select><span class="hint">Si sale de un fondo o de tus ahorros, no te baja lo que podés gastar: lo descuento de ahí.</span></div>`;
    })()}
    ${(s.proyectos || []).some((p) => !p.cerrado || p.id === e.proyectoId) ? `<div class="field"><label for="f-proy">Proyecto (opcional)</label><select id="f-proy" name="proyectoId"><option value="">Ninguno</option>${s.proyectos.filter((p) => !p.cerrado || p.id === e.proyectoId).map((p) => `<option value="${esc(p.id)}" ${p.id === e.proyectoId ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div>` : ''}
    ${isIncome || !(e.reintegro && !e.reintegro.no) ? '' : (() => { const r = e.reintegro; return `<details class="reint-box"><summary><span>💸 Reintegro: ${money(r.monto)}</span><span class="small muted">${r.ok ? `llegó el ${r.fecha.split('-').reverse().join('/')}` : `el ${r.fecha.split('-').reverse().join('/')}`}</span></summary>
      <input type="hidden" name="reintEdit" value="1">
      <div class="field-row"><div class="field"><label for="f-rm">Te devolvieron</label><input id="f-rm" name="reintMonto" inputmode="decimal" value="${r.monto}"></div>
      <div class="field"><label for="f-rf">El</label><input id="f-rf" name="reintFecha" type="date" value="${esc(r.fecha)}"></div></div>
      <span class="hint">Poné 0 para sacarlo. Los reintegros se cargan cuando llegan, desde Reintegros.</span>
    </details>`; })()}
    <div class="field-row">
      <div class="field"><label for="f-date">Fecha</label><input id="f-date" name="date" type="date" value="${esc(e.date || todayISO())}"></div>
      <div class="field"><label for="f-tags">Etiquetas</label><input id="f-tags" name="tags" value="${esc((e.tags || []).join(', '))}" placeholder="Ej: vacaciones, auto"></div>
    </div>
    ${isIncome ? '' : `<label class="check"><input type="checkbox" name="compartido" data-change="entryToggle" data-box="shared" ${sh ? 'checked' : ''}> <span>Lo compartí con otras personas<br><span class="small muted">Cuento solo tu parte como gasto y te anoto lo que te deben (o lo que debés).</span></span></label>
    <div class="split-box" data-box-id="shared" ${sh ? '' : 'hidden'}>
      <div class="field-row"><div class="field"><label for="f-with">Con quién</label><input id="f-with" name="with" value="${esc((sh && sh.with) || '')}" placeholder="Ej: Juan"></div>
      <div class="field"><label for="f-payer">¿Quién pagó?</label><select id="f-payer" name="payer"><option value="yo" ${!sh || sh.paidByMe ? 'selected' : ''}>Yo</option><option value="otro" ${sh && !sh.paidByMe ? 'selected' : ''}>La otra persona</option></select></div></div>
      <div class="field"><label for="f-mine">Mi parte</label><input id="f-mine" name="mine" inputmode="decimal" value="${montoTxt(sh ? (cur === B ? e.amount : e.amount / (e.rate || 1)) : '')}" placeholder="Ej: la mitad">
        <div class="chips" style="margin-top:6px">${[2, 3, 4].map((n) => `<button type="button" class="chip" data-action="entryParte" data-n="${n}">Entre ${n}</button>`).join('')}</div></div>
    </div>`}
    <button class="btn primary block" type="submit">${e.pending ? 'Confirmar' : 'Guardar'}</button>
    ${e.id ? `<button class="btn ghost block" type="button" data-action="deleteEntry" data-id="${esc(e.id)}" data-kind="${kind}">Borrar</button>` : ''}
  </form>`;
}

function pendingList(s) {
  const p = s.expenses.filter((e) => e.pending);
  if (!p.length) return '<p class="empty">No hay comprobantes pendientes.</p>';
  return `<div class="card tight">${p.map((e) => `<div class="row">
      <div class="grow"><span class="name">${esc(e.note)}</span><span class="meta">${catLabel(e.category)} · ${relDay(e.date)}</span></div>
      <span class="amount">${money(e.amount)}</span>
      <button class="btn small green" data-action="confirmPending" data-id="${e.id}">Ok</button>
      <button class="icon-btn" data-action="openEntry" data-push="1" data-id="${e.id}" data-kind="expense" aria-label="Revisar ${esc(e.note)}">${icon('chevron', 18)}</button>
    </div>`).join('')}</div>`;
}

function detectCard(s, text) {
  const t = normalize(text);
  const words = t.split(/[^a-z0-9]+/);
  const card = s.cards.find((c) => t.includes(normalize(c.name)) || normalize(c.name).split(/\s+/).some((w) => w.length >= 4 && words.includes(w)));
  if (card) return card.id;
  if (/\b(tarjeta|credito)\b/.test(t) && s.cards.length) return s.cards[0].id;
  return undefined;
}

function walletsBody(s) {
  const mine = new Set(s.wallets);
  const groups = ['Bancos', 'Billeteras', 'Tarjetas'];
  const all = [...WALLETS, ...(s.customWallets || [])];
  const cuentas = listaCuentas(s).filter((c) => c.id !== 'efectivo' || true);
  const ppal = cuentaPrincipal(s);
  const sueldo = s.cuentaSueldo || ppal;
  return `${cuentas.length > 1 ? `<div class="card form">
      <div class="field"><label for="w-ppal">Cuenta del día a día (principal)</label><select id="w-ppal" data-change="setPrincipal">${cuentas.map((c) => `<option value="${esc(c.id)}" ${c.id === ppal ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><span class="hint">Donde solés tener la plata: la uso cuando cargás un gasto rápido sin elegir con qué pagaste.</span></div>
      <div class="field"><label for="w-sue">Dónde cobrás</label><select id="w-sue" data-change="setCuentaSueldo">${cuentas.map((c) => `<option value="${esc(c.id)}" ${c.id === sueldo ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><span class="hint">Cuando cargás el sueldo, entra en esta cuenta.</span></div></div>` : ''}
    <p class="text muted">Tocá los que usás. Con eso cruzo los descuentos de cada día y te aviso el día antes.</p>
    ${groups.map((g) => `<div class="field"><label>${g}</label><div class="chips">${all.filter((w) => w.kind === g).map((w) => `<button class="chip toggle" data-action="toggleWallet" data-id="${esc(w.id)}" aria-pressed="${mine.has(w.id)}">${esc(w.name)}</button>`).join('')}</div></div>`).join('')}
    <form class="form card" data-submit="addWallet" autocomplete="off">
      <strong style="font-size:14px">¿No está el tuyo?</strong>
      <div class="field-row">
        <div class="field"><label for="w-n">Nombre</label><input id="w-n" name="name" placeholder="Ej: Banco Patagonia" list="w-n-list" required></div>
        <div class="field"><label for="w-k">Tipo</label><select id="w-k" name="kind">${groups.map((g) => `<option>${g}</option>`).join('')}</select></div>
      </div>
      <button class="btn small green" type="submit">Agregar</button>
      <span class="small muted">Si aparece en las sugerencias al escribir, ya tengo sus promos. Si no, igual lo anoto y se suman cuando aparezcan en las fuentes.</span>
      <datalist id="w-n-list">${[...new Set(((s.live && s.live.promos) || []).map((p) => p.walletName).filter(Boolean))].sort().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    </form>
    <p class="small muted">${esc(promosStatus(s))}</p>
    <button class="btn primary block" data-action="closeModal">Listo</button>`;
}

// Administrar categorías ("Más" en la fila de categorías): todas, marcadas y sin marcar.
// Marcar = aparece al cargar gastos. También crear, editar (nombre y emoji), borrar y ordenar.
function categoriesBody(s) {
  const prefs = s.catPrefs || {};
  const orden = prefs.orden || 'frecuentes';
  const ocultas = new Set(prefs.ocultas || []);
  const lista = categoriasOrdenadas(s, { conOcultas: true });
  const marcadas = lista.filter((c) => !ocultas.has(c.id)).length;
  return `<p class="small muted" style="margin:0">Marcá las que usás: son las que aparecen al cargar un gasto. Las que no marcás quedan guardadas acá. <b>${marcadas} de ${lista.length}</b> marcadas.</p>
    <details class="card plegable"${(s.customCategories || []).length ? '' : ' open'}><summary><strong>+ Crear una categoría</strong></summary>
      <form class="form" data-submit="saveCategory" autocomplete="off">
        <div class="field-row cat-new">
          <div class="field"><label for="cat-e">Emoji (opcional)</label><input id="cat-e" name="emoji" class="emoji-input" maxlength="8" placeholder="🙂" aria-describedby="cat-e-h"></div>
          <div class="field"><label for="cat-n">Nombre</label><input id="cat-n" name="label" placeholder="Ej: Clases de cerámica" required maxlength="30"></div>
        </div>
        <span class="hint" id="cat-e-h">Para el emoji, tocá el campo y elegilo desde el teclado del celular (en la compu: Windows + punto).</span>
        <button class="btn primary block" type="submit">Crear categoría</button>
      </form>
    </details>
    <div class="card tight cat-lista" data-sortable="catOrdenar">${lista.map((c) => { const on = !ocultas.has(c.id); return `<div class="row cat-admin ${on ? '' : 'oculta'}" data-sort-id="${esc(c.id)}">
        <button type="button" class="grip" data-grip aria-label="Mover ${esc(c.label)} (flechas arriba y abajo)">${icon('grip', 18)}</button>
        <button type="button" class="cat-check" data-action="catOcultar" data-id="${esc(c.id)}" role="checkbox" aria-checked="${on}" aria-label="${on ? 'Desmarcar' : 'Marcar'} ${esc(c.label)}" ${c.id === 'otros' ? 'disabled title="Otros siempre está"' : ''}>${on ? icon('check', 16, 2.6) : ''}</button>
        <span class="cat-icon">${catIcon(c, 18)}</span><span class="grow"><span class="name">${esc(c.label)}</span><span class="meta">${c.custom ? 'Creada por vos' : c.id === 'otros' ? 'Siempre está, para lo que no entra en ninguna' : esc(c.hint || '')}</span></span>
        <button class="icon-btn mini" data-action="catEditar" data-id="${esc(c.id)}" aria-label="Editar ${esc(c.label)}">${icon('edit', 16)}</button>
        ${c.id !== 'otros' ? `<button class="icon-btn mini" data-action="deleteCategory" data-id="${esc(c.id)}" aria-label="Eliminar ${esc(c.label)}">${icon('trash', 16)}</button>` : ''}
      </div>`; }).join('')}</div>
    <div class="field"><span class="small" style="font-weight:700">Ordenar por</span>
      <div class="tabs">${[['frecuentes', 'Más usadas'], ['personalizado', 'A mi gusto'], ['alfabetico', 'A-Z']].map(([v, l]) => `<button type="button" data-action="catOrden" data-v="${v}" aria-pressed="${orden === v}">${l}</button>`).join('')}</div>
      <span class="hint">${orden === 'frecuentes' ? 'Primero las que más usaste en los últimos 3 meses.' : orden === 'personalizado' ? 'En el orden que elegiste.' : 'Por orden alfabético.'} Para acomodarlas a tu gusto, arrastrá cada una desde ${icon('grip', 13)}.</span></div>
    ${(prefs.eliminadas || []).length ? `<button class="btn ghost block" data-action="catRestaurar">Restaurar categorías eliminadas (${prefs.eliminadas.length})</button>` : ''}`;
}
function catEditForm(c) {
  return `<form class="form" data-submit="guardarCatEdit" autocomplete="off"><input type="hidden" name="id" value="${esc(c.id)}">
    <div class="field-row cat-new">
      <div class="field"><label for="ce-e">Emoji</label><input id="ce-e" name="emoji" class="emoji-input" maxlength="8" value="${esc(c.emoji || '')}" placeholder="🙂"></div>
      <div class="field"><label for="ce-n">Nombre</label><input id="ce-n" name="label" value="${esc(c.label)}" required maxlength="30"></div>
    </div>
    ${c.custom ? '' : `<span class="hint">Es una categoría de Pesitos: le cambiás cómo se ve y la sigo detectando sola (${esc(c.hint || '')}).</span>`}
    <button class="btn primary block" type="submit">Guardar</button>
    ${!c.custom && c.renombrada ? `<button class="btn ghost block" type="button" data-action="catNombreOriginal" data-id="${esc(c.id)}">Volver al nombre original</button>` : ''}
  </form>`;
}

function weekDetail(w) {
  const d = (iso) => { const x = parseISO(iso); return `${x.getDate()} ${MONTHS[x.getMonth()].toLowerCase()}`; };
  return `<div class="card"><span class="small muted">Del ${d(w.from)} al ${d(w.to)}</span>
      <span style="font-size:28px;font-weight:800">${money(w.spent)}</span>
      <span class="text">${esc(w.verdict)}</span></div>
    ${w.top.length ? `<div class="card tight">${w.top.map((c) => `<div class="row"><span class="grow"><span class="name">${esc(catLabel(c.cat))}</span></span><span class="amount">${money(c.amount)}</span></div>`).join('')}</div>` : ''}
    ${w.income ? `<span class="small muted">Ingresos de la semana: ${money(w.income)}</span>` : ''}
    <p class="small muted">El resumen se arma solo cada lunes a las 00:00 con lo que anotaste. Si querés que también cuente lo que no anotaste (efectivo, gastos chicos), ajustalo con tu saldo real.</p>
    <button class="btn block" data-action="openClose" data-push="1">Ajustar con mi saldo real</button>`;
}

// ---------- ¿Me lo compro? Guía de decisión ----------
let guiaCompra = null; // { amount, resp: { tipo, compare, promo, pensado, pago } }

function numerosCompra(s, amount) {
  const b = budget(s);
  const r = buyImpact(s, amount);
  const sal = lastSalary(s);
  const g = mainGoal(s);
    const lineas = [];
    if (!b.noIncome) {
      lineas.push(['sun', 'Hoy', amount <= b.todayLeft
        ? `Hoy podés gastar ${money(b.todayLeft)}. Después de esta compra te quedarían <b>${money(b.todayLeft - amount)}</b>.`
        : `Hoy podés gastar ${money(Math.max(0, b.todayLeft))}: esta compra se pasa por <b>${money(amount - Math.max(0, b.todayLeft))}</b>.`]);
      lineas.push(['calendar', 'Hasta el cobro', amount <= b.free
        ? `Es el <b>${Math.round((amount / Math.max(1, b.free)) * 100)}%</b> de lo que te queda libre hasta cobrar (${money(b.free)} en ${b.cycle.daysLeft} días).${amount > b.todayLeft ? ` ${esc(r.text)}` : ''}`
        : `No te alcanza: te faltan <b>${money(amount - Math.max(0, b.free))}</b> de lo libre hasta el cobro.`]);
    }
    // contra tu gasto de todos los días (promedio de los últimos 30 días)
    const desde = toISO(addDays(new Date(), -30));
    const variable30 = s.expenses.filter((e) => !e.pending && e.date >= desde && !e.fromPayment).reduce((a, e) => a + (e.installments > 1 ? e.amount / e.installments : e.amount), 0);
    const porDia = variable30 / 30;
    if (porDia > 0) lineas.push(['chart', 'Tu gasto de siempre', `Es como <b>${(amount / porDia).toFixed(1).replace('.', ',')} días</b> de lo que gastás normalmente (${money(porDia)} por día en promedio).`]);
    if (sal) {
      const dias = amount / (sal.amount / 22);
      lineas.push(['clock', 'Tu trabajo', `Es el ${Math.max(1, Math.round((amount / sal.amount) * 100))}% de lo que cobrás por mes: <b>${dias < 1 ? (Math.round(dias * 8) <= 1 ? 'menos de 1 hora' : `${Math.round(dias * 8)} horas`) : `${dias.toFixed(1).replace('.', ',')} días`}</b> de trabajo.`]);
    }
    if (g) {
      const exceso = Math.max(0, amount - Math.max(0, b.todayLeft));
      const deSobrante = Math.min(exceso, b.sobrante || 0);
      const deAhorro = Math.max(0, amount - Math.max(0, b.free));
      const atrasa = g.monthly > 0 ? Math.round((deSobrante + deAhorro) / (g.monthly / 30)) : 0;
      lineas.push(['target', `Tu meta: ${esc(g.name)}`, atrasa >= 1 ? `Esta plata podría ir a tu meta: la atrasa unos <b>${atrasa} días</b>.` : 'No toca lo que apartaste para tu meta.']);
    }
    // tus ahorros y el fondo de emergencia
    const ahorrado = holdingsTotal(s);
    const fijos = (s.fixed || []).reduce((a, f) => a + (Number(f.amount) || 0), 0);
    if (ahorrado > 0) lineas.push(['wallet', 'Tus ahorros', `Es el <b>${Math.max(1, Math.round((amount / ahorrado) * 100))}%</b> de lo que tenés ahorrado (${money(ahorrado)}).${fijos && ahorrado < fijos * 3 ? ' Ojo: todavía no llegás a 3 meses de gastos fijos de fondo de emergencia.' : ''}`]);
    else lineas.push(['wallet', 'Tus ahorros', 'No tenés ahorros cargados. Si es un gusto, conviene primero armar un fondo para imprevistos.']);
    // con tarjeta: cuándo lo pagás
    const card = (s.cards || [])[0];
    if (card) {
      const due = statementDates(card, statementOf(card, todayISO())).due;
      lineas.push(['card', `Con la tarjeta ${esc(card.name)}`, `Si lo pagás hoy en 1 pago, lo pagás recién el <b>${due.getDate()}/${due.getMonth() + 1}</b> (con el resumen). Asegurate de tener la plata ese día.`]);
    }
    // en cuotas sin interés
    const infl = expectedInflation(s) / 100;
    const vh = (n) => { let pv = 0; for (let k = 1; k <= n; k++) pv += amount / n / Math.pow(1 + infl, k); return pv; };
    lineas.push(['repeat', 'Si hay cuotas sin interés', [3, 6, 12].map((n) => `${n} de <b>${money(amount / n)}</b>${sal ? ` (${Math.max(1, Math.round((amount / n / sal.amount) * 100))}% de tus ingresos)` : ''}`).join(' · ') + `. En 6 cuotas, con la inflación, en plata de hoy pagarías ${money(vh(6))}: ${money(amount - vh(6))} menos.`]);
  return { b, r, sal, lineas, ahorrado, fijos };
}

const PREGUNTAS_COMPRA = (amount, b, promosHoy, resp = {}) => [
  { k: 'tipo', q: '¿Es algo que necesitás o un gusto?', ops: [['necesito', 'Lo necesito'], ['gusto', 'Es un gusto']], ayuda: 'Necesitar es que sin eso tenés un problema (se rompió, es para trabajar, es salud). Si no, es un gusto: está bien, pero se mide más fino.' },
  ...(resp.tipo === 'gusto' ? [{ k: 'parecido', q: '¿Ya tenés algo que cumpla la misma función?', ops: [['si', 'Sí, pero quiero este'], ['no', 'No tengo nada parecido']], ayuda: 'Reemplazar algo que funciona es de los gastos que más se lamentan.' }] : []),
  { k: 'compare', q: '¿Comparaste el precio en otro lado?', ops: [['si', 'Sí'], ['no', 'Todavía no']], ayuda: 'Comparar 2 o 3 lugares suele ahorrar un 10% o más.' },
  { k: 'promo', q: '¿Hay promo o reintegro con tus medios de pago?', ops: [['si', 'Sí, la voy a usar'], ['no', 'No hay'], ['nose', 'No sé']], ayuda: promosHoy ? `Hoy tenés ${promosHoy} promo${promosHoy === 1 ? '' : 's'} con tus medios de pago.` : 'Fijate en Beneficios antes de pagar.' },
  ...(resp.tipo === 'gusto' || amount > 3 * Math.max(1, b.dailyBase || 0) ? [{ k: 'pensado', q: '¿Lo venís pensando hace más de 2 días?', ops: [['si', 'Sí, lo pensé'], ['no', 'Lo vi y lo quiero']], ayuda: 'Esperar 48 horas evita la mayoría de los arrepentimientos.' }] : []),
  { k: 'pago', q: '¿Cómo lo pagarías?', ops: [['contado', 'Contado o débito'], ['tarjeta', 'Tarjeta en 1 pago'], ['cuotas', 'En cuotas']] },
];

function pintarGuiaCompra(s) {
  const { amount, resp } = guiaCompra;
  const n = numerosCompra(s, amount);
  const promosHoy = promosForDay(s, new Date().getDay()).length;
  const pregs = PREGUNTAS_COMPRA(amount, n.b, promosHoy, resp);
  const pend = pregs.find((p) => !(p.k in resp));
  const hechas = pregs.filter((p) => p.k in resp).length;
  const progreso = `<div class="guia-prog" aria-label="Paso ${Math.min(hechas + 1, pregs.length + 1)} de ${pregs.length + 1}">${pregs.map((p, i) => `<span class="${i < hechas ? 'ok' : i === hechas ? 'on' : ''}"></span>`).join('')}<span class="${pend ? '' : 'on'}"></span></div>`;
  if (pend) {
    setModalBody('#buy-result', `<div class="card guia-paso">${progreso}
      <strong class="guia-q">${pend.q}</strong>
      <div class="guia-ops">${pend.ops.map(([v, l]) => `<button type="button" class="btn" data-action="buyResp" data-k="${pend.k}" data-v="${v}">${l}</button>`).join('')}</div>
      ${pend.ayuda ? `<span class="small muted">${pend.ayuda}</span>` : ''}
      ${hechas ? '<button type="button" class="link-btn" data-action="buyAtras" style="align-self:flex-start">‹ Volver a la anterior</button>' : ''}
    </div>`);
    return;
  }
  // ---- conclusión ----
  // Criterio exigente: un gusto tiene que pasar varias pruebas para que la respuesta sea "sí".
  const { b, sal } = n;
  const gusto = resp.tipo === 'gusto';
  const impulso = resp.pensado === 'no';
  const razones = []; const hacer = [];
  const plata = b.noIncome ? 'sin-datos' : amount <= Math.max(0, b.todayLeft) ? 'holgado' : amount <= Math.max(0, b.free) ? 'ajustado' : amount <= Math.max(0, b.free) + n.ahorrado ? 'ahorros' : 'no-alcanza';
  if (plata === 'holgado') razones.push(`Entra en lo que podés gastar hoy (${money(b.todayLeft)}).`);
  if (plata === 'ajustado') { const nuevo = (b.free - amount) / Math.max(1, b.cycle.daysLeft - 1); razones.push(`Usa plata de los próximos días: quedarías con <b>${money(Math.max(0, nuevo))} por día</b> hasta el cobro (en vez de ${money(b.dailyBase)}).`); }
  if (plata === 'ahorros') razones.push(`No te alcanza con la plata del mes: <b>${money(amount - Math.max(0, b.free))}</b> saldrían de tus ahorros.`);
  if (plata === 'no-alcanza') razones.push(`No te alcanza: ni con la plata del mes ni con tus ahorros cargados (te faltan ${money(amount - Math.max(0, b.free) - n.ahorrado)}).`);
  if (plata === 'sin-datos') razones.push('Todavía no sé cuánto cobrás, así que no puedo medirlo contra tu mes.');
  const pctSueldo = sal ? amount / sal.amount : 0;
  if (sal) razones.push(`Equivale a ${Math.max(1, Math.round(pctSueldo * 100))}% de tus ingresos del mes.`);
  const grande = amount > 3 * Math.max(1, b.dailyBase || 0);
  const fondoMeses = n.fijos > 0 ? n.ahorrado / n.fijos : 99;
  const sePasa = b.adelanto > b.normalDaily * 0.3;
  const comeAhorro = b.sobrante > 0 && amount > Math.max(0, b.todayLeft) && amount - Math.max(0, b.todayLeft) > b.sobrante;
  const g = mainGoal(s);
  const atrasaMeta = g && g.monthly > 0 && plata !== 'holgado' ? Math.round(Math.max(0, amount - Math.max(0, b.todayLeft)) / (g.monthly / 30)) : 0;
  const cuotasMes = s.expenses.filter((e) => !e.pending && e.installments > 1).reduce((a, e) => { const k = monthDiff(e.date.slice(0, 7), monthKey()); return k >= 0 && k < e.installments ? a + e.amount / e.installments : a; }, 0);
  const cuotasPct = sal ? (cuotasMes + (resp.pago === 'cuotas' ? amount / 6 : 0)) / sal.amount : 0;
  // motivos para decir que no (alcanza uno) y para pedir cautela
  const no = []; const ojo = [];
  if (plata === 'no-alcanza') no.push(gusto ? 'Armá una meta de ahorro para comprarlo más adelante.' : 'Si es imprescindible, buscá una alternativa más barata o cuotas sin interés.');
  if (gusto) {
    if (plata === 'ahorros') no.push('Un gusto no debería salir de tus ahorros: juntalo en una meta durante los próximos meses.');
    if (resp.parecido === 'si') { razones.push('Ya tenés algo que cumple la misma función.'); no.push('Usá lo que tenés hasta que deje de servir; si igual lo querés, armá una meta.'); }
    if (impulso && plata !== 'holgado') no.push('Es una compra por impulso que no entra en lo de hoy: esperá 48 horas y, si lo seguís queriendo, volvé a consultarlo.');
    if (impulso && plata === 'holgado' && grande) no.push('Es grande y por impulso: esperá 48 horas aunque te alcance.');
    if (plata === 'ajustado' && sePasa) { razones.push(`Venís gastando más rápido que tu ritmo: ya vas ${money(b.adelanto)} adelantado.`); no.push('Este mes no: compralo el mes que viene, cuando arranques al día.'); }
    if (fondoMeses < 1 && (plata !== 'holgado' || grande)) { razones.push(`No tenés un fondo para imprevistos: lo ahorrado (${money(n.ahorrado)}) no cubre ni un mes de gastos fijos (${money(n.fijos)}).`); no.push('Primero juntá al menos un mes de gastos fijos; después, el gusto.'); }
    if (pctSueldo >= 0.1 && !(resp.pensado === 'si' && fondoMeses >= 3)) no.push(`Es más del 10% de tus ingresos del mes: para un gusto así, pensalo al menos 2 días y tené 3 meses de gastos fijos ahorrados (tenés ${fondoMeses >= 99 ? 'sin datos' : `${fondoMeses.toFixed(1).replace('.', ',')}`}).`);
    if (atrasaMeta > 15) { razones.push(`Atrasa "${esc(g.name)}" unos ${atrasaMeta} días.`); no.push('Tu meta va primero: si lo querés, sumalo como meta aparte.'); }
    if (resp.pago === 'cuotas' && cuotasPct > 0.25) { razones.push(`Con esta compra, tus cuotas se llevarían el ${Math.round(cuotasPct * 100)}% de tus ingresos por mes.`); no.push('No sumes más cuotas para gustos hasta bajar de 25% del sueldo.'); }
    if (comeAhorro) { razones.push(`Se come lo que te iba a sobrar este mes (${money(b.sobrante)}).`); ojo.push('Ahorrás menos este mes.'); }
    if (resp.compare === 'no' && grande) ojo.push('Antes de pagar, compará el precio en 2 o 3 lugares.');
    if (impulso && plata === 'holgado' && !grande) ojo.push('Es por impulso: si mañana lo seguís queriendo, es buena señal.');
    if (fondoMeses >= 1 && fondoMeses < 3 && plata !== 'holgado') ojo.push('Tu fondo para imprevistos todavía no llega a 3 meses de gastos fijos.');
  } else {
    if (plata === 'ahorros') { ojo.push('Usá ahorros y reponelos en los próximos meses.'); if (fondoMeses < 3) razones.push('Después de la compra tu fondo de emergencia quedaría por debajo de 3 meses de gastos fijos.'); }
    if (plata === 'ajustado' && sePasa) ojo.push(`Venís ${money(b.adelanto)} arriba de tu ritmo: ajustá los próximos días.`);
    if (resp.compare === 'no' && grande) ojo.push('Como es grande, compará el precio en 2 o 3 lugares antes de pagar.');
    if (resp.pago === 'cuotas' && cuotasPct > 0.3) { razones.push(`Tus cuotas se llevarían el ${Math.round(cuotasPct * 100)}% de tus ingresos por mes.`); ojo.push('Si podés, elegí menos cuotas o una alternativa más barata.'); }
  }
  let nivel; let titulo;
  if (no.length) { nivel = 'bad'; titulo = plata === 'no-alcanza' ? (gusto ? 'No ahora' : 'No te alcanza') : impulso && gusto ? 'No: esperá y volvé a pensarlo' : 'No te lo compres ahora'; hacer.push(...no); }
  else if (ojo.length || plata === 'ajustado' || plata === 'ahorros') { nivel = 'warn'; titulo = gusto ? 'Podés, pero con cuidado' : plata === 'ahorros' ? 'Podés, usando ahorros' : 'Sí, pero ajustá los próximos días'; hacer.push(...ojo); }
  else { nivel = 'ok'; titulo = gusto ? 'Sí, te lo podés dar' : 'Adelante'; }
  if (gusto && impulso && !no.length) razones.push('Es una compra por impulso.');
  if (resp.compare === 'no' && !grande && nivel !== 'bad') hacer.push('Si podés, compará el precio antes de pagar.');
  if (resp.promo === 'nose') hacer.push(promosHoy ? `Revisá Beneficios: hoy tenés ${promosHoy} promo${promosHoy === 1 ? '' : 's'}.` : 'Revisá Beneficios por si hay alguna promo.');
  if (resp.pago === 'tarjeta' && nivel !== 'bad') {
    const card = (s.cards || [])[0];
    if (card) { const due = statementDates(card, statementOf(card, todayISO())).due; hacer.push(`Con ${esc(card.name)} en 1 pago lo pagás el <b>${due.getDate()}/${due.getMonth() + 1}</b>: tené la plata ese día.`); }
    else hacer.push('En 1 pago con tarjeta lo pagás con el resumen: tené la plata para el vencimiento.');
  }
  if (resp.pago === 'cuotas' && nivel !== 'bad') hacer.push('Fijate si te conviene en cuotas o de contado con la herramienta de abajo.');
  if (!hacer.length && nivel === 'ok') hacer.push('Anotalo cuando lo compres así tu "Hoy podés gastar" queda al día.');
  setModalBody('#buy-result', `<div class="result ${nivel} guia-fin">${progreso}
      <span class="small" style="font-weight:700;opacity:.8">Conclusión para ${money(amount)}</span>
      <strong style="font-size:20px">${titulo}</strong>
      ${razones.map((x) => `<span class="text">• ${x}</span>`).join('')}
      ${hacer.length ? `<span class="small" style="font-weight:800;margin-top:4px">Qué hacer</span>${hacer.map((x) => `<span class="text">→ ${x}</span>`).join('')}` : ''}
    </div>
    <details class="card guia-num"><summary><strong>Ver los números</strong></summary>
      ${n.lineas.map(([ic, k, v]) => `<div class="buy-linea">${icon(ic, 16)}<span><b class="k">${k}</b><br>${v}</span></div>`).join('')}</details>
    <div class="btn-row"><button class="btn small" data-action="buyAtras">‹ Cambiar respuestas</button>${resp.pago === 'cuotas' ? '<button class="btn small green" data-action="openInstallments" data-push="1">Cuotas o contado</button>' : ''}<a class="btn small" href="#/beneficios">Ver promos</a></div>`);
}

export const commonActions = {
  ...selectorActions,
  closeModal: () => closeModal(),
  goTo(ctx, el) { closeModal(); ctx.go(el.dataset.route); },
  modalBack: () => modalBack(),

  // ---------- carga rápida ----------
  setKind(ctx, el) {
    const form = el.closest('form');
    const kind = el.dataset.kind;
    form.querySelectorAll('[data-action=setKind]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
    form.querySelector('input[name=kind]').value = kind;
    const input = form.querySelector('input[name=q]');
    input.placeholder = input.dataset[kind === 'income' ? 'phIncome' : 'phExpense'];
    form.classList.toggle('income', kind === 'income');
    const lbl = form.querySelector('[data-medio-label]'); if (lbl) lbl.textContent = kind === 'income' ? 'Entra en' : 'Pagás con';
    promoEnVivo(ctx, form);
    const medio = form.querySelector('[name=medio]');
    if (kind === 'income' && medio && medio.value.startsWith('card:')) { const b = form.querySelector('[data-action=pickMedio][data-v=""]'); if (b) b.click(); }
    input.focus();
  },
  quickAdd(ctx, data) {
    const { texto, tags } = extraerEtiquetas(data.q);
    const p = parseEntry(texto, ctx.state.learned);
    if (!p.amount) { toast('No encontré el monto. Ejemplo: "Supermercado 48.000"'); return; }
    const kind = data.kind === 'income' ? 'income' : 'expense';
    const [medioTipo, medioId] = String(data.medio || '').split(':');
    const cardId = kind === 'expense' ? (medioTipo === 'card' ? medioId : medioTipo === 'acc' ? undefined : detectCard(ctx.state, texto)) : undefined;
    const accountId = cardId ? undefined : (medioTipo === 'acc' ? medioId : cuentaPrincipal(ctx.state));
    const chosenCat = data.category && data.category !== 'auto' && data.category !== '__new' ? data.category : null;
    const category = chosenCat || p.category;
    // gastos en otra moneda: "Netflix US$ 10", "hotel 200 reales", "50 usd"
    const t = normalize(texto);
    const B = monedaBase(ctx.state);
    const currency = /\b(us\$|u\$s|usd|dolar(es)?)\b|us\$|u\$s/.test(t) ? 'USD' : /\b(euros?|eur)\b|€/.test(t) ? 'EUR' : /\b(reales?|brl)\b|r\$/.test(t) ? 'BRL' : /\b(pesos|ars)\b/.test(t) ? 'ARS' : B;
    const rate = currency === B ? 1 : aBase(ctx.state, currency);
    if (currency !== B && !rate) { toast('No tengo la cotización ahora: cargalo desde "Añadir detalles"'); return; }
    const amount = Math.round(p.amount * rate * 100) / 100;
    const moneda = { ...(currency === B ? {} : { currency, original: p.amount, rate }), ...(ctx.state.espacio ? { por: ctx.miNombre || '', porUid: ctx.uid } : {}) };
    const note = p.note.replace(/\b(us\$|u\$s|usd|dolares|dolar|euros?|reales?|pesos)\b/gi, '').replace(/\s+/g, ' ').trim() || p.note;
    // la fecha elegida en el selector manda; si quedó en hoy, vale la del texto ("ayer", "15/10")
    const date = data.date && data.date !== todayISO() ? data.date : p.date;
    const antes = kind === 'expense' ? avancePresupuesto(ctx.state, category) : null;
    let reint = null; let nuevoId = '';
    ctx.commit((s) => {
      if (kind === 'income') s.incomes.push({ id: uid(), date, amount, type: /sueldo/i.test(texto) ? 'sueldo' : 'extra', note: note === 'Gasto' ? 'Ingreso' : note, ...(accountId ? { accountId } : {}), ...(tags.length ? { tags } : {}), ...(data.proyecto ? { proyectoId: data.proyecto } : {}), ...moneda });
      else {
        s.expenses.push({ id: uid(), date, amount, category, note, installments: cardId ? p.installments : 1, ...(cardId ? { cardId } : { accountId }), ...(tags.length ? { tags } : {}), ...(data.proyecto ? { proyectoId: data.proyecto } : {}), ...moneda });
        {
          const ex = s.expenses[s.expenses.length - 1]; nuevoId = ex.id;
        }
        if (chosenCat && chosenCat !== p.category) { const key = merchantKey(note); if (key) s.learned[key] = chosenCat; }
        // recuerdo con qué pagaste en ese comercio, para proponértelo la próxima vez
        const kMedio = merchantKey(note);
        if (kMedio && data.medio !== undefined) { s.medioAprendido = s.medioAprendido || {}; s.medioAprendido[kMedio] = String(data.medio || ''); }
      }
    });
    const when = date !== todayISO() ? ` (${relDay(date).toLowerCase()})` : '';
    const enMoneda = currency !== B ? ` (${currency} ${String(p.amount).replace('.', ',')})` : '';
    let msg = kind === 'income'
      ? `Ingreso anotado: ${money(amount)}${enMoneda}${when}`
      : `Anotado en ${catLabel(category)}: ${money(amount)}${enMoneda}${p.installments > 1 && cardId ? ` en ${p.installments} cuotas` : ''}${cardId ? ' con tarjeta' : ''}${when}${(() => { const c = cardId && ctx.state.cards.find((x) => x.id === cardId); const r = c && resumenDeCompra(c, date); return r && r.otro ? `. Va en el resumen de ${r.nombre}: el de ${r.mes} cerró el ${r.cerro}` : ''; })()}`;
    // aviso de presupuesto al cruzar el 80% o el 100%
    if (antes) {
      const ahora = avancePresupuesto(ctx.state, category);
      if (ahora && ahora.pct >= 1 && antes.pct < 1) msg += `. Ojo: te pasaste del presupuesto de ${catLabel(category)}`;
      else if (ahora && ahora.pct >= 0.8 && antes.pct < 0.8) msg += `. Llevás el ${Math.round(ahora.pct * 100)}% del presupuesto de ${catLabel(category)}`;
    }
    const fondo = kind === 'expense' && (ctx.state.goals || []).find((g) => g.tipo === 'fondo' && g.categoria && g.categoria === category);
    if (fondo) {
      toast(msg, { label: `Pagarlo con el fondo ${fondo.name}`, fn: () => { ctx.commit((s) => { const ex = s.expenses.find((x) => x.id === nuevoId); const gf = s.goals.find((g) => g.id === fondo.id); if (ex && gf && !ex.fondoId) { ex.fondoId = gf.id; ex.fromSavings = true; gf.saved = Math.round((gf.saved - ex.amount) * 100) / 100; } }); toast(`Listo: salió del fondo ${fondo.name}`); } });
      return;
    }
    if (reint) {
      msg += `. Te devuelven ${reint.aprox ? 'hasta ' : ''}${money(reint.monto)} (${reint.nombre} ${reint.pct}%${reint.aprox ? ', tope sin confirmar' : ''}) el ${reint.fecha.slice(8)}/${reint.fecha.slice(5, 7)}`;
      toast(msg);
      return;
    }
    toast(msg);
  },
  async alternarMontos(ctx, el) {
    const c = el.dataset.clave;
    // mostrar montos protegidos pide el PIN (ocultarlos no)
    if (montoProtegido(c) && montosOcultos(c) && bloqueoActivo()) {
      if (!(await pedirPin('Ingresá tu PIN para ver los montos'))) return;
    }
    const o = alternarMontos(c); ctx.render(); toast(o ? 'Montos ocultos' : 'Montos visibles');
  },
  quickFecha(ctx, el) {
    const t = el.closest('form').querySelector('[data-fecha-txt]');
    if (!t) return;
    const d = parseISO(el.value || todayISO()); const r = relDay(el.value || todayISO());
    t.textContent = r === 'Hoy' || r === 'Ayer' ? r : `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  },
  // "Otro…": todos los medios agrupados en una hoja
  medioOtro(ctx, el) {
    formMedio = el.closest('form');
    const actual = formMedio.querySelector('[name=medio]').value;
    const kind = formMedio.querySelector('[name=kind]').value;
    const lista = mediosRapidos(ctx.state).filter((m) => kind !== 'income' || !m.tarjeta);
    const grupos = [...new Set(lista.map((m) => m.grupo))];
    openModal(kind === 'income' ? '¿Dónde entra la plata?' : '¿Con qué pagás?', `${lista.length >= 5 ? `<div class="field lista-buscar"><input type="search" placeholder="Buscar banco, billetera o tarjeta" aria-label="Buscar medio de pago" data-input="medioBuscar" autocomplete="off"></div>` : ''}
      ${grupos.map((g) => `<div class="medio-grupo"><span class="small" style="font-weight:700">${g}</span>
      <div class="medio-hoja">${lista.filter((m) => m.grupo === g).map((m) => `<button type="button" class="medio-op${m.v === actual ? ' on' : ''}" data-action="medioElegido" data-v="${esc(m.v)}">
        <span class="cat-icon">${icon(m.tarjeta ? 'card' : 'wallet', 18)}</span><span class="grow"><span class="name">${m.falta ? '+ ' : ''}${esc(m.label)}</span>${m.principal ? '<span class="meta">Tu cuenta principal · <span class="link-chico" role="link" data-action="openWallets" data-push="1">cambiar</span></span>' : m.falta ? '<span class="meta">Cargala para anotar con ella</span>' : m.usos ? `<span class="meta">${m.usos} ${m.usos === 1 ? 'vez' : 'veces'} en los últimos 2 meses</span>` : ''}</span>
        ${m.v === actual ? icon('check', 18, 2.6) : ''}</button>`).join('')}</div></div>`).join('')}
      <p class="empty" data-medio-nada hidden>No encontré ese medio. Agregalo con el botón de abajo.</p>
      <button class="btn ghost block" data-action="openWallets">Agregar un banco, billetera o tarjeta</button>`);
  },
  medioBuscar(ctx, el) {
    const q = normalize(el.value.trim());
    const m = document.getElementById('modal'); let alguno = false;
    m.querySelectorAll('.medio-grupo').forEach((g) => {
      let vis = 0;
      g.querySelectorAll('.medio-op').forEach((b) => { const ok = !q || normalize(b.textContent).includes(q); b.hidden = !ok; if (ok) vis++; });
      g.hidden = !vis; if (vis) alguno = true;
    });
    m.querySelector('[data-medio-nada]').hidden = alguno;
  },
  medioElegido(ctx, el) {
    const v = el.dataset.v;
    if (v.startsWith('falta:')) { closeModal(); const b = formMedio && formMedio.querySelector(`[data-action=pickMedio][data-v="${CSS.escape(v)}"]`); commonActions.pickMedio(ctx, b || el); return; }
    closeModal();
    if (formMedio && document.body.contains(formMedio)) elegirMedio(ctx, formMedio, v, true);
  },
  // mientras escribís: la categoría que detecto y el medio que usaste la última vez en ese comercio
  quickTexto(ctx, el) {
    const form = el.closest('form'); if (!form) return;
    setTimeout(() => promoEnVivo(ctx, form), 0);
    const texto = extraerEtiquetas(el.value).texto;
    const auto = form.querySelector('[data-action=pickCat][data-id=auto] span:last-child');
    if (auto) {
      const p = texto.trim() ? parseEntry(texto, ctx.state.learned) : null;
      auto.textContent = p && p.category !== 'otros' && form.querySelector('[name=kind]').value !== 'income' ? `Auto: ${(allCategories().find((c) => c.id === p.category) || {}).short || catLabel(p.category)}` : 'Automática';
    }
    if (form.dataset.medioManual) return;
    const key = merchantKey(parseEntry(texto, ctx.state.learned).note || '');
    const m = key && (ctx.state.medioAprendido || {})[key];
    if (m !== undefined && m !== null && form.querySelector('[name=medio]') && mediosRapidos(ctx.state).some((x) => x.v === m)) elegirMedio(ctx, form, m, false, true);
  },
  pickMedio(ctx, el) {
    const form = el.closest('form');
    if (el.dataset.v.startsWith('falta:')) {
      openModal(`Tarjeta ${el.textContent.replace(/^\+ /, "")}`, `<p class="text" style="margin:0">Para anotar gastos con esta tarjeta, cargala una vez en <b>Tarjetas</b> con su día de cierre y vencimiento. Así te digo cuánto vas a pagar en cada resumen y las cuotas que te quedan.</p>
        <button class="btn primary block" data-action="newCard">Cargar la tarjeta</button>`);
      return;
    }
    elegirMedio(ctx, form, el.dataset.v, true);
  },
  // del formulario rápido al completo, con lo que ya escribiste
  cargaDetallada(ctx, el) {
    const form = el.closest('form');
    const kind = form.querySelector('[name=kind]').value === 'income' ? 'income' : 'expense';
    const texto = form.querySelector('[name=q]').value;
    const p = texto ? parseEntry(extraerEtiquetas(texto).texto, ctx.state.learned) : {};
    const [tipo, id] = String(form.querySelector('[name=medio]')?.value || '').split(':');
    const cat = form.querySelector('[name=category]').value;
    const e = { note: p.note || '', amount: p.amount || 0, date: form.querySelector('[name=date]')?.value || todayISO(),
      category: cat && cat !== 'auto' ? cat : p.category, ...(tipo === 'card' ? { cardId: id } : tipo === 'acc' ? { accountId: id } : {}), ...(form.querySelector('[name=proyecto]')?.value ? { proyectoId: form.querySelector('[name=proyecto]').value } : {}) };
    openModal(kind === 'income' ? 'Nuevo ingreso' : 'Nuevo gasto', entryForm(ctx.state, e, kind));
  },
  catLupa(ctx, el) {
    const form = el.closest('form'); const inp = form.querySelector('.cat-buscar');
    inp.hidden = !inp.hidden;
    if (inp.hidden) { inp.value = ''; actions_catFiltrar(form, ''); } else inp.focus();
  },
  catFiltrar(ctx, el) { actions_catFiltrar(el.closest('form'), el.value); },
  pickCat(ctx, el) {
    const form = el.closest('form');
    form.querySelector('[name=category]').value = el.dataset.id;
    form.querySelectorAll('[data-action=pickCat]').forEach((b) => b.setAttribute('aria-checked', String(b === el)));
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  },
  openCatManager(ctx) { openModal('Categorías', `<div id="cats-body">${categoriesBody(ctx.state)}</div>`); },
  catOrden(ctx, el) {
    ctx.update((s) => {
      s.catPrefs = { ...(s.catPrefs || {}), orden: el.dataset.v };
      if (el.dataset.v === 'personalizado' && !(s.catPrefs.lista || []).length) s.catPrefs.lista = categoriasOrdenadas({ ...s, catPrefs: { orden: 'frecuentes' } }, { conOcultas: true }).map((c) => c.id);
    });
    setModalBody('#cats-body', categoriesBody(ctx.state)); ctx.render();
  },
  catMover(ctx, el) {
    ctx.update((s) => {
      const ids = categoriasOrdenadas(s, { conOcultas: true }).map((c) => c.id);
      const i = ids.indexOf(el.dataset.id); const j = i + Number(el.dataset.dir);
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      s.catPrefs = { ...(s.catPrefs || {}), orden: 'personalizado', lista: ids };
    });
    setModalBody('#cats-body', categoriesBody(ctx.state)); ctx.render();
  },
  catOrdenar(ctx, el) {
    const ids = el.dataset.ids.split(',');
    ctx.update((s) => { s.catPrefs = { ...(s.catPrefs || {}), orden: 'personalizado', lista: ids }; });
    setModalBody('#cats-body', categoriesBody(ctx.state)); ctx.render();
  },
  catOcultar(ctx, el) {
    if (el.dataset.id === 'otros') return;
    ctx.update((s) => {
      const set = new Set((s.catPrefs && s.catPrefs.ocultas) || []);
      if (set.has(el.dataset.id)) set.delete(el.dataset.id); else set.add(el.dataset.id);
      s.catPrefs = { ...(s.catPrefs || {}), ocultas: [...set] };
    });
    setModalBody('#cats-body', categoriesBody(ctx.state)); ctx.render();
  },

  catEditar(ctx, el) { const c = allCategories().find((x) => x.id === el.dataset.id); if (c) openModal(`Editar "${c.label}"`, catEditForm(c), { push: true }); },
  guardarCatEdit(ctx, d) {
    const label = String(d.label || '').trim().slice(0, 30); if (!label) return;
    const id = d.id;
    if (allCategories().some((c) => c.id !== id && normalize(c.label) === normalize(label))) { toast('Ya hay una categoría con ese nombre'); return; }
    const emoji = soloEmoji(d.emoji);
    if (String(d.emoji || '').trim() && !emoji) toast('Ese campo es solo para un emoji: lo dejé sin emoji');
    const nombre = label.charAt(0).toUpperCase() + label.slice(1);
    ctx.commit((s) => {
      const cc = (s.customCategories || []).find((c) => c.id === id);
      if (cc) { cc.label = nombre; if (emoji) cc.emoji = emoji; else delete cc.emoji; }
      else s.catPrefs = { ...(s.catPrefs || {}), nombres: { ...((s.catPrefs || {}).nombres || {}), [id]: { label: nombre, ...(emoji ? { emoji } : {}) } } };
      setCustomCategories(s.customCategories, (s.catPrefs || {}).eliminadas || [], (s.catPrefs || {}).nombres || {});
    });
    modalBack(); setModalBody('#cats-body', categoriesBody(ctx.state)); toast('Categoría guardada');
  },
  catNombreOriginal(ctx, el) {
    ctx.commit((s) => { const n = { ...((s.catPrefs || {}).nombres || {}) }; delete n[el.dataset.id]; s.catPrefs = { ...(s.catPrefs || {}), nombres: n }; setCustomCategories(s.customCategories, s.catPrefs.eliminadas || [], n); });
    modalBack(); setModalBody('#cats-body', categoriesBody(ctx.state)); toast('Volvió al nombre original');
  },

  // ---------- categorías propias ----------
  openCategories(ctx) { openModal('Categorías', `<div id="cats-body">${categoriesBody(ctx.state)}</div>`); },

  saveCategory(ctx, d) {
    const label = String(d.label || '').trim().slice(0, 30);
    if (!label) return;
    if (allCategories().some((c) => normalize(c.label) === normalize(label))) { toast('Esa categoría ya existe'); return; }
    const emoji = soloEmoji(d.emoji);
    if (String(d.emoji || '').trim() && !emoji) toast('Ese campo es solo para un emoji: lo dejé sin emoji');
    ctx.commit((s) => { s.customCategories.push({ id: 'c_' + uid(), label: label.charAt(0).toUpperCase() + label.slice(1), ...(emoji ? { emoji } : {}) }); setCustomCategories(s.customCategories); });
    setModalBody('#cats-body', categoriesBody(ctx.state));
    toast(`Categoría "${label}" creada`);
  },
  // eliminar cualquier categoría (menos "Otros"): primero elegís a dónde pasan sus gastos
  deleteCategory(ctx, el) {
    const id = el.dataset.id; const s = ctx.state;
    const n = s.expenses.filter((e) => e.category === id).length;
    const destinos = allCategories().filter((c) => c.id !== id);
    openModal(`Eliminar "${catLabel(id)}"`, `<form class="form" data-submit="catEliminar">
      <input type="hidden" name="id" value="${esc(id)}">
      ${n ? `<div class="field"><label for="ce-d">Sus ${n} gasto${n === 1 ? '' : 's'} pasan a</label><select id="ce-d" name="destino">${destinos.map((c) => `<option value="${esc(c.id)}" ${c.id === 'otros' ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>`
        : '<p class="text muted" style="margin:0">No tiene gastos anotados.</p>'}
      <p class="small muted" style="margin:0">${allCategories().find((c) => c.id === id && c.custom) ? 'Se borra para siempre.' : 'Deja de aparecer y de detectarse sola. La podés restaurar desde esta misma pantalla.'}</p>
      <button class="btn primary block" type="submit">Eliminar</button>
      <button class="btn ghost block" type="button" data-action="modalBack">Cancelar</button>
    </form>`, { push: true });
  },
  catEliminar(ctx, d) {
    const id = d.id; const destino = d.destino || 'otros';
    const custom = (ctx.state.customCategories || []).some((c) => c.id === id);
    ctx.commit((s) => {
      s.expenses.forEach((e) => { if (e.category === id) e.category = destino; });
      (s.fixed || []).forEach((f) => { if (f.category === id) f.category = destino; });
      for (const k of Object.keys(s.learned || {})) if (s.learned[k] === id) s.learned[k] = destino;
      s.catPrefs = { ...(s.catPrefs || {}) };
      if (custom) s.customCategories = s.customCategories.filter((c) => c.id !== id);
      else s.catPrefs.eliminadas = [...new Set([...(s.catPrefs.eliminadas || []), id])];
      s.catPrefs.ocultas = (s.catPrefs.ocultas || []).filter((x) => x !== id);
      setCustomCategories(s.customCategories, s.catPrefs.eliminadas || []);
    });
    modalBack();
    setModalBody('#cats-body', categoriesBody(ctx.state));
    toast(`Categoría eliminada (sus gastos pasaron a "${catLabel(destino)}")`);
  },
  catRestaurar(ctx) {
    ctx.commit((s) => { s.catPrefs = { ...(s.catPrefs || {}), eliminadas: [] }; setCustomCategories(s.customCategories, []); });
    setModalBody('#cats-body', categoriesBody(ctx.state));
    toast('Categorías restauradas');
  },

  newEntry(ctx, el) {
    const kind = el.dataset.kind || 'expense';
    openModal(kind === 'income' ? 'Nuevo ingreso' : 'Nuevo gasto', entryForm(ctx.state, {}, kind));
  },
  openEntry(ctx, el) {
    const kind = el.dataset.kind || 'expense';
    const list = kind === 'income' ? ctx.state.incomes : ctx.state.expenses;
    const e = list.find((x) => x.id === el.dataset.id);
    if (!e) return;
    if (e.deEspacio) {
      const x = e.deEspacio;
      openModal(esc(e.note), `<div class="form"><div class="card lime"><span class="small">Tu parte (${String(x.pct).replace('.', ',')}%) de un gasto de "${esc(x.nombre)}"</span><strong style="font-size:24px">${money(e.amount)}</strong>
        <span class="small">Gasto total: ${money(x.total)}${x.por ? ` · lo cargó ${esc(x.por)}` : ''} · ${relDay(e.date)}</span></div>
        <p class="small muted" style="margin:0">Llega solo desde el espacio compartido, así no lo cargás dos veces. Cuenta en tus gastos y en "Hoy podés gastar", pero no toca el saldo de tus cuentas. Para cambiarlo o borrarlo, hacelo en "${esc(x.nombre)}".</p>
        <button class="btn block" data-action="cambiarModo" data-id="${esc(x.id)}">Ir a "${esc(x.nombre)}"</button></div>`);
      return;
    }
    openModal(kind === 'income' ? 'Editar ingreso' : (e.pending ? 'Revisar comprobante' : 'Editar gasto'), entryForm(ctx.state, e, kind), { push: !!el.dataset.push });
  },
  entryCurrency(ctx, el) {
    const f = el.closest('form');
    const box = f.querySelector('[data-cur-box]');
    const B = monedaBase(ctx.state);
    box.hidden = el.value === B;
    const r = aBase(ctx.state, el.value);
    if (el.value !== B && r) { const inp = f.querySelector('[name=rate]'); inp.value = ''; inp.placeholder = `Hoy: ${String(Math.round(r * 100) / 100).replace('.', ',')}`; }
  },
  entryToggle(ctx, el) {
    const box = el.closest('form').querySelector(`[data-box-id="${el.dataset.box}"]`);
    if (box) box.hidden = !el.checked;
    if (el.dataset.box === 'shared') { const l = el.closest('form').querySelector('label[for=f-amount]'); if (l) l.textContent = el.checked ? 'Total del gasto' : 'Monto'; }
  },
  entryParte(ctx, el) {
    const f = el.closest('form');
    const total = num(f.querySelector('[name=amount]').value);
    if (total) f.querySelector('[name=mine]').value = String(Math.round((total / Number(el.dataset.n)) * 100) / 100).replace('.', ',');
  },
  saveEntry(ctx, d) {
    const original = num(d.amount);
    if (!original) { toast('Ingresá un monto válido'); return; }
    const B = monedaBase(ctx.state);
    const currency = d.currency || B;
    const rate = currency === B ? 1 : (num(d.rate) || aBase(ctx.state, currency));
    if (!rate) { toast('Poné la cotización de esa moneda'); return; }
    const ars = (v) => Math.round(v * rate * 100) / 100;
    const tags = etiquetasDeTexto(d.tags);
    const [medioTipo, medioId] = String(d.medio || '').split(':');
    const moneda = currency === B ? {} : { currency, original, rate };
    let msg = 'Guardado';
    ctx.commit((s) => {
      s.deudas = s.deudas || [];
      if (d.kind === 'income') {
        // lo que no está en este formulario (mes trabajado, concepto del trabajo) se conserva
        const antes = s.incomes.find((x) => x.id === d.id) || {};
        const conservar = Object.fromEntries(['periodo', 'laboral', 'concepto'].filter((k) => antes[k] !== undefined).map((k) => [k, antes[k]]));
        if (d.type === 'sueldo') { delete conservar.laboral; delete conservar.concepto; }
        if (/^\d{4}-\d{2}$/.test(d.periodo || '')) conservar.periodo = d.periodo;
        const item = { ...conservar, id: d.id || uid(), date: d.date || todayISO(), amount: ars(original), type: d.type, note: d.note || (d.type === 'sueldo' ? notaCobro(s) : 'Ingreso'), ...moneda };
        if (medioTipo === 'acc') item.accountId = medioId;
        if (tags.length) item.tags = tags;
        if (d.proyectoId) item.proyectoId = d.proyectoId;
        const i = s.incomes.findIndex((x) => x.id === d.id);
        if (i >= 0) s.incomes[i] = item; else s.incomes.push(item);
        return;
      }
      const prev = s.expenses.find((x) => x.id === d.id);
      const id = d.id || uid();
      const total = ars(original);
      // compartido: el gasto es solo tu parte; lo demás queda como deuda
      let amount = total; let shared = null;
      if (d.compartido) {
        const mine = ars(num(d.mine));
        if (!mine || mine > total) { msg = ''; return; }
        amount = mine;
        shared = { total, paidByMe: d.payer !== 'otro', with: String(d.with || '').trim().slice(0, 40) || 'Otra persona' };
      }
      // dividido en categorías
      let splits = [];
      if (d.dividir) {
        splits = [0, 1, 2, 3].map((i) => ({ category: d['sc' + i], amount: ars(num(d['sa' + i])) })).filter((p) => p.amount > 0);
        const suma = splits.reduce((a, p) => a + p.amount, 0);
        if (splits.length > 1 && Math.abs(suma - total) > 1) { msg = `Las partes suman ${money(suma)} y el total es ${money(total)}`; return; }
        // si es compartido, cada parte se achica en proporción a lo que te toca
        if (shared) splits = splits.map((p) => ({ ...p, amount: Math.round((p.amount * amount / total) * 100) / 100 }));
      }
      const main = splits && splits.length ? splits.slice().sort((a, b) => b.amount - a.amount)[0].category : d.category;
      const item = { id, date: d.date || todayISO(), amount, category: main, note: d.note || catLabel(main), installments: Math.max(1, parseInt(d.installments, 10) || 1), ...moneda };
      { const pr = s.expenses.find((x) => x.id === id); if (pr && pr.por) { item.por = pr.por; if (pr.porUid) item.porUid = pr.porUid; } else if (!pr && s.espacio) { item.por = ctx.miNombre || ''; item.porUid = ctx.uid; } }
      if (medioTipo === 'card') item.cardId = medioId; else if (medioTipo === 'acc') item.accountId = medioId;
      if (!item.cardId) item.installments = 1;
      if (splits && splits.length > 1) item.splits = splits;
      if (d.proyectoId) item.proyectoId = d.proyectoId;
      // de dónde salió: devuelvo lo de antes y saco lo nuevo (fondo o ahorro)
      devolverOrigen(s, prev);
      const [tOrig, idOrig] = String(d.origen ?? (prev && prev.fondoId ? `fondo:${prev.fondoId}` : prev && prev.holdingId ? `ahorro:${prev.holdingId}` : '')).split(':');
      if (tOrig === 'fondo') { const gf = (s.goals || []).find((g) => g.id === idOrig); if (gf) { gf.saved = Math.round((gf.saved - amount) * 100) / 100; item.fondoId = gf.id; item.fromSavings = true; } }
      else if (tOrig === 'ahorro') { const h = (s.holdings || []).find((x) => x.id === idOrig); if (h) { sacarDeAhorro(s, h, amount); item.holdingId = h.id; item.fromSavings = true; delete item.accountId; } } // sale del ahorro, no de una cuenta
      else if (prev && prev.fromSavings && !prev.fondoId && !prev.holdingId && d.origen === undefined) item.fromSavings = true;
      if (tags.length) item.tags = tags;
      if (shared) item.shared = shared;
      if (prev && prev.category !== item.category && !item.splits) {
        const key = merchantKey(item.note);
        if (key) s.learned[key] = item.category;
      }
      // deuda vinculada al gasto compartido
      const prevDeuda = s.deudas.find((x) => x.origen === id);
      if (shared) {
        const tipo = shared.paidByMe ? 'meDeben' : 'debo';
        const monto = shared.paidByMe ? Math.round((total - amount) * 100) / 100 : amount;
        const datos = { tipo, persona: shared.with, monto, date: item.date, nota: item.note, origen: id };
        if (prevDeuda) Object.assign(prevDeuda, datos); else if (monto > 0) s.deudas.push({ id: uid(), pagos: [], ...datos });
        msg = shared.paidByMe ? `Guardado: ${shared.with} te debe ${money(monto)}` : `Guardado: le debés ${money(monto)} a ${shared.with}`;
      } else if (prevDeuda && !(prevDeuda.pagos || []).length) s.deudas = s.deudas.filter((x) => x !== prevDeuda);
      // reintegro: se carga cuando llega (Reintegros). Acá solo se corrige o se saca.
      const prevR = prev && prev.reintegro;
      if (prevR) {
        if (d.reintEdit) { const rm = num(d.reintMonto); if (rm > 0) item.reintegro = { ...prevR, monto: rm, fecha: d.reintFecha || prevR.fecha }; else item.sinReintegro = true; }
        else item.reintegro = prevR;
      }
      const i = s.expenses.findIndex((x) => x.id === d.id);
      if (i >= 0) s.expenses[i] = item; else s.expenses.push(item);
    });
    if (!msg) { toast('Revisá "Mi parte": tiene que ser menor o igual al total'); return; }
    if (msg.startsWith('Las partes')) { toast(msg); return; }
    closeModal();
    toast(msg);
  },
  deleteEntry(ctx, el) {
    const key = el.dataset.kind === 'income' ? 'incomes' : 'expenses';
    const it = ctx.state[key].find((x) => x.id === el.dataset.id);
    closeModal();
    borrarConDeshacer(ctx, `Borraste ${it ? `"${it.note}"` : 'el movimiento'}`, (s) => {
      const x0 = s[key].find((x) => x.id === el.dataset.id);
      devolverOrigen(s, x0);
      s[key] = s[key].filter((x) => x.id !== el.dataset.id);
      s.deudas = (s.deudas || []).filter((x) => x.origen !== el.dataset.id || (x.pagos || []).length);
    });
  },

  // ---------- ¿Me lo compro? ----------
  openBuy() {
    guiaCompra = null;
    openModal('¿Me lo compro?', `<form class="form" data-submit="buyCheck">
      <div class="field"><label for="b-amount">¿Cuánto cuesta?</label><input id="b-amount" name="amount" inputmode="decimal" placeholder="Ej: 90.000" required></div>
      <button class="btn primary block" type="submit">Empezar</button>
      <span class="hint">Te hago unas preguntas cortas y te doy una conclusión, con los números de tu plata.</span>
    </form><div id="buy-result"></div>`, { alto: true });
  },
  buyCheck(ctx, d) {
    const amount = num(d.amount);
    if (!amount) return;
    guiaCompra = { amount, resp: {} };
    pintarGuiaCompra(ctx.state);
  },
  buyResp(ctx, el) {
    if (!guiaCompra) return;
    guiaCompra.resp[el.dataset.k] = el.dataset.v;
    pintarGuiaCompra(ctx.state);
  },
  buyAtras(ctx) {
    if (!guiaCompra) return;
    const ks = Object.keys(guiaCompra.resp); delete guiaCompra.resp[ks[ks.length - 1]];
    pintarGuiaCompra(ctx.state);
  },

  // ---------- comprobantes ----------
  openPaste() {
    openModal('Cargar comprobante', `<div class="chips" style="margin-bottom:12px"><button class="chip" data-action="openTicket" data-push="1">${icon('camera', 16)} Foto del ticket</button></div>
      <p class="text muted">Desde Mercado Pago o la app de tu banco tocá <b>Compartir</b> y elegí Pesitos (con la app instalada). También podés copiar el texto del comprobante y pegarlo acá.</p>
      <form class="form" data-submit="pasteSubmit">
        <div class="field"><label for="p-text">Texto del comprobante</label><textarea id="p-text" name="text" placeholder="Pagaste $ 12.500,00 a FARMACITY" required></textarea></div>
        <button class="btn primary block" type="submit">Leer comprobante</button>
      </form>`);
  },
  pasteSubmit(ctx, d) {
    const ok = addPendingFromText(ctx, d.text);
    if (ok === 'bill') { closeModal(); toast('Tiene vencimiento: lo agendé en Por pagar y te aviso antes'); }
    else if (ok) { closeModal(); toast('Quedó para confirmar en Movimientos'); }
    else toast('No encontré un monto en ese texto');
  },
  openPending(ctx) { openModal('Comprobantes para confirmar', `<div id="pending-body">${pendingList(ctx.state)}</div>`); },
  confirmPending(ctx, el) {
    ctx.commit((s) => { const e = s.expenses.find((x) => x.id === el.dataset.id); if (e) delete e.pending; });
    setModalBody('#pending-body', pendingList(ctx.state));
    toast('Confirmado');
  },

  // ---------- cierre semanal ----------
  openClose(ctx, el) {
    const exp = expectedBalance(ctx.state);
    openModal('Ajustar con mi saldo', `<p class="text">${ctx.state.lastClose
      ? `¿Cuánto tenés en total hoy entre cuentas, billeteras y efectivo? No incluyas ahorros ni inversiones. Según lo anotado deberías tener cerca de <b>${money(exp)}</b>. La diferencia la sumo como "gastos varios".`
      : 'Indicá cuánto tenés hoy entre cuentas, billeteras y efectivo (sin ahorros ni inversiones). Lo tomo como punto de partida: la próxima vez que ajustes, completo solo lo que no anotaste.'}</p>
      <form class="form" data-submit="closeSubmit">
        <div class="field"><label for="c-bal">Saldo total hoy</label><input id="c-bal" name="balance" inputmode="decimal" placeholder="Ej: 250.000" required></div>
        <button class="btn primary block" type="submit">Ajustar</button>
      </form>`, { push: !!(el && el.dataset && el.dataset.push) });
  },
  closeSubmit(ctx, d) {
    const bal = num(d.balance);
    const exp = expectedBalance(ctx.state);
    const today = todayISO();
    let msg = 'Listo. Desde hoy hago el cierre con este saldo.';
    ctx.commit((s) => {
      if (exp != null) {
        const diff = exp - bal;
        if (diff > 500) {
          s.expenses.push({ id: uid(), date: today, amount: Math.round(diff), category: 'otros', note: 'Gastos varios (cierre semanal)', installments: 1 });
          msg = `Sumé ${money(diff)} como gastos varios. Panorama completo sin anotar cada café.`;
        } else if (diff < -500) msg = `Tenés ${money(-diff)} más de lo esperado. ¿Un ingreso sin anotar?`;
        else msg = 'Todo cuadra. ¡Bien ahí!';
      }
      s.lastClose = { date: today, balance: bal };
    });
    closeModal();
    toast(msg);
  },

  // ---------- págate primero ----------
  setAsideDone(ctx, el) {
    const amount = num(el.dataset.amount);
    ctx.commit((s) => {
      s.setAside[monthKey()] = true;
      const g = mainGoal(s);
      if (g) g.saved += amount;
      s.transfers.push({ id: uid(), date: todayISO(), amount, note: 'Págate primero' });
    });
    toast(`¡Bien! ${money(amount)} apartados para tus metas`);
  },
  setAsideLater(ctx) {
    ctx.commit((s) => { s.setAsideSnooze = todayISO(); });
    toast('Dale, te lo recuerdo mañana');
  },

  // ---------- medios de pago ----------
  setCuentaSueldo(ctx, el) { ctx.commit((s) => { s.cuentaSueldo = el.value; }); toast(`Listo: cobrás en ${nombreCuenta(ctx.state, el.value)}`); },
  setPrincipal(ctx, el) { ctx.commit((s) => { s.cuentaPrincipal = el.value; }); toast(`Listo: ${nombreCuenta(ctx.state, el.value)} es tu cuenta principal`); },
  openWallets(ctx, el) { openModal('Mis medios de pago', `<div id="wallets-body">${walletsBody(ctx.state)}</div>`, { push: !!(el && el.dataset && el.dataset.push) }); },
  toggleWallet(ctx, el) {
    ctx.commit((s) => {
      const set = new Set(s.wallets);
      if (set.has(el.dataset.id)) set.delete(el.dataset.id); else set.add(el.dataset.id);
      s.wallets = [...set];
    });
    setModalBody('#wallets-body', walletsBody(ctx.state));
  },
  addWallet(ctx, d) {
    const name = String(d.name || '').trim().slice(0, 40);
    if (!name) return;
    const id = 'x:' + normalize(name).replace(/[^a-z0-9]+/g, '-');
    ctx.commit((s) => {
      if (!s.customWallets.some((w) => w.id === id) && !WALLETS.some((w) => normalize(w.name) === normalize(name))) s.customWallets.push({ id, name, kind: d.kind });
      if (!s.wallets.includes(id)) s.wallets.push(id);
      setCustomWallets(s.customWallets);
    });
    setModalBody('#wallets-body', walletsBody(ctx.state));
    const key = (t) => normalize(t).replace(/\b(banco|tarjeta|de|del|la|el)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    const tiene = ((ctx.state.live && ctx.state.live.promos) || []).some((p) => p.walletName && key(p.walletName) === key(name));
    toast(tiene ? `${name} agregado: ya tengo sus promos` : `${name} agregado. Todavía no hay promos suyas en las fuentes: te las muestro cuando aparezcan`);
  },

  // ---------- resumen semanal automático ----------
  openWeek(ctx, el) {
    const w = weekSummary(ctx.state, el.dataset.week);
    openModal('Tu semana', weekDetail(w));
  },
  dismissWeek(ctx, el) { ctx.commit((s) => { s.weekSeen = el.dataset.week; }); },

  // ---------- sueldo del mes ----------
  confirmSalary(ctx, d) {
    const amount = parseAmount(d.amount);
    if (!amount) { toast('Ingresá el monto que cobraste'); return; }
    ctx.commit((s) => { s.incomes.push({ id: uid(), date: d.date || todayISO(), amount, type: 'sueldo', note: notaCobro(s), ...(s.cuentaSueldo ? { accountId: s.cuentaSueldo } : {}) }); });
    toast('Cobro anotado: ya lo comparo con los meses anteriores');
  },
  snoozeCard(ctx, el) {
    ctx.commit((s) => { s.snooze[el.dataset.key] = toISO(addDays(new Date(), Number(el.dataset.days || 1))); });
    toast('Dale, te lo recuerdo más adelante');
  },

  // ---------- sugerencias y aprendizaje ----------
  openSuggestions(ctx) {
    const list = suggestions(ctx.state);
    openModal('Sugerencias de Pesitos', `<p class="text muted">Están ordenadas por cuánto afectan tu plata por mes: arriba la que más.</p>${list.map(renderSuggestion).join('') || '<p class="empty">No hay sugerencias por ahora.</p>'}`);
  },
  openLesson(ctx, el) {
    const l = LESSONS.find((x) => x.id === el.dataset.id);
    if (!l) return;
    openModal(l.title, `<div class="lesson">${l.body.map((p) => `<p class="text">${esc(p)}</p>`).join('')}</div>${l.tool ? `<button class="btn green block" data-action="goTo" data-route="${l.tool.route}">${esc(l.tool.label)}</button>` : ''}`, { push: !!el.dataset.push });
    ctx.update((s) => { s.lessonsSeen[l.id] = todayISO(); });
  },

  // ---------- sugerencias de mejora ----------
  fixToVariable(ctx, el) {
    ctx.commit((s) => { s.fixed = s.fixed.filter((f) => f.id !== el.dataset.id); });
    toast('Listo: ahora lo anotás como gasto variable cuando ocurra');
  },
  deleteDuplicate(ctx, el) {
    borrarConDeshacer(ctx, 'Borrado: ya no se cuenta dos veces', (s) => { s.expenses = s.expenses.filter((e) => e.id !== el.dataset.id); });
  },
  makeFixed(ctx, el) {
    ctx.commit((s) => {
      s.fixed.push({ id: uid(), name: el.dataset.name, amount: num(el.dataset.amount), dueDay: parseInt(el.dataset.day, 10) || 10 });
      s.dismissed[el.dataset.sid] = true;
    });
    toast(`${el.dataset.name} ahora es un gasto fijo`);
  },
  dismissSuggestion(ctx, el) {
    ctx.commit((s) => { s.dismissed[el.dataset.sid] = true; });
    toast('Entendido, no te lo vuelvo a sugerir');
  },

  // ---------- opciones de ahorro ----------
  showOptions() {
    openModal('¿Dónde pongo mis ahorros?', `<p class="text" style="white-space:pre-line">${esc(OPTIONS_TEXT)}</p><p class="small muted">${DISCLAIMER}</p>`);
  },

  // ---------- copia de seguridad (el menú está en js/menu.js) ----------
  exportData(ctx) {
    const blob = new Blob([JSON.stringify(ctx.state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `pesitos-${todayISO()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  importData(ctx, el) {
    const file = el.files && el.files[0];
    if (!file) return;
    file.text().then((txt) => {
      try { ctx.replace({ ...migrate(JSON.parse(txt)), ready: true }); closeModal(); toast('Copia importada'); }
      catch { toast('Ese archivo no es una copia de Pesitos'); }
    });
  },
  loadDemo(ctx) { ctx.replace(demoState()); closeModal(); ctx.go('inicio'); toast('Datos de ejemplo cargados'); },
  resetAll(ctx, el) {
    if (el.dataset.confirm !== 'yes') { el.dataset.confirm = 'yes'; el.textContent = 'Tocá de nuevo para borrar todo'; return; }
    clear(); ctx.replace({ ...emptyState(), profile: { ...emptyState().profile, name: ctx.state.profile.name } }); closeModal();
  },
};

export function addPendingFromText(ctx, text) {
  const p = parseEntry(text, ctx.state.learned);
  if (!p.amount) return false;
  // boleta o factura con vencimiento ("vence el 15/11"): se agenda como pago
  const v = normalize(text).match(/venc\w*[^\d]{0,15}(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (v) {
    const now = new Date();
    let y = v[3] ? (v[3].length === 2 ? 2000 + Number(v[3]) : Number(v[3])) : now.getFullYear();
    let due = new Date(y, Number(v[2]) - 1, Number(v[1]));
    if (!v[3] && due < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60)) due = new Date(y + 1, Number(v[2]) - 1, Number(v[1]));
    const name = p.note.replace(/\bvenc\w*\b.*$/i, '').trim() || 'Pago';
    ctx.commit((s) => { s.bills = s.bills || []; s.bills.push({ id: uid(), name, amount: p.amount, date: toISO(due), repeat: 'once', category: p.category, payWith: '', autoDebit: false, saveAhead: false }); });
    return 'bill';
  }
  ctx.commit((s) => {
    if (p.kind === 'income') s.incomes.push({ id: uid(), date: p.date, amount: p.amount, type: p.incomeType, note: p.note });
    else s.expenses.push({ id: uid(), date: p.date, amount: p.amount, category: p.category, note: p.note, installments: p.installments, pending: true });
  });
  return true;
}
