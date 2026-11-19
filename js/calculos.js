// Cálculos: presupuesto del ciclo, "hoy podés gastar", ahorro por reglas,
// metas, sueldo real, tarjetas y cuotas.

import { reintegrosCobrados, totalReintegros } from './reintegros.js';
import { toISO, parseISO, monthKey, addMonthKey, monthDiff, startOfToday, daysBetween, MONTHS_LONG, money, addDays } from './formato.js';
import { arsPer, aBase } from './cotizaciones.js';
import { valorHoy } from './rendimientos.js';
import { fechaDeCobro } from './feriados.js';
import { ipcMap, expectedInflation } from './datosvivos.js';
import { provisions, statementOf, statementAmount } from './agenda.js';

const share = (e) => (e.installments > 1 ? e.amount / e.installments : e.amount);
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);

function dateWithDay(y, m, day) {
  const dim = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, dim));
}

// Ciclo de cobro: del último día de cobro al próximo.
// Ciclo de cobro: desde el último cobro hasta el próximo (día fijo, día hábil, último hábil…)
export function payCycle(s, today = startOfToday()) {
  let next = fechaDeCobro(s.profile, today.getFullYear(), today.getMonth());
  if (next <= today) { const n = new Date(today.getFullYear(), today.getMonth() + 1, 1); next = fechaDeCobro(s.profile, n.getFullYear(), n.getMonth()); }
  const p = new Date(next.getFullYear(), next.getMonth() - 1, 1);
  const start = fechaDeCobro(s.profile, p.getFullYear(), p.getMonth());
  return { start, next, startISO: toISO(start), nextISO: toISO(next), daysLeft: Math.max(1, daysBetween(today, next)) };
}

