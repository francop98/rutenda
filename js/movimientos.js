// Movimientos: ingresos y gastos separados, fijos que se cargan solos,
// sugerencias de mejora y acceso a tarjetas.

import { reintegrosDelMes } from './reintegros.js';
import { money, esc, monthKey, addMonthKey, monthDiff, monthName, relDay, num, MONTHS_LONG } from './formato.js';

const monthLabel = (mk) => { const [y, m] = mk.split('-').map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; };
import { catById, catLabel } from './categorias.js';
import { monthExpenses, monthIncome, fixedTotal, fixedActive, fixedProgress } from './calculos.js';
import { parseAmount } from './interprete.js';
import { suggestions, renderSuggestion } from './guia.js';
import { medioOptions } from './acciones.js';
import { icon, catIcon, screenHead, quickForm, openModal, closeModal, toast, borrarConDeshacer, abrirSelectorMes, botonMes } from './interfaz.js';
import { uid } from './almacenamiento.js';
import { lessonCard } from './aprender.js';
import { agenda } from './agenda.js';
import { payOptions, descuentoCampos, descuentoDe } from './pagos.js';
import { nombreCuenta, saldoDeuda } from './cuentas.js';
import { proyectoDe } from './proyectos.js';

let filter = 'todo';
let vista = 'lista'; // 'lista' | 'fijos'
/** Abrir Movimientos en una pestaña (la ruta #/deudas llega acá). */
export function renderVista(s, v) { vista = v === 'fijos' ? 'fijos' : 'lista'; return render(s); }
let offset = 0; // meses hacia atrás

