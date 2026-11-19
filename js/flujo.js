// Flujo de plata: lo que entra y lo que sale hasta el próximo cobro.
// - Cobros esperados: próximos sueldos, aguinaldo (estimado), cobros que
//   cargás (alquileres, trabajos) y plazos fijos que vencen.
// - Proyección día a día de la plata disponible (cuentas + efectivo,
//   sin contar ahorros), con tus vencimientos y tu ritmo de gasto.
// - Cobertura: si algún día no alcanza, cuánto falta y qué hacer.
// - Plan para pagar cada resumen de tarjeta.

import { toISO, parseISO, startOfToday, daysBetween, addDays, money, monthName } from './formato.js';
import { payCycle, lastSalary, expectedBalance, cobraAguinaldo } from './calculos.js';
import { agendaBetween, billOccurrences, repeatLabel } from './agenda.js';
import { fechaDeCobro } from './feriados.js';
import { reintegrosPendientes, reintegrosCobrados, totalReintegros } from './reintegros.js';

const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);
const share = (e) => (e.installments > 1 ? e.amount / e.installments : e.amount);

// ---------- cobros esperados ----------
export function inflows(s, from, to) {
  const out = [];
  const last = lastSalary(s);

  // próximos sueldos (con el último monto cobrado)
  if (last) {
    for (let k = 0; k < 4; k++) {
      const base = new Date(from.getFullYear(), from.getMonth() + k, 1);
      const d = fechaDeCobro(s.profile, base.getFullYear(), base.getMonth());
      if (d < from || d > to) continue;
      const mk = toISO(d).slice(0, 7);
      const already = s.incomes.some((i) => i.type === 'sueldo' && i.date.slice(0, 7) === mk);
      if (already) continue;
      out.push({ key: `sal:${mk}`, kind: 'salary', name: `Cobro de ${monthName(mk, true)}`, amount: last.amount, date: toISO(d), estimated: true, sub: 'Estimado con tu último cobro' });
    }
  }

  // aguinaldo: se paga hasta el 30 de junio y el 18 de diciembre;
  // es la mitad del mejor sueldo del semestre
  // solo si cobrás aguinaldo (relación de dependencia). Si no lo dijiste, lo estimo y te pregunto.
  if (cobraAguinaldo(s)) for (const y of [from.getFullYear(), from.getFullYear() + 1]) {
    for (const [m, day, semFrom, semTo] of [[5, 30, `${y}-01`, `${y}-06`], [11, 18, `${y}-07`, `${y}-12`]]) {
      const d = new Date(y, m, day);
      if (d < from || d > to) continue;
      const mk = toISO(d).slice(0, 7);
      if (s.incomes.some((i) => i.date.slice(0, 7) === mk && /aguinaldo|sac/i.test(i.note || ''))) continue;
      const sem = s.incomes.filter((i) => i.type === 'sueldo' && i.date.slice(0, 7) >= semFrom && i.date.slice(0, 7) <= semTo).map((i) => i.amount);
      const best = sem.length ? Math.max(...sem) : (last ? last.amount : 0);
      if (best > 0) out.push({ key: `sac:${mk}`, kind: 'aguinaldo', name: 'Aguinaldo', amount: best / 2, date: toISO(d), estimated: true, preguntar: s.profile.aguinaldo === undefined, sub: `Medio aguinaldo de ${m === 5 ? 'junio' : 'diciembre'}: la mitad de tu mejor sueldo del semestre` });
    }
  }

  // cobros que cargaste
  for (const c of s.expectedIncomes || []) {
    for (const d of billOccurrences(c, from, to)) {
      const key = `inc:${c.id}:${toISO(d)}`;
      if ((s.received || {})[key]) continue;
      out.push({ key, kind: 'income', refId: c.id, name: c.name, amount: c.amount, date: toISO(d), sub: repeatLabel(c.repeat, c) });
    }
  }

  // reintegros y cashback que te van a devolver (agrupados por día y billetera)
  const grupos = {};
  for (const e of reintegrosPendientes(s)) {
    const r = e.reintegro; const d = parseISO(r.fecha);
    if (d < from || d > to) continue;
    const k = `rein:${r.fecha}:${r.wallet}`;
    const g = grupos[k] = grupos[k] || { key: k, kind: 'reintegro', name: `Reintegro ${r.nombre}`, amount: 0, date: r.fecha, n: 0, toCard: !!r.cardId };
    g.amount += r.monto; g.n++;
  }
  for (const g of Object.values(grupos)) out.push({ ...g, sub: `${g.n} compra${g.n === 1 ? '' : 's'} · ${g.toCard ? 'baja el resumen de la tarjeta' : 'se suma a tu cuenta cuando confirmás que llegó'}` });

  // plazos fijos que vencen
  for (const h of s.holdings || []) {
    if (!h.maturity || (h.currency && h.currency !== 'ARS')) continue;
    const d = parseISO(h.maturity);
    if (d < from || d > to) continue;
    out.push({ key: `pf:${h.id}:${h.maturity}`, kind: 'maturity', name: `Vence ${h.name || 'plazo fijo'}`, amount: h.amount, date: h.maturity, sub: 'Capital (más intereses)', toSavings: true });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- plata disponible hoy ----------
function startBalance(s) {
  const cycle = payCycle(s);
  if (s.lastClose) return { amount: expectedBalance(s), estimated: false, cycle };
  const today = toISO(startOfToday());
  const inCycle = (d) => d >= cycle.startISO && d <= today;
  let amount = sum(s.incomes.filter((i) => inCycle(i.date)), (i) => i.amount) + totalReintegros(reintegrosCobrados(s, cycle.startISO, today).filter((e) => !e.reintegro.cardId));
  if (!s.incomes.some((i) => i.type === 'sueldo' && inCycle(i.date))) { const l = lastSalary(s); if (l) amount += l.amount; }
  amount -= sum(s.expenses.filter((e) => !e.pending && !e.cardId && !e.fromSavings && !e.fromPayment && inCycle(e.date)), share);
  amount -= sum((s.transfers || []).filter((t) => inCycle(t.date)), (t) => t.amount);
  for (const [key, p] of Object.entries(s.paid || {})) {
    if (!p || !inCycle(p.date || '')) continue;
    if (key.startsWith('fixed:') || key.startsWith('card:')) amount -= Number(p.amount) || 0;
    if (key.startsWith('bill:')) { const b = (s.bills || []).find((x) => x.id === key.split(':')[1]); if (!b || !b.saveAhead) amount -= Number(p.amount) || 0; }
  }
  // débitos automáticos que ya se debitaron este ciclo
  for (const it of agendaBetween(s, cycle.start, startOfToday())) if (it.paidInfo && it.paidInfo.auto && !it.fromSavings) amount -= it.amount;
  return { amount, estimated: true, cycle };
}

// ritmo de gasto diario en efectivo/débito (sin tarjeta), últimos 30 días
function dailyPace(s) {
  const today = startOfToday();
  const from = toISO(addDays(today, -30));
  const list = s.expenses.filter((e) => !e.pending && !e.cardId && !e.fromSavings && !e.fromPayment && e.category !== 'varios' && !/cierre semanal/i.test(e.note || '') && e.date >= from);
  return sum(list, share) / 30;
}

// ---------- proyección hasta el cobro ----------
export function projection(s) {
  const today = startOfToday();
  const start = startBalance(s);
  const end = start.cycle.next;
  const horizon = Math.max(1, daysBetween(today, end));
  const pace = dailyPace(s);
  let out = agendaBetween(s, addDays(today, -45), end).filter((i) => !i.paid && !i.fromSavings && i.due <= toISO(end));
  // con saldo real cargado, los fijos ya vencidos desde ese ajuste ya están descontados
  if (!start.estimated && s.lastClose) out = out.filter((i) => !(i.kind === 'fixed' && i.due > s.lastClose.date && i.due <= toISO(today)));
  const ins = inflows(s, today, end).filter((i) => !i.toSavings && !i.toCard);
  let bal = start.amount;
  const points = [];
  let min = Infinity; let minDate = toISO(today);
  for (let k = 0; k <= horizon; k++) {
    const d = toISO(addDays(today, k));
    const dayOut = out.filter((i) => (k === 0 ? i.due <= d : i.due === d));
    const dayIn = ins.filter((i) => i.date === d);
    if (k > 0) bal -= pace;
    bal -= sum(dayOut, (i) => i.amount);
    bal += sum(dayIn, (i) => i.amount);
    points.push({ date: d, balance: bal, out: dayOut, in: dayIn });
    // el mínimo se mide antes de cobrar
    if (d < start.cycle.nextISO && bal < min) { min = bal; minDate = d; }
  }
  if (min === Infinity) { min = bal; minDate = toISO(today); }
  const pendingOut = sum(out, (i) => i.amount);
  return { start: start.amount, estimated: start.estimated, pace, points, min, minDate, shortfall: min < 0 ? -min : 0, until: start.cycle.nextISO, pendingOut, out, ins, horizon };
}

// ---------- cobertura: qué hacer si no alcanza ----------
export function coverage(s, pr = projection(s)) {
  if (pr.shortfall <= 0) {
    return { ok: true, text: `Te alcanza: el día más justo (${fmt(pr.minDate)}) te quedarían cerca de ${money(pr.min)}.` };
  }
  const options = [];
  const savings = sum((s.holdings || []).filter((h) => (h.currency || 'ARS') === 'ARS' && ['remunerada', 'caja', 'fci', 'efectivo'].includes(h.type)), (h) => h.amount);
  if (savings > 0) options.push(`Usar ${money(Math.min(savings, pr.shortfall))} de tus ahorros de rápido acceso.`);
  const days = Math.max(1, pr.horizon);
  const newPace = Math.max(0, pr.pace - pr.shortfall / days);
  if (pr.pace > 0) options.push(`Bajar tu gasto diario de ${money(pr.pace)} a ${money(newPace)} hasta el cobro.`);
  const card = pr.out.find((i) => i.kind === 'card');
  if (card) options.push(`Priorizar el pago total de la tarjeta (${money(card.amount)}): financiarla es lo más caro.`);
  const auto = pr.out.filter((i) => i.autoDebit);
  if (auto.length) options.push(`Tener saldo para los débitos automáticos (${auto.map((i) => i.name).join(', ')}) para que no reboten.`);
  const movable = pr.out.filter((i) => i.kind === 'bill' && !i.autoDebit);
  if (movable.length) options.push(`Ver si podés pasar ${movable[0].name} para después del cobro sin recargo.`);
  return { ok: false, text: `El ${fmt(pr.minDate)} te faltarían cerca de ${money(pr.shortfall)} para cubrir tus pagos.`, options };
}

// ---------- plan para pagar un resumen de tarjeta ----------
export function cardPlan(s, card, item, pr = projection(s)) {
  const point = pr.points.find((p) => p.date === item.due) || pr.points[pr.points.length - 1];
  // plata disponible ese día antes de pagar este resumen
  const before = (point ? point.balance : pr.start) + item.amount;
  const fromSalary = Math.max(0, Math.min(item.amount, before));
  const fromSavings = item.amount - fromSalary;
  const tna = Number(card.tna) || 0;
  // financiar: interés mensual sobre lo que no pagás, más IVA (21%)
  const monthlyCost = tna ? (item.amount * (tna / 100) / 12) * 1.21 : 0;
  return { fromSalary, fromSavings, tna, monthlyCost };
}

const fmt = (iso) => { const d = parseISO(iso); return `${d.getDate()}/${d.getMonth() + 1}`; };