/** ¿Cobra aguinaldo? Relación de dependencia y jubilación sí; monotributo e independientes no (salvo que diga lo contrario). */
export function cobraAguinaldo(s) {
  const p = s.profile || {};
  if (p.aguinaldo !== undefined) return !!p.aguinaldo;
  return !['mono', 'var'].includes(p.ingresos);
}
/** Cómo se llama el cobro principal según cómo entra la plata. */
export function notaCobro(s) {
  return { dep: 'Sueldo', jub: 'Jubilación', mono: 'Ingresos del mes', var: 'Ingresos del mes', mix: 'Ingresos del mes' }[(s.profile || {}).ingresos] || 'Cobro del mes';
}
export function lastSalary(s) {
  return [...s.incomes].filter((i) => i.type === 'sueldo').sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

// Un gasto fijo cuenta solo hasta su mes de fin (créditos, cuotas, contratos)
export const fixedActive = (f, mk = monthKey()) => !f.endMonth || mk <= f.endMonth;
export const fixedTotal = (s, mk = monthKey()) => sum(s.fixed.filter((f) => fixedActive(f, mk)), (f) => (f.desc && f.desc.hasta && mk <= f.desc.hasta ? Number(f.desc.monto) || 0 : f.amount));
// "cuota 7 de 24" para los fijos con cantidad de cuotas
export function fixedProgress(f, mk = monthKey()) {
  if (!f.endMonth || !f.totalCuotas) return null;
  const restantes = monthDiff(mk, f.endMonth) + 1;
  const actual = f.totalCuotas - restantes + 1;
  return actual >= 1 && actual <= f.totalCuotas ? { actual, total: f.totalCuotas } : null;
}

function cycleExpenses(s, cycle) {
  return s.expenses.filter((e) => !e.pending && e.date >= cycle.startISO && e.date < cycle.nextISO);
}

// Ahorro planificado según las reglas activas, con el detalle de cada una.
export function plannedSaving(s, salary, extras = 0, expenses = []) {
  const r = s.rules;
  const parts = [];
  let base = 0;
  if (r.payFirst.on) base = (salary * r.payFirst.pct) / 100;
  if (r.r503020.on) base = Math.max(base, salary * 0.2);
  if (base) parts.push({ name: r.r503020.on && base === salary * 0.2 ? '50/30/20' : 'Págate primero', amount: base });
  if (r.extraPct.on && extras) parts.push({ name: 'Ingresos extra', amount: (extras * r.extraPct.pct) / 100 });
  if (r.roundup.on) {
    const to = Number(r.roundup.to) || 1000;
    const round = sum(expenses, (e) => { const v = share(e); return Math.ceil(v / to) * to - v; });
    if (round) parts.push({ name: 'Redondeo', amount: round });
  }
  // fondos con aporte automático (salud, el auto…): se apartan todos los meses
  for (const g of s.goals || []) if (g.tipo === 'fondo' && g.auto !== false && g.monthly > 0 && !(g.target && g.saved >= g.target)) parts.push({ name: `Fondo ${g.name}`, amount: g.monthly });
  // ahorro de a poco para pagos grandes que vienen (agenda de pagos)
  const prov = provisions(s).reduce((a, p) => a + p.monthly, 0);
  if (prov > 0) parts.push({ name: 'Para pagos que vienen', amount: prov });
  for (const c of r.custom || []) {
    if (!c.on) continue;
    let v = 0;
    if (c.type === 'pctSalary') v = (salary * c.value) / 100;
    else if (c.type === 'fixedMonthly') v = c.value;
    else if (c.type === 'catPct') v = (sum(expenses.filter((e) => e.category === c.category), share) * c.value) / 100;
    else if (c.type === 'porGasto') v = expenses.filter((e) => e.category === c.category).length * c.value;
    else if (c.type === 'bajoTope') v = Math.max(0, c.value - sum(expenses.filter((e) => e.category === c.category), share));
    else if (c.type === 'pctIngresos') v = ((salary + extras) * c.value) / 100;
    else if (c.type === 'porSemana') v = c.value * 4.33;
    else if (c.type === 'porDia') v = c.value * 30;
    if (v) parts.push({ name: c.name, amount: v });
  }
  return { total: sum(parts, (p) => p.amount), parts };
}

/** Gastos que no cuentan en "Hoy podés gastar": pagados con ahorros (incluye proyectos que se pagan con ahorros). */
export const deAhorros = (s, e) => !!(e.fromSavings || (e.proyectoId && (s.proyectos || []).some((p) => p.id === e.proyectoId && p.conAhorros)));

// Gasto variable que cae en el ciclo (las compras en cuotas cuentan de a una cuota por mes).
export function cycleVariable(s, cycle) {
  const startMk = cycle.startISO.slice(0, 7);
  let total = 0;
  for (const e of s.expenses) {
    if (e.pending || deAhorros(s, e)) continue;
    if (e.date >= cycle.startISO && e.date < cycle.nextISO) total += share(e);
    else if (e.date < cycle.startISO && e.installments > 1) {
      const k = monthDiff(e.date.slice(0, 7), startMk);
      if (k >= 1 && k <= e.installments - 1) total += share(e);
    }
  }
  return total;
}

// ---------- "Hoy podés gastar": modos ----------
// reparto: parte de lo que no gastás que se suma a tus próximos días (el resto se sugiere ahorrar)
// tope: cuánto puede subir tu día por encima del ritmo normal (0.2 = +20%; null = sin techo)
export const MODOS_DIARIO = {
  ahorrador: { nombre: 'Ahorrador', reparto: 0.2, tope: 0.2, txt: 'Casi todo lo que no gastás va a tu meta. Tu día nunca pasa tu ritmo normal + 20%.' },
  equilibrado: { nombre: 'Equilibrado', reparto: 0.5, tope: 0.5, txt: 'La mitad se suma a tus próximos días (hasta +50%) y la otra mitad, a tu meta.' },
  flexible: { nombre: 'Flexible', reparto: 1, tope: null, txt: 'Todo lo que no gastás se suma a tus próximos días. No te sugiero ahorrar nada extra.' },
  personalizado: { nombre: 'A tu medida', reparto: 0.3, tope: 0.3, txt: 'Elegís vos cuánto pasa a tus próximos días, hasta cuánto puede subir y a qué meta va el resto.' },
};
export function diarioConfig(s) {
  const d = s.diario || {};
  let modo = d.modo;
  if (!MODOS_DIARIO[modo]) {
    // quienes ya habían elegido un reparto (v21) siguen igual
    if (d.reparto === undefined) modo = 'ahorrador';
    else modo = Object.keys(MODOS_DIARIO).find((k) => k !== 'personalizado' && MODOS_DIARIO[k].reparto === Number(d.reparto)) || 'personalizado';
  }
  const m = MODOS_DIARIO[modo];
  if (modo !== 'personalizado') return { modo, reparto: m.reparto, tope: m.tope, destino: d.destino || '' };
  const rep = d.reparto !== undefined ? Math.min(1, Math.max(0, Number(d.reparto))) : m.reparto;
  const tope = d.tope === null || d.tope === 'sin' ? null : d.tope !== undefined ? Math.max(0, Number(d.tope)) : m.tope;
  return { modo, reparto: rep, tope, destino: d.destino || '' };
}
/** La meta a la que va lo que no gastás: la que elegiste, o la principal. */
export function metaDiario(s) {
  const id = diarioConfig(s).destino;
  return (id && (s.goals || []).find((g) => g.id === id)) || mainGoal(s);
}

export function budget(s) {
  const today = startOfToday();
  const todayStr = toISO(today);
  const cycle = payCycle(s, today);
  const inCycle = s.incomes.filter((i) => i.date >= cycle.startISO && i.date < cycle.nextISO);
  const salaryInCycle = sum(inCycle.filter((i) => i.type === 'sueldo'), (i) => i.amount);
  const last = lastSalary(s);
  const salary = salaryInCycle || (last ? last.amount : 0);
  // reintegros y cashback que ya te devolvieron en este ciclo: plata que vuelve
  const reint = totalReintegros(reintegrosCobrados(s, toISO(addDays(cycle.start, -1)), todayStr < cycle.nextISO ? todayStr : cycle.nextISO));
  const extras = sum(inCycle.filter((i) => i.type !== 'sueldo'), (i) => i.amount) + reint;
  const income = salary + extras;
  const fixed = fixedTotal(s);
  const plan = plannedSaving(s, salary, extras, cycleExpenses(s, cycle));
  // lo que decidiste para este ciclo en Mi plata → Ahorros: ahorrar otro monto, "ahora no",
  // o dejar para gastar lo que no gastaste otros días
  const decision = (s.ahorroCiclo || {})[cycle.startISO] || {};
  const saving = decision.ahorro != null ? Math.max(0, Number(decision.ahorro) || 0) : plan.total;
  const variable = cycleVariable(s, cycle);
  const spentToday = sum(s.expenses.filter((e) => !e.pending && !deAhorros(s, e) && e.date === todayStr), share);
  // lo que pasaste a ahorro desde "Hoy podés gastar" (lo que no gastaste otros días)
  const aparte = sum((s.transfers || []).filter((t) => t.deDiario && t.date >= cycle.startISO && t.date < cycle.nextISO), (t) => t.amount);
  const free = income - fixed - saving - variable - aparte;
  // Lo de hoy funciona como un administrador: tu ritmo normal del mes, más una parte
  // de lo que no gastaste los días anteriores (la otra parte se sugiere ahorrar).
  // s.diario.reparto: 1 = todo para gastar después, 0.5 = mitad y mitad, 0 = todo a ahorro.
  const cycleDays = Math.max(1, daysBetween(cycle.start, cycle.next));
  const normalDaily = Math.max(0, (income - fixed - saving) / cycleDays);
  const evenSplit = (free + spentToday) / cycle.daysLeft;
  const transcurridos0 = Math.max(0, cycleDays - cycle.daysLeft);
  const cfg = diarioConfig(s); const reparto = cfg.reparto;
  // lo que no gastaste de los días anteriores (lo ya pasado a ahorro sale de la parte "para ahorrar")
  const colchon = normalDaily > 0 ? Math.max(0, Math.round(normalDaily * transcurridos0 - (variable - spentToday))) : 0;
  // lo que se suma a tus próximos días, con un techo según el modo (lo que pasa el techo se sugiere ahorrar)
  const techoDia = cfg.tope == null ? Infinity : normalDaily * cfg.tope;
  const gastable0 = Math.max(0, Math.min(colchon * reparto, colchon - aparte, techoDia * cycle.daysLeft));
  const gastable = Math.max(gastable0, Math.min(colchon - aparte, gastable0 + (Number(decision.liberado) || 0)));
  const paraAhorrar = Math.max(0, Math.round(colchon - gastable - aparte));
  const extraDia = gastable / cycle.daysLeft;
  const dailyBase = normalDaily > 0 ? Math.min(evenSplit, normalDaily + extraDia) : evenSplit;
  const todayLeft = dailyBase - spentToday;
  const sobrante = Math.max(0, Math.round((free + spentToday) - dailyBase * cycle.daysLeft));
  // cuánto vas por encima de tu ritmo normal en lo que va del ciclo (sin contar hoy)
  const transcurridos = Math.max(0, cycleDays - cycle.daysLeft);
  const adelanto = normalDaily > 0 ? Math.max(0, Math.round((variable - spentToday) - normalDaily * transcurridos)) : 0;
  const usedPct = income > 0 ? Math.min(1, (fixed + saving + variable + aparte) / income) : 0;
  return { cycle, income, salary, extras, fixed, saving, savingPlan: plan.total, decision, savingParts: plan.parts, variable, spentToday, free, dailyBase, normalDaily, sobrante, adelanto, colchon, paraAhorrar, extraDia, reparto, modo: cfg.modo, aparte, todayLeft, usedPct, estimated: !salaryInCycle && !!last, noIncome: income <= 0 };
}

// ---------- metas ----------
export const mainGoal = (s) => s.goals.find((g) => g.main && g.tipo !== 'fondo') || s.goals.find((g) => g.tipo !== 'fondo') || null;
export const goalPct = (g) => (g.target > 0 ? Math.min(1, g.saved / g.target) : 0);

export function goalEta(g) {
  if (g.tipo === 'fondo') {
    const ap = g.monthly ? `Aportás ${money(g.monthly)} por mes${g.auto !== false ? ' (automático)' : ''}` : 'Sin aporte mensual';
    return { done: false, text: g.target ? `${ap} · tope ${money(g.target)}` : ap };
  }
  if (!g.target) return { done: false, text: 'Falta definir cuánto necesitás' };
  const left = Math.max(0, g.target - g.saved);
  if (left === 0) return { done: true, text: '¡Meta cumplida!' };
  if (!g.monthly || g.monthly <= 0) return { done: false, text: 'Sin aporte mensual definido' };
  const months = Math.ceil(left / g.monthly);
  const d = new Date(); d.setMonth(d.getMonth() + months);
  const when = months <= 11 ? MONTHS_LONG[d.getMonth()] : `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  return { done: false, months, text: `A este ritmo llegás en ${when}` };
}

// ---------- "¿Me lo compro?" ----------
export function buyImpact(s, amount) {
  const b = budget(s);
  if (b.noIncome) return { level: 'warn', title: 'Primero cargá lo que cobrás', text: 'Sin ingreso no puedo calcular el impacto.' };
  if (amount <= b.todayLeft) {
    return { level: 'ok', title: 'Dale, entra en lo de hoy', text: `Te quedarían ${money(b.todayLeft - amount)} para hoy, sin tocar tus metas.` };
  }
  if (amount <= b.free) {
    // la compra se come lo de hoy: lo que queda se reparte en los días que faltan después de hoy
    const diasDespues = Math.max(1, b.cycle.daysLeft - 1);
    const repartido = (b.free - amount) / diasDespues;
    // nunca más que tu ritmo normal: si sobraba plata, la compra sale de ese sobrante
    const newDaily = Math.min(b.dailyBase, repartido);
    if (newDaily >= b.dailyBase - 1) return { level: 'ok', title: 'Se puede, sin cambiar tu diario', text: `Sale de lo que te iba a sobrar hasta el cobro${b.sobrante ? ` (${money(b.sobrante)})` : ''}. Seguís con ${money(b.dailyBase)} por día, pero ahorrás menos este mes.` };
    return { level: 'warn', title: 'Se puede, pero ajusta tu diario', text: `Desde mañana y hasta el cobro pasarías de ${money(b.dailyBase)} a ${money(newDaily)} por día.` };
  }
  const over = amount - Math.max(0, b.free);
  const g = mainGoal(s);
  let text = `Te pasás ${money(over)} de lo que tenés libre hasta el cobro.`;
  if (g && g.monthly > 0) {
    const days = Math.max(1, Math.round(over / (g.monthly / 30)));
    text += ` Si sale de tus ahorros, atrasa "${g.name}" unos ${days} días.`;
  }
  return { level: 'no', title: 'Mejor esperá', text, extra: amount > 3 * Math.max(1, b.dailyBase) ? 'Si hay cuotas sin interés, preguntale al asesor si conviene.' : '' };
}

// ---------- cuotas vs contado ----------
export function installmentsVsCash(price, n, discountPct, monthlyInflPct) {
  const i = monthlyInflPct / 100;
  let pv = 0;
  for (let k = 1; k <= n; k++) pv += price / n / Math.pow(1 + i, k);
  const cash = price * (1 - discountPct / 100);
  return { pv, cash, better: pv < cash ? 'cuotas' : 'contado', diff: Math.abs(cash - pv) };
}

// ---------- compras en cuotas: cuánto te costaron de verdad ----------
// Cada cuota se lleva a "plata del día de la compra" con la inflación real del INDEC
// (y la esperada para los meses que todavía no se publicaron). La diferencia con
// el total es lo que la inflación te "licuó".
export function cuotasReales(s, e) {
  const n = Number(e.installments) || 1;
  if (n <= 1 || !e.amount || !e.date) return null;
  const m = ipcMap(s); const esperada = expectedInflation(s) / 100;
  const cuota = e.amount / n; const mk0 = e.date.slice(0, 7); const hoy = monthKey();
  let factor = 1; let pv = 0; let pagadas = 0; let estimadas = 0;
  for (let k = 1; k <= n; k++) {
    const mk = addMonthKey(mk0, k);
    const real = m[mk] != null && Number.isFinite(Number(m[mk]));
    factor *= 1 + (real ? Number(m[mk]) / 100 : esperada);
    if (!real) estimadas++;
    pv += cuota / factor;
    if (mk <= hoy) pagadas++;
  }
  return { n, cuota, total: e.amount, pv, licuado: e.amount - pv, pagadas, estimadas };
}
export function resumenCuotas(s) {
  const out = { compras: 0, total: 0, pv: 0, licuado: 0 };
  for (const e of s.expenses) { if (e.pending) continue; const r = cuotasReales(s, e); if (!r) continue; out.compras++; out.total += r.total; out.pv += r.pv; out.licuado += r.licuado; }
  return out;
}

// ---------- totales por mes y categoría ----------
export function monthExpenses(s, mk) {
  let total = 0; const byCat = {};
  for (const e of s.expenses) {
    if (e.pending) continue;
    const n = e.installments > 1 ? e.installments : 1;
    const k = monthDiff(e.date.slice(0, 7), mk);
    if (k < 0 || k >= n) continue;
    const v = e.amount / n;
    total += v;
    // gasto dividido en varias categorías: cada parte va a la suya
    if (Array.isArray(e.splits) && e.splits.length) for (const p of e.splits) byCat[p.category] = (byCat[p.category] || 0) + (Number(p.amount) || 0) / n;
    else byCat[e.category] = (byCat[e.category] || 0) + v;
  }
  return { total, byCat };
}
export const monthIncome = (s, mk) => sum(s.incomes.filter((i) => i.date.slice(0, 7) === mk), (i) => i.amount);

// ---------- sueldo nominal vs real ----------
// Mes trabajado al que corresponde un cobro de sueldo (lo elegís al cargarlo).
export function periodoDe(i) {
  if (i.periodo && /^\d{4}-\d{2}$/.test(i.periodo)) return i.periodo;
  // los que se cargaron antes de existir "mes trabajado" usaban el mes de la fecha
  return i.date.slice(0, 7);
}
export function salaryStats(s) {
  const byMonth = {};
  s.incomes.filter((i) => i.type === 'sueldo').forEach((i) => { const mk = periodoDe(i); byMonth[mk] = (byMonth[mk] || 0) + i.amount; });
  const months = Object.keys(byMonth).sort();
  if (!months.length) return null;
  const first = months[0]; const last = months[months.length - 1];
  // Inflación automática (INDEC). Los meses que el INDEC todavía no publicó
  // se estiman con el promedio de los últimos 3 meses y se marcan como estimados.
  const ipc = ipcMap(s);
  const guess = expectedInflation(s);
  const factor = { [first]: 1 }; const missing = [];
  let f = 1; let mk = first;
  while (mk < last) {
    const nx = addMonthKey(mk, 1);
    let ip = ipc[nx];
    if (ip == null || ip === '') { missing.push(nx); ip = guess; }
    f *= 1 + (Number(ip) || 0) / 100;
    factor[nx] = f; mk = nx;
  }
  const series = months.map((m) => ({ mk: m, nominal: byMonth[m], real: (byMonth[m] * factor[last]) / factor[m] }));
  const cur = series[series.length - 1];
  const best = series.reduce((a, b) => (b.real > a.real ? b : a));
  const target = addMonthKey(last, -12);
  const base = series.find((x) => x.mk >= target) || series[0];
  const nomGrowth = cur.nominal / base.nominal - 1;
  const inflation = factor[last] / factor[base.mk] - 1;
  const realGrowth = (1 + nomGrowth) / (1 + inflation) - 1;
  let streak = 0;
  for (let i = series.length - 1; i > 0; i--) { if (series[i].real > series[i - 1].real * 1.0005) streak++; else break; }
  const toRecover = best.real > cur.real ? best.real / cur.real - 1 : 0;
  return { series, cur, best, isBest: best.mk === cur.mk && series.length > 1, base, nomGrowth, inflation, realGrowth, streak, toRecover, missing, span: monthDiff(base.mk, last) };
}

// ---------- ahorro ----------
// incluye los intereses ganados desde que cargaste el monto (ver js/rendimientos.js)
// valor de lo que tenés, en tu moneda principal (pesos o dólares)
export const holdingArs = (s, h) => valorHoy(s, h) * (aBase(s, h.currency || 'ARS') || 0);
export const holdingsTotal = (s) => sum(s.holdings, (h) => holdingArs(s, h));
export const savedThisMonth = (s) => s.savedByApp[monthKey()] || 0;

// ---------- tarjetas de crédito ----------
// Mes del resumen en el que entra una compra (según el día de cierre).
export function statementMonth(card, iso) { return statementOf(card, iso); }

export function cardSummary(s, card) {
  const current = statementMonth(card, toISO(startOfToday()));
  const byMonth = {};
  const pending = [];
  let committed = 0;
  for (const e of s.expenses) {
    if (e.pending || e.cardId !== card.id) continue;
    const n = e.installments > 1 ? e.installments : 1;
    const first = statementMonth(card, e.date);
    const each = e.amount / n;
    for (let k = 0; k < n; k++) {
      const mk = addMonthKey(first, k);
      if (mk >= current) { byMonth[mk] = (byMonth[mk] || 0) + each; committed += each; }
    }
    const paid = Math.max(0, Math.min(n, monthDiff(first, current)));
    if (n > 1 && paid < n) pending.push({ e, n, each, next: paid + 1, left: n - paid, remaining: each * (n - paid), last: addMonthKey(first, n - 1) });
  }
  pending.sort((a, b) => b.remaining - a.remaining);
  // reintegros que bajan cada resumen
  const rein = {};
  for (const e of s.expenses) { const r = e.reintegro; if (r && !r.no && r.cardId === card.id && r.monto > 0) { const mk = statementMonth(card, r.fecha); if (mk >= current) rein[mk] = (rein[mk] || 0) + r.monto; } }
  for (const [mk, v] of Object.entries(rein)) { const antes = byMonth[mk] || 0; byMonth[mk] = Math.max(0, antes - v); committed -= Math.min(antes, v); }
  const months = Array.from({ length: 6 }, (_, i) => { const mk = addMonthKey(current, i); return { mk, amount: byMonth[mk] || 0 }; });
  return { current, reintegros: rein[current] || 0, next: statementAmount(s, card, current), months, pending, committed, used: card.limit ? committed / card.limit : 0 };
}

// ---------- resumen semanal automático (lunes a domingo, se cierra el lunes 00:00) ----------
export function lastWeekStart(today = startOfToday()) {
  const back = (today.getDay() + 6) % 7; // días desde el lunes
  const monday = new Date(today); monday.setDate(today.getDate() - back - 7);
  return toISO(monday);
}

function weekSpent(s, fromISO, toISOd) {
  return s.expenses.filter((e) => !e.pending && e.date >= fromISO && e.date <= toISOd);
}

export function weekSummary(s, mondayISO) {
  const from = parseISO(mondayISO);
  const to = new Date(from); to.setDate(from.getDate() + 6);
  const toStr = toISO(to);
  const list = weekSpent(s, mondayISO, toStr);
  const spent = sum(list, share);
  const byCat = {};
  list.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + share(e); });
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, amount]) => ({ cat, amount }));
  // promedio de las 4 semanas anteriores
  const prev = [1, 2, 3, 4].map((k) => {
    const a = new Date(from); a.setDate(from.getDate() - 7 * k);
    const b = new Date(a); b.setDate(a.getDate() + 6);
    return sum(weekSpent(s, toISO(a), toISO(b)), share);
  }).filter((v) => v > 0);
  const avg = prev.length ? prev.reduce((a, v) => a + v, 0) / prev.length : 0;
  const income = sum(s.incomes.filter((i) => i.date >= mondayISO && i.date <= toStr), (i) => i.amount);
  let verdict = 'Primera semana con datos: desde la próxima te comparo contra tu promedio.';
  if (avg > 0) {
    const diff = spent / avg - 1;
    verdict = Math.abs(diff) < 0.05 ? 'Gastaste parecido a tu promedio de las últimas semanas.'
      : diff < 0 ? `Gastaste ${Math.round(-diff * 100)}% menos que tu promedio (${money(avg)}). ¡Bien ahí!`
      : `Gastaste ${Math.round(diff * 100)}% más que tu promedio (${money(avg)}).`;
  }
  return { from: mondayISO, to: toStr, spent, top, avg, income, verdict, count: list.length };
}

// Saldo esperado desde el último cierre semanal.
export function expectedBalance(s, todayStr = toISO(startOfToday())) {
  if (!s.lastClose) return null;
  const since = s.lastClose.date;
  const inc = sum(s.incomes.filter((i) => i.date > since && i.date <= todayStr), (i) => i.amount);
  const exp = sum(s.expenses.filter((e) => !e.pending && !e.cardId && e.date > since && e.date <= todayStr), share);
  const tr = sum((s.transfers || []).filter((t) => t.date > since && t.date <= todayStr), (t) => t.amount);
  let fixedDue = 0;
  const a = parseISO(since); const b = parseISO(todayStr);
  for (let d = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1); d <= b; d.setDate(d.getDate() + 1)) {
    for (const f of s.fixed) if (Number(f.dueDay) === d.getDate() && fixedActive(f, monthKey(d))) fixedDue += f.amount;
  }
  return s.lastClose.balance + inc - exp - tr - fixedDue;
}

export function closeDue(s) {
  if (!s.lastClose) return true;
  return daysBetween(parseISO(s.lastClose.date), startOfToday()) >= 7;
}

export { monthKey };