const tagsHtml = (t) => ((t && t.length) ? `<span class="tags">${t.map((x) => `<span class="tag">#${esc(x)}</span>`).join('')}</span>` : '');
const enMoneda = (x) => (x.currency && x.currency !== 'ARS' ? ` · ${x.currency} ${String(x.original).replace('.', ',')}` : '');

export function expenseRow(s, e) {
  const c = catById(e.category);
  const green = ['super', 'salud', 'vivienda', 'servicios'].includes(c.id);
  const card = e.cardId ? s.cards.find((x) => x.id === e.cardId) : null;
  const medio = card ? esc(card.name) : (e.accountId ? esc(nombreCuenta(s, e.accountId)) : '');
  const cat = e.splits && e.splits.length > 1 ? `${e.splits.length} categorías` : c.label;
  return `<button class="row" data-action="openEntry" data-id="${e.id}" data-kind="expense">
    <span class="cat-icon ${green ? 'green' : ''}">${catIcon(c, 18)}</span>
    <span class="grow"><span class="name">${esc(e.note)}</span><span class="meta">${relDay(e.date)} · ${esc(cat)}${e.installments > 1 ? ` · ${e.installments} cuotas` : ''}${medio ? ` · ${medio}` : ''}${enMoneda(e)}${e.shared ? ` · tu parte (con ${esc(e.shared.with)})` : ''}${e.deEspacio ? ` · 👥 tu parte de ${esc(e.deEspacio.nombre)}` : e.por ? ` · cargó ${esc(e.por)}` : ''}${e.proyectoId && proyectoDe(s, e.proyectoId) ? ` · 📁 ${esc(proyectoDe(s, e.proyectoId).nombre)}` : ''}</span>${tagsHtml(e.tags)}</span>
    <span class="amount">−${money(e.amount)}</span>
  </button>`;
}
export function incomeRow(i, s = null) {
  return `<button class="row" data-action="openEntry" data-id="${i.id}" data-kind="income">
    <span class="cat-icon green">${icon('up', 18)}</span>
    <span class="grow"><span class="name">${esc(i.note)}</span><span class="meta">${relDay(i.date)} · ${i.type === 'sueldo' ? 'Cobro del mes' : 'Ingreso extra'}${s && i.accountId ? ` · ${esc(nombreCuenta(s, i.accountId))}` : ''}${enMoneda(i)}${s && i.proyectoId && proyectoDe(s, i.proyectoId) ? ` · 📁 ${esc(proyectoDe(s, i.proyectoId).nombre)}` : ''}</span>${tagsHtml(i.tags)}</span>
    <span class="amount pos">+${money(i.amount)}</span>
  </button>`;
}

export function render(s) {
  const mk = addMonthKey(monthKey(), -offset);
  const exp = monthExpenses(s, mk);
  const inc = monthIncome(s, mk);
  const fixed = fixedTotal(s, mk);
  const pending = s.expenses.filter((e) => e.pending).length;
  const today = new Date().getDate();
  const gastos = exp.total + fixed;

  const exps = s.expenses.filter((e) => !e.pending && e.date.slice(0, 7) === mk).map((e) => ({ ...e, _k: 'e' }));
  const incs = s.incomes.filter((i) => i.date.slice(0, 7) === mk).map((i) => ({ ...i, _k: 'i' }));
  const list = filter === 'gastos' ? exps : filter === 'ingresos' ? incs : [...exps, ...incs];
  list.sort((a, b) => b.date.localeCompare(a.date));
  // agrupados por día
  const dias = [];
  for (const x of list) { const d = dias[dias.length - 1]; if (d && d.date === x.date) d.items.push(x); else dias.push({ date: x.date, items: [x] }); }
  const nFijos = s.fixed.filter((f) => fixedActive(f, mk)).length;
  const reintMes = reintegrosDelMes(s, mk);
  const ahorroPesitos = ((s.savedByApp || {})[mk] || 0) + reintMes;

  return `<section class="screen">
    ${screenHead('Movimientos', `<span class="head-actions"><a class="icon-btn" href="#/buscar" aria-label="Buscar movimientos">${icon('search', 20)}</a><button class="icon-btn" data-action="openImportar" aria-label="Importar movimientos del banco o la tarjeta">${icon('upload', 20)}</button></span>`)}

    <div class="month-nav">
      <button class="icon-btn" data-action="monthPrev" aria-label="Mes anterior">${icon('back', 18, 2.2)}</button>
      ${botonMes(mk, 'movElegirMes')}
      <button class="icon-btn" data-action="monthNext" aria-label="Mes siguiente" ${offset === 0 ? 'disabled' : ''} style="transform:scaleX(-1)">${icon('back', 18, 2.2)}</button>
    </div>

    <a class="card mov-resumen" href="#/estadisticas">
      <span><span class="k">Entró</span><b class="pos">${money(inc)}</b></span>
      <span><span class="k">Salió</span><b>${money(gastos)}</b></span>
      <span><span class="k">Quedó</span><b class="${inc - gastos < 0 ? 'neg' : ''}">${money(inc - gastos)}</b></span>
      <span class="mov-ver">Ver estadísticas ${icon('chevron', 14)}</span>
    </a>
    ${ahorroPesitos || offset === 0 ? `<button class="card mov-ahorro" data-action="ahorroPesitosInfo"><span class="grow"><b class="t">Te ahorraste con Pesitos en ${monthLabel(mk).split(' ')[0]}</b><span class="small">${ahorroPesitos ? `${reintMes ? `Reintegros ${money(reintMes)} · ` : ''}promos y desafíos` : 'Todavía nada este mes. Tocá y mirá cómo se suma'}</span></span><b class="v">${money(ahorroPesitos)}</b></button>` : ''}

    ${`
      ${pending ? `<button class="card amber" data-action="openPending" style="border:none;text-align:left;flex-direction:row;align-items:center"><span style="color:var(--amber)">${icon('receipt')}</span><span class="text" style="flex:1"><b>${pending} comprobante${pending > 1 ? 's' : ''} para confirmar.</b> Ya los categoricé, solo revisalos.</span>${icon('chevron', 16)}</button>` : ''}
      <div class="chips">${[['todo', 'Todo'], ['gastos', 'Gastos'], ['ingresos', 'Ingresos']].map(([f, l]) => `<button class="chip toggle" data-action="setFilter" data-f="${f}" aria-pressed="${filter === f}">${l}</button>`).join('')}</div>
      ${dias.length ? dias.map((d) => `<div class="dia-grupo"><span class="dia-t">${esc(relDay(d.date))}</span><div class="card tight">${d.items.map((x) => (x._k === 'e' ? expenseRow(s, x) : incomeRow(x, s))).join('')}</div></div>`).join('')
        : `<div class="card"><p class="empty">${offset ? 'No hay movimientos en este mes.' : 'Todavía no anotaste nada este mes. Cargá tus gastos desde Inicio.'}</p></div>`}
`}
  </section>`;
}

/** Gastos fijos (se ven en Por pagar → Fijos). */
export function fijosHtml(s) {
  const mk = monthKey(); const offset = 0; const today = new Date().getDate();
  const fixed = fixedTotal(s, mk);
  return `      <p class="small muted" style="margin:0">Lo que pagás todos los meses. Se descuenta solo de lo que podés gastar${fixed ? `: ${money(fixed)} este mes` : ''}. Los vencimientos los ves en Agenda.</p>
      <div class="card tight">
      ${s.fixed.length ? s.fixed.filter((f) => fixedActive(f, mk) || (f.endMonth && f.endMonth >= addMonthKey(mk, -2))).map((f) => {
        if (!fixedActive(f, mk)) return `<button class="row" data-action="editFixed" data-id="${f.id}"><span class="grow"><span class="name">${esc(f.name)}</span><span class="meta">Terminó en ${monthLabel(f.endMonth)}</span></span><span class="pill ok">Terminado</span></button>`;
        const prog = fixedProgress(f, mk);
        const extra = [f.empresa ? esc(f.empresa) : '', prog ? `Cuota ${prog.actual} de ${prog.total}` : (f.endMonth ? `Hasta ${monthLabel(f.endMonth)}` : ''), f.usd ? `US$ ${String(f.usd).replace('.', ',')}` : '', f.variable ? 'Varía mes a mes' : ''].filter(Boolean).join(' · ');
        const up = !f.variable && f.lastAmount && f.amount > f.lastAmount * 1.03;
        const isPaid = !!(s.paid || {})[`fixed:${f.id}:${mk}`];
        const status = up ? `<span class="pill warn">Subió ${Math.round((f.amount / f.lastAmount - 1) * 100)}%</span>` : isPaid ? '<span class="pill ok">Pagado</span>' : (offset === 0 && Number(f.dueDay) < today ? '<span class="pill warn">¿Lo pagaste?</span>' : `<span class="pill">Vence el ${f.dueDay}</span>`);
        return `<button class="row" data-action="editFixed" data-id="${f.id}"><span class="grow"><span class="name">${esc(f.name)}</span>${extra ? `<span class="meta">${extra}</span>` : ''}</span><span class="amount">${f.variable ? '≈ ' : ''}${money(f.amount)}</span>${status}</button>`;
      }).join('') : `<div style="padding:14px 0;display:flex;flex-direction:column;gap:8px"><p class="text"><b>¿Qué es un gasto fijo?</b> Lo que pagás todos los meses por un monto parecido: alquiler, expensas, servicios, prepaga, cuotas, suscripciones.</p><p class="text muted">Cargalos una vez con el nombre que quieras y los descuento solos. Si algo no cuadra, te lo sugiero.</p></div>`}
      </div>
      <button class="btn primary block" data-action="newFixed">+ Agregar gasto fijo</button>`;
}

// primer mes con movimientos (para el selector de mes)
function primerMes(s) {
  let min = monthKey();
  for (const x of [...s.expenses, ...s.incomes]) if (x.date && x.date.slice(0, 7) < min) min = x.date.slice(0, 7);
  return min;
}

function fixedForm(s, f = {}) {
  const ideas = ['Alquiler', 'Expensas', 'Luz', 'Gas', 'Internet', 'Celular', 'Prepaga', 'Gimnasio', 'Colegio', 'Seguro del auto'];
  return `<form class="form" data-submit="saveFixed">
    <input type="hidden" name="id" value="${esc(f.id || '')}">
    ${f.id ? '' : '<p class="text muted">Ponele el nombre que quieras. Si tenés varios, cargalos de a uno.</p>'}
    <div class="field"><label for="fx-n">Nombre</label><input id="fx-n" name="name" value="${esc(f.name || '')}" placeholder="Ej: Alquiler" required></div>
    ${f.id ? '' : `<div class="chips">${ideas.map((i) => `<button type="button" class="chip" data-action="fillFixedName" data-name="${i}">${i}</button>`).join('')}</div>`}
    <div class="field-row">
      <div class="field"><label for="fx-a">Monto mensual</label><input id="fx-a" name="amount" inputmode="decimal" value="${f.amount ? String(f.amount).replace('.', ',') : ''}" placeholder="Ej: 230.000" required></div>
      <div class="field"><label for="fx-d">Día de vencimiento</label><input id="fx-d" name="dueDay" inputmode="numeric" value="${f.dueDay || ''}" placeholder="Ej: 10" required></div>
    </div>
    <label class="check"><input type="checkbox" name="variable" ${f.variable ? 'checked' : ''}> <span>El monto cambia mes a mes<br><span class="small muted">Por reajustes, descuentos que reclamás o consumo. Uso el último que pagaste y, cuando marcás "Pagué", te pregunto cuánto fue.</span></span></label>
    <div class="field"><label for="fx-h">¿Hasta cuándo lo pagás?</label><select id="fx-h" name="hasta" data-change="fixedHastaChanged">
      <option value="siempre" ${!f.endMonth ? 'selected' : ''}>Todos los meses, sin fecha de fin</option>
      <option value="cuotas" ${f.endMonth && f.totalCuotas ? 'selected' : ''}>Tiene cuotas (crédito, préstamo, plan)</option>
      <option value="mes" ${f.endMonth && !f.totalCuotas ? 'selected' : ''}>Hasta un mes en particular</option></select></div>
    <div class="field-row" data-hasta="cuotas" ${f.endMonth && f.totalCuotas ? '' : 'hidden'}>
      <div class="field"><label for="fx-ct">Total de cuotas</label><input id="fx-ct" name="totalCuotas" inputmode="numeric" value="${f.totalCuotas || ''}" placeholder="Ej: 24"></div>
      <div class="field"><label for="fx-cr">Cuotas que te faltan pagar</label><input id="fx-cr" name="restantes" inputmode="numeric" value="${f.endMonth && f.totalCuotas ? Math.max(0, monthDiff(monthKey(), f.endMonth) + 1) : ''}" placeholder="Ej: 18"><span class="hint">Contando la de este mes si todavía no la pagaste.</span></div>
    </div>
    <div class="field" data-hasta="mes" ${f.endMonth && !f.totalCuotas ? '' : 'hidden'}><label for="fx-em">Último mes que lo pagás</label><input id="fx-em" name="endMonth" type="month" value="${esc(f.endMonth || '')}" min="${monthKey()}"></div>
    ${descuentoCampos(f)}
    <details class="reint-box"${f.empresa || f.usd || f.varEsperada ? ' open' : ''}><summary><span>📋 Más datos</span><span class="small muted">Opcional</span></summary>
      <div class="field"><label for="fx-e">Empresa o proveedor</label><input id="fx-e" name="empresa" value="${esc(f.empresa || '')}" placeholder="Ej: Movistar"><span class="hint">Queda anotada en cada pago: si un día cambiás de compañía, el historial lo muestra.</span></div>
      <div class="field-row">
        <div class="field"><label for="fx-u">Se cobra en dólares</label><input id="fx-u" name="usd" inputmode="decimal" value="${f.usd ? String(f.usd).replace('.', ',') : ''}" placeholder="US$ por mes"></div>
        <div class="field"><label for="fx-v">Aumento normal por mes (%)</label><input id="fx-v" name="varEsperada" inputmode="decimal" value="${f.varEsperada ? String(f.varEsperada).replace('.', ',') : ''}" placeholder="Ej: 2"></div>
      </div>
      <span class="hint">En dólares: al pagar anotás lo que te cobraron en pesos y te muestro a qué cotización. Aumento normal: para créditos UVA o ajustables; te marco los pagos que suben bastante más o menos de eso. No calculo cuotas futuras.</span>
    </details>
    <div class="field"><label for="fx-w">Se paga con</label><select id="fx-w" name="payWith">${payOptions(s, f.payWith)}</select></div>
    <label class="check"><input type="checkbox" name="autoDebit" ${f.autoDebit ? 'checked' : ''}> <span>Débito automático<br><span class="small muted">Se da por pagado solo el día del vencimiento; te aviso que tengas saldo.</span></span></label>
    <span class="small muted">${f.variable ? 'Cada vez que pagás, actualizo el monto aproximado.' : 'Si cambia el monto, te aviso cuánto subió.'} Cuando termina, deja de descontarse solo.</span>
    <button class="btn primary block" type="submit">Guardar</button>
    ${f.id ? '' : '<button class="btn block" type="submit" name="again" value="1">Guardar y cargar otro</button>'}
    ${f.id ? `<button class="btn block" type="button" data-action="verHistorialFijo" data-id="${f.id}">Historial de pagos</button>` : ''}
    ${f.id ? `<button class="btn ghost block" type="button" data-action="deleteFixed" data-id="${f.id}">Borrar</button>` : ''}
  </form>`;
}

export const fixedFormExt = (s, f) => fixedForm(s, f);

export const actions = {
  setFilter(ctx, el) { filter = el.dataset.f; ctx.render(); },
  movVista(ctx, el) { vista = el.dataset.v; ctx.render(); },
  verDeudas(ctx) { ctx.go('deudas'); },
  monthPrev(ctx) { offset += 1; ctx.render(); },
  monthNext(ctx) { offset = Math.max(0, offset - 1); ctx.render(); },
  ahorroPesitosInfo(ctx) {
    openModal('Plata que te ahorraste', `<p class="text" style="margin:0">Acá se suma lo que te ahorrás gracias a Pesitos:</p>
      <div class="card"><span class="small">💸 <b>Reintegros y cashback:</b> cuando anotás un gasto con un medio que tiene promo (o un cashback que cargaste), calculo cuánto te devuelven. Cuando confirmás que llegó, se suma acá y a tu saldo.</span>
      <span class="small">🏷️ <b>Promos:</b> cuando usás un descuento, tocá <b>Lo aproveché</b> (en Beneficios, en las promos de hoy, o en la sugerencia de Inicio) y poné cuánto te ahorraste.</span>
      <span class="small">🏆 <b>Desafíos:</b> cuando cumplís un desafío de Mi plata → Metas, se suma lo que no gastaste.</span></div>
      <a class="btn primary block" href="#/reintegros">Ver mis reintegros</a>
      <a class="btn block" href="#/beneficios">Ver las promos de hoy</a>`);
  },
  movElegirMes(ctx) {
    const s = ctx.state; const hoy = monthKey();
    const desde = primerMes(s);
    const min = `${Math.min(Number(desde.slice(0, 4)), Number(hoy.slice(0, 4)) - 20)}-01`;
    abrirSelectorMes({ actual: addMonthKey(hoy, -offset), min, max: hoy, accion: 'movIrMes', marcados: new Set([...s.expenses, ...s.incomes].map((x) => (x.date || '').slice(0, 7))) });
  },
  movIrMes(ctx, el) { offset = el.dataset.mk ? Math.max(0, monthDiff(el.dataset.mk, monthKey())) : 0; closeModal(); ctx.render(); },
  newFixed(ctx, el) { openModal('Nuevo gasto fijo', fixedForm(ctx.state), { push: !!(el && el.dataset && el.dataset.push) }); },
  fillFixedName(ctx, el) { const i = document.getElementById('fx-n'); if (i) { i.value = el.dataset.name; document.getElementById('fx-a')?.focus(); } },
  editFixed(ctx, el) { const f = ctx.state.fixed.find((x) => x.id === el.dataset.id); if (f) openModal('Gasto fijo', fixedForm(ctx.state, f)); },
  fixedHastaChanged(ctx, el) {
    const f = el.closest('form');
    f.querySelectorAll('[data-hasta]').forEach((x) => { x.hidden = x.dataset.hasta !== el.value; });
  },
  saveFixed(ctx, d) {
    const amount = num(d.amount) || parseAmount(d.amount);
    // fin: por cuotas restantes o por mes elegido
    let endMonth = ''; let totalCuotas = 0;
    if (d.hasta === 'cuotas') {
      const rest = parseInt(d.restantes, 10) || 0; totalCuotas = parseInt(d.totalCuotas, 10) || 0;
      if (!rest) { toast('Decime cuántas cuotas te faltan'); return; }
      const paidThisMonth = d.id && (ctx.state.paid || {})[`fixed:${d.id}:${monthKey()}`];
      endMonth = addMonthKey(monthKey(), rest - (paidThisMonth ? 0 : 1));
      if (totalCuotas < rest) totalCuotas = rest;
    } else if (d.hasta === 'mes') {
      if (!/^\d{4}-\d{2}$/.test(d.endMonth || '')) { toast('Elegí el último mes'); return; }
      endMonth = d.endMonth;
    }
    const usd = num(d.usd); const varEsp = parseFloat(String(d.varEsperada || '').replace(',', '.')) || 0;
    const extra = { variable: !!d.variable || usd > 0, endMonth, totalCuotas, empresa: String(d.empresa || '').trim(), usd: usd > 0 ? usd : 0, varEsperada: varEsp > 0 ? Math.min(50, varEsp) : 0 };
    const dsc = descuentoDe(d); if (dsc !== undefined) extra.desc = dsc;
    if (!amount || !String(d.name || '').trim()) { toast('Completá nombre y monto'); return; }
    const again = d.again === '1';
    ctx.commit((s) => {
      const f = s.fixed.find((x) => x.id === d.id);
      if (f) {
        if (f.amount !== amount) f.lastAmount = f.amount;
        Object.assign(f, { name: d.name.trim(), amount, dueDay: parseInt(d.dueDay, 10) || f.dueDay, payWith: d.payWith || '', autoDebit: !!d.autoDebit, ...extra });
      } else s.fixed.push({ id: uid(), name: d.name.trim(), amount, dueDay: parseInt(d.dueDay, 10) || 10, payWith: d.payWith || '', autoDebit: !!d.autoDebit, ...extra });
    });
    if (again) { openModal('Nuevo gasto fijo', fixedForm(ctx.state)); toast(`${d.name.trim()} guardado`); }
    else { closeModal(); toast('Gasto fijo guardado'); }
  },
  deleteFixed(ctx, el) { closeModal(); borrarConDeshacer(ctx, 'Gasto fijo borrado', (s) => { s.fixed = s.fixed.filter((x) => x.id !== el.dataset.id); }); },
};
