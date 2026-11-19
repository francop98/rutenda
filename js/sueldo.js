// Sueldo: evolución nominal vs real, mejor mes y crecimiento.
// Cada cobro guarda el mes trabajado (periodo) y el concepto: sueldo, aguinaldo u
// otro extra del trabajo. El informe muestra la evolución mes a mes como una planilla.

import { money, pct, esc, monthName, monthKey, addMonthKey, num, todayISO, toISO, MONTHS_LONG } from './formato.js';
import { salaryStats, lastSalary, periodoDe, cobraAguinaldo, notaCobro } from './calculos.js';
import { lastIpc } from './datosvivos.js';
import { sprout, icon, screenHead, openModal, closeModal, toast, ojoMontos, taparMontos, borrarConDeshacer } from './interfaz.js';
import { uid } from './almacenamiento.js';
import { fechaDeCobro } from './feriados.js';
import { lessonCard } from './aprender.js';

const CONCEPTOS = [['sueldo', 'Cobro del mes'], ['aguinaldo', 'Aguinaldo'], ['otro', 'Otro extra del trabajo']];
const mesCap = (mk) => `${monthName(mk, true).replace(/^./, (c) => c.toUpperCase())} ${mk.slice(0, 4)}`;
const pctTxt = (v) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 1000) / 10).toLocaleString('es-AR')}%`);
/** Fecha de cobro sugerida para el sueldo de un mes trabajado (a mes vencido si cobrás en la primera quincena). */
function cobroDe(profile, periodo) {
  const [y, m] = periodo.split('-').map(Number);
  const sig = fechaDeCobro(profile, m === 12 ? y + 1 : y, m === 12 ? 0 : m);
  return sig.getDate() <= 15 ? sig : fechaDeCobro(profile, y, m - 1);
}
// cobros del trabajo: sueldo (type 'sueldo') y aguinaldo/extras (type 'extra' con laboral)
const delTrabajo = (s) => (s.incomes || []).filter((i) => i.type === 'sueldo' || i.laboral);
const conceptoDe = (i) => (i.type === 'sueldo' ? 'sueldo' : i.concepto || 'otro');

let anioInforme = '';
let informeAbierto = false;
document.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'sueldo-informe') informeAbierto = e.target.open; }, true);
function informe(s) {
  const sue = {}; const ext = {};
  for (const i of delTrabajo(s)) { const p = periodoDe(i); if (conceptoDe(i) === 'sueldo') sue[p] = (sue[p] || 0) + i.amount; else ext[p] = (ext[p] || 0) + i.amount; }
  const periodos = [...new Set([...Object.keys(sue), ...Object.keys(ext)])].sort();
  if (!Object.keys(sue).length) return '';
  const anios = [...new Set(periodos.map((p) => p.slice(0, 4)))].sort();
  const anio = anios.includes(anioInforme) ? anioInforme : anios[anios.length - 1];
  const orden = Object.keys(sue).sort();
  const filas = periodos.filter((p) => p.startsWith(anio)).map((p) => {
    const i = orden.indexOf(p); const ant = i > 0 ? sue[orden[i - 1]] : null;
    return { p, v: sue[p] || 0, ext: ext[p] || 0, dif: sue[p] && ant ? sue[p] - ant : null, var: sue[p] && ant ? sue[p] / ant - 1 : null };
  });
  const conSue = filas.filter((f) => f.v);
  // acumulado del año: contra diciembre del año anterior (o el primer mes cargado del año)
  const base = sue[`${Number(anio) - 1}-12`] ? { p: `${Number(anio) - 1}-12`, v: sue[`${Number(anio) - 1}-12`] } : conSue[0];
  const ult = conSue[conSue.length - 1];
  const acum = base && ult && ult.p !== base.p ? { pct: ult.v / base.v - 1, pesos: ult.v - base.v } : null;
  const mayor = filas.filter((f) => f.var != null).reduce((a, f) => (!a || f.var > a.var ? f : a), null);
  const totalAnio = filas.reduce((a, f) => a + f.v + f.ext, 0);
  // barras: aumento de cada mes
  const conVar = filas.filter((f) => f.var != null);
  const maxV = Math.max(0.01, ...conVar.map((f) => Math.abs(f.var)));
  const barras = conVar.length ? `<div class="barras inf-barras" style="grid-template-columns:repeat(${conVar.length},minmax(0,1fr))" role="img" aria-label="Aumento de cada mes">${conVar.map((f) => `<div class="barra-mes"><div class="barra-par"><span class="${f.var >= 0 ? 'b-ing' : 'b-gas'}${mayor && f.p === mayor.p ? ' top' : ''}" style="height:${Math.max(3, Math.round((Math.abs(f.var) / maxV) * 100))}%" title="${pctTxt(f.var)}"></span></div><span class="b-lbl">${monthName(f.p)}</span></div>`).join('')}</div>` : '';
  return `<div class="card" style="gap:10px">
    <div class="split"><strong>Informe de ${anio}</strong>${anios.length > 1 ? `<span class="chips">${anios.slice(-3).map((a) => `<button class="chip toggle" data-action="sueldoAnio" data-v="${a}" aria-pressed="${a === anio}">${a}</button>`).join('')}</span>` : ''}</div>
    <div class="stat-grid">
      <div class="stat"><span class="k">Aumento acumulado</span><span class="v">${acum ? pctTxt(acum.pct) : '—'}</span><span class="small muted">${acum ? `${money(acum.pesos)} desde ${monthName(base.p, true)}${base.p.slice(0, 4) !== anio ? ` ${base.p.slice(0, 4)}` : ''}` : 'Cargá más meses'}</span></div>
      <div class="stat"><span class="k">Mayor aumento</span><span class="v">${mayor ? pctTxt(mayor.var) : '—'}</span><span class="small muted">${mayor ? `en ${monthName(mayor.p, true)} (${money(mayor.dif)})` : ''}</span></div>
    </div>
    ${barras}
    <div class="tabla-inf" role="table" aria-label="Ingresos mes a mes">
      <div class="ti-fila ti-head" role="row"><span>Mes</span><span>Cobro</span><span>Aumento</span></div>
      ${filas.map((f) => `<div class="ti-fila" role="row"><span>${monthName(f.p, true).replace(/^./, (c) => c.toUpperCase())}${f.ext ? `<br><span class="small muted">+ ${money(f.ext)} extras</span>` : ''}</span><span><b>${f.v ? money(f.v) : '—'}</b></span><span class="${f.var > 0 ? 'pos' : f.var < 0 ? 'neg' : ''}">${pctTxt(f.var)}${f.dif ? `<br><span class="small muted">${f.dif > 0 ? '+' : '−'}${money(Math.abs(f.dif))}</span>` : ''}</span></div>`).join('')}
    </div>
    <div class="split small"><span>Total cobrado por el trabajo en ${anio} (con aguinaldo y extras)</span><b>${money(totalAnio)}</b></div>
  </div>`;
}

function salarioForm(s, mk, concepto = 'sueldo', i = null) {
  const last = lastSalary(s);
  const fecha = i ? i.date : toISO(cobroDe(s.profile, mk));
  return `<form class="form" data-submit="saveSalary">
      <input type="hidden" name="id" value="${esc(i ? i.id : '')}">
      <div class="field"><label for="sal-c">Concepto</label><select id="sal-c" name="concepto" data-change="salConcepto">${CONCEPTOS.filter(([v]) => v !== 'aguinaldo' || concepto === 'aguinaldo' || cobraAguinaldo(s)).map(([v, l]) => `<option value="${v}" ${v === concepto ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field" data-sal-det ${concepto === 'otro' ? '' : 'hidden'}><label for="sal-n">¿Qué es?</label><input id="sal-n" name="detalle" value="${esc(i && i.laboral && i.concepto === 'otro' ? i.note : '')}" placeholder="Ej: arreglo de sensores, bono, horas extra"></div>
      <div class="field"><label for="sal-a">Neto cobrado</label><input id="sal-a" name="amount" inputmode="decimal" value="${i ? String(i.amount).replace('.', ',') : concepto === 'sueldo' && last ? last.amount : ''}" placeholder="Ej: 900.000" required></div>
      <div class="field-row">
        <div class="field"><label for="sal-p">Mes al que corresponde</label><input id="sal-p" name="periodo" type="month" value="${mk}" required></div>
        <div class="field"><label for="sal-d">Fecha de cobro</label><input id="sal-d" name="date" type="date" value="${fecha}"></div>
      </div>
      <span class="hint">Si cobrás a mes vencido (por ejemplo, lo de octubre el 4 de noviembre), el mes es octubre.</span>
      <button class="btn primary block" type="submit">Guardar</button>
      ${concepto === 'sueldo' && !i ? '<button class="btn block" type="submit" name="otro" value="1">Guardar y cargar otro concepto del mismo mes</button>' : ''}
    </form>`;
}

function chart(series) {
  const pts = series.slice(-12);
  if (pts.length < 2) return '<p class="empty">Cargá al menos dos meses para ver la evolución.</p>';
  const W = 350; const H = 150; const pad = 10;
  const vals = pts.flatMap((p) => [p.nominal, p.real]);
  const min = Math.min(...vals) * 0.97; const max = Math.max(...vals) * 1.02;
  const x = (i) => pad + (i * (W - pad * 2)) / (pts.length - 1);
  const y = (v) => H - 10 - ((v - min) / (max - min || 1)) * (H - 24);
  const line = (k) => pts.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const labels = pts.map((p, i) => (i % 2 === pts.length % 2 || i === pts.length - 1 ? `<text x="${x(i)}" y="${H + 14}" text-anchor="middle" font-size="11" style="fill:${i === pts.length - 1 ? 'var(--ink)' : 'var(--muted)'}" font-weight="${i === pts.length - 1 ? 800 : 500}">${monthName(p.mk)}</text>` : '')).join('');
  return `<svg role="img" aria-label="Ingresos de los últimos ${pts.length} meses, nominal y real" viewBox="0 0 ${W} ${H + 20}" width="100%">
    <line x1="0" y1="${H - 4}" x2="${W}" y2="${H - 4}" style="stroke:var(--track)"/>
    <polyline points="${line('nominal')}" fill="none" stroke="#9A9DA3" stroke-width="2.5" stroke-dasharray="5 5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${line('real')}" fill="none" stroke="#1F6F4A" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(pts.length - 1)}" cy="${y(last.real)}" r="5" fill="#1F6F4A"/>
    <circle cx="${x(pts.length - 1)}" cy="${y(last.nominal)}" r="4" fill="#9A9DA3"/>
    ${labels}
  </svg>`;
}

export function render(s) {
  return `<section class="screen">
    ${screenHead('Tus ingresos', ojoMontos('sueldo'))}
    ${cuerpo(s)}
  </section>`;
}

/** Tu sueldo contra la inflación (también en Mi plata → Sueldo). */
export function cuerpo(s, clave = 'sueldo') {
  const st = salaryStats(s);
  const history = delTrabajo(s).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const nextMk = (() => { const ps = s.incomes.filter((i) => i.type === 'sueldo').map(periodoDe).sort(); return ps.length ? addMonthKey(ps[ps.length - 1], 1) : addMonthKey(monthKey(), -1); })();

  let reading = '';
  if (st) {
    const parts = [];
    if (st.streak >= 2) parts.push(`Le ganaste a la inflación ${st.streak} meses seguidos.`);
    else if (st.streak === 1) parts.push('Este mes le ganaste a la inflación.');
    else if (st.series.length > 1) parts.push('Este mes lo que cobrás perdió contra la inflación.');
    if (st.isBest) parts.push(`${MONTHS_LONG[Number(st.cur.mk.slice(5)) - 1][0].toUpperCase() + MONTHS_LONG[Number(st.cur.mk.slice(5)) - 1].slice(1)} es tu mejor mes en términos reales.`);
    if (st.toRecover > 0.005) parts.push(`Para volver a tu mejor mes (${monthName(st.best.mk, true)}) necesitás un aumento de ${pct(st.toRecover, 0, false)}: es un buen número para llevar a una negociación.`);
    if (s.rules.raiseHalf.on) parts.push(`Regla activa: el ${s.rules.raiseHalf.pct}% de cada aumento va a tus metas.`);
    reading = parts.join(' ');
  }

  return taparMontos(`
    ${st ? `
    <div class="card" style="gap:12px">
      <div class="topbar" style="align-items:flex-start;flex-wrap:wrap">
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
          <span class="small muted" style="font-weight:600">${monthName(st.cur.mk, true).replace(/^./, (c) => c.toUpperCase())} · neto</span>
          <span style="font-size:34px;font-weight:800;letter-spacing:-1px;line-height:1.1">${money(st.cur.nominal)}</span>
        </div>
        ${st.isBest ? '<span class="pill lime">Mejor mes real</span>' : ''}
      </div>
      ${chart(st.series)}
      <div class="legend"><span><i class="swatch" style="background:#1F6F4A"></i>Real (en pesos de hoy)</span><span class="muted"><i class="swatch" style="border-top:3px dashed #9A9DA3;height:0"></i>Nominal</span></div>
    </div>
    <div class="stat-grid three">
      <div class="stat three"><span class="k">Aumento ${st.span} meses</span><span class="v">${pct(st.nomGrowth, 0)}</span></div>
      <div class="stat three"><span class="k">Inflación ${st.span} meses</span><span class="v">${pct(st.inflation, 0)}</span></div>
      <div class="stat three"><span class="k">Crecimiento real</span><span class="v ${st.realGrowth >= 0 ? 'pos' : ''}">${pct(st.realGrowth)}</span></div>
    </div>
    <span class="small muted" style="margin-top:-6px">Inflación del INDEC, se actualiza sola${(() => {
      const l = lastIpc(s);
      const pend = l ? st.missing.filter((m) => m > l.mk).length : 0;
      return (l ? ` · último dato: ${monthName(l.mk, true)} ${l.mk.slice(0, 4)}.` : '.') + (pend ? ` ${pend === 1 ? 'El último mes se estima' : `Los últimos ${pend} meses se estiman`} hasta que el INDEC publique el dato.` : '');
    })()}</span>
    ${reading ? `<div class="card"><div class="tip-head"><span class="badge">${sprout(17)}</span><strong>Lo que dicen tus números</strong></div><p class="text">${esc(reading)}</p></div>` : ''}
    ` : '<div class="card"><p class="text">Cargá lo que cobraste los últimos meses y te muestro si le estás ganando a la inflación, tu mejor mes y cuánto creciste de verdad.</p></div>'}

    <div class="btn-row">
      <button class="btn primary" data-action="newSalary" data-mk="${nextMk}">Cargar cobro de ${monthName(nextMk, true)}</button>
      <button class="btn" data-action="newSalary" data-mk="${addMonthKey(nextMk, -1)}" data-concepto="otro" style="flex:0 0 auto">+ Extra</button>
    </div>
    <button class="btn small block" data-action="pastSalaries">${icon('calendar', 18)} Cargar meses anteriores</button>

    ${st || history.length ? `<details class="card plegable" id="sueldo-informe"${informeAbierto ? ' open' : ''}><summary><strong>Informe del año y tus cobros</strong> <span class="small muted">mes a mes, aumentos y total</span></summary>
    ${informe(s).replace('<div class="card" style="gap:10px">', '<div style="display:flex;flex-direction:column;gap:10px">')}
    ${history.length ? `<div class="section-title"><span>Últimos cobros</span></div>
    <div class="tight" style="display:flex;flex-direction:column">${history.map((i) => `<button class="row" data-action="editSalary" data-id="${i.id}"><span class="grow"><span class="name">${conceptoDe(i) === 'sueldo' ? 'Cobro' : conceptoDe(i) === 'aguinaldo' ? 'Aguinaldo' : esc(i.note || 'Extra')} de ${mesCap(periodoDe(i)).replace(/^./, (c) => c.toLowerCase())}</span><span class="meta">Cobrado el ${Number(i.date.slice(8))}/${Number(i.date.slice(5, 7))}</span></span><span class="amount">${money(i.amount)}</span></button>`).join('')}</div>` : ''}
    </details>` : ''}
  `, clave);
}

export const actions = {
  newSalary(ctx, el) {
    const mk = el.dataset.mk || addMonthKey(monthKey(), -1);
    const c = el.dataset.concepto || 'sueldo';
    openModal(c === 'sueldo' ? `Cobro de ${monthName(mk, true)}` : 'Extra del trabajo', salarioForm(ctx.state, mk, c));
  },
  editSalary(ctx, el) {
    const i = ctx.state.incomes.find((x) => x.id === el.dataset.id); if (!i) return;
    openModal('Cobro del trabajo', `${salarioForm(ctx.state, periodoDe(i), conceptoDe(i), i)}<button class="btn ghost block" data-action="borrarSalario" data-id="${esc(i.id)}">Borrar</button>`);
  },
  borrarSalario(ctx, el) { closeModal(); borrarConDeshacer(ctx, 'Cobro borrado', (s) => { s.incomes = s.incomes.filter((x) => x.id !== el.dataset.id); }); },
  salConcepto(ctx, el) { const f = el.closest('form'); f.querySelector('[data-sal-det]').hidden = el.value !== 'otro'; },
  sueldoAnio(ctx, el) { anioInforme = el.dataset.v; ctx.render(); },
  // varios meses de una: los últimos 12 que no tienen sueldo cargado
  pastSalaries(ctx) {
    const s = ctx.state;
    const loaded = new Set(s.incomes.filter((i) => i.type === 'sueldo').map((i) => i.date.slice(0, 7)));
    const months = [];
    for (let k = 1; k <= 12; k++) { const mk = addMonthKey(monthKey(), -k); if (!loaded.has(mk)) months.push(mk); }
    openModal('Meses anteriores', months.length ? `<form class="form" data-submit="savePastSalaries">
      <p class="text muted" style="margin:0">Completá los que te acuerdes (el neto que cobraste). Los que dejes vacíos no se cargan. Con más meses, mejor te muestro si le ganás a la inflación.</p>
      ${months.map((mk) => `<div class="field"><label for="ps-${mk}">${monthName(mk, true).replace(/^./, (c) => c.toUpperCase())} ${mk.slice(0, 4)}</label><input id="ps-${mk}" name="m_${mk}" inputmode="decimal" placeholder="Ej: 850.000"></div>`).join('')}
      <div class="field"><label for="ps-x">¿Es de un mes más viejo?</label><div class="field-row"><input id="ps-x" name="otherMonth" type="month" max="${addMonthKey(monthKey(), -1)}"><input name="otherAmount" inputmode="decimal" placeholder="Monto"></div></div>
      <button class="btn primary block" type="submit">Guardar</button></form>`
      : `<p class="text">Ya tenés cargados los cobros de los últimos 12 meses. Si querés uno más viejo, elegí el mes:</p>
      <form class="form" data-submit="savePastSalaries"><div class="field-row"><input name="otherMonth" type="month" max="${addMonthKey(monthKey(), -1)}" aria-label="Mes"><input name="otherAmount" inputmode="decimal" placeholder="Monto" aria-label="Monto"></div><button class="btn primary block" type="submit">Guardar</button></form>`);
  },
  savePastSalaries(ctx, d) {
    const fecha = (mk) => toISO(cobroDe(ctx.state.profile, mk));
    const add = Object.entries(d).filter(([k, v]) => k.startsWith('m_') && num(v)).map(([k, v]) => ({ mk: k.slice(2), amount: num(v) }));
    if (/^\d{4}-\d{2}$/.test(d.otherMonth || '') && num(d.otherAmount)) add.push({ mk: d.otherMonth, amount: num(d.otherAmount) });
    if (!add.length) { toast('Completá al menos un mes'); return; }
    ctx.commit((s) => {
      for (const x of add) {
        s.incomes = s.incomes.filter((i) => !(i.type === 'sueldo' && periodoDe(i) === x.mk));
        s.incomes.push({ id: uid(), date: fecha(x.mk), periodo: x.mk, amount: x.amount, type: 'sueldo', note: 'Sueldo', ...(s.cuentaSueldo ? { accountId: s.cuentaSueldo } : {}) });
      }
    });
    closeModal(); toast(add.length === 1 ? 'Cobro anotado' : `Anoté ${add.length} cobros`);
  },
  saveSalary(ctx, d) {
    const amount = num(d.amount);
    if (!amount) { toast('Poné cuánto cobraste'); return; }
    const periodo = /^\d{4}-\d{2}$/.test(d.periodo || '') ? d.periodo : '';
    const date = d.date || todayISO();
    const concepto = ['sueldo', 'aguinaldo', 'otro'].includes(d.concepto) ? d.concepto : 'sueldo';
    // corregir uno que ya estaba
    if (d.id) {
      ctx.commit((s) => {
        const i = s.incomes.find((x) => x.id === d.id); if (!i) return;
        Object.assign(i, { amount, date, ...(periodo ? { periodo } : {}) });
        if (concepto === 'sueldo') { i.type = 'sueldo'; i.note = notaCobro(s); delete i.laboral; delete i.concepto; }
        else { i.type = 'extra'; i.laboral = true; i.concepto = concepto; i.note = concepto === 'aguinaldo' ? 'Aguinaldo' : String(d.detalle || '').trim() || 'Extra del trabajo'; }
      });
      closeModal(); toast('Guardado'); return;
    }
    if (concepto !== 'sueldo') {
      ctx.commit((s) => { s.incomes.push({ id: uid(), date, ...(periodo ? { periodo } : {}), amount, type: 'extra', laboral: true, concepto, note: concepto === 'aguinaldo' ? 'Aguinaldo' : String(d.detalle || '').trim() || 'Extra del trabajo', ...(s.cuentaSueldo ? { accountId: s.cuentaSueldo } : {}) }); });
      closeModal(); toast(`${concepto === 'aguinaldo' ? 'Aguinaldo' : 'Extra'} cargado${periodo ? ` (${monthName(periodo, true)})` : ''}`); return;
    }
    const prev = lastSalary(ctx.state);
    const isLatest = !prev || date >= prev.date;
    let msg = 'Cobro anotado';
    ctx.commit((s) => {
      s.incomes.push({ id: uid(), date, ...(periodo ? { periodo } : {}), amount, type: 'sueldo', note: 'Sueldo', ...(s.cuentaSueldo ? { accountId: s.cuentaSueldo } : {}) });
      if (isLatest && prev && amount > prev.amount) {
        const raise = amount - prev.amount;
        msg = `Cobraste ${money(raise)} más que el mes anterior`;
        const g = s.goals.find((x) => x.main) || s.goals[0];
        const part = Math.round((raise * (s.rules.raiseHalf.pct || 50)) / 100);
        if (s.rules.raiseHalf.on && g) { g.monthly = (g.monthly || 0) + part; msg += `: sumé ${money(part)} al aporte mensual de "${g.name}"`; }
      }
    });
    if (d.otro === '1') { openModal('Extra del trabajo', salarioForm(ctx.state, periodo || addMonthKey(monthKey(), -1), 'otro')); toast(msg); return; }
    closeModal(); toast(msg);
  },
};
