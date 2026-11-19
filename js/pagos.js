// Por pagar: agenda de vencimientos y cobros, proyección de la plata hasta
// el cobro, alerta si no alcanza, vista calendario, totales por cuenta,
// historial de cumplimiento y recordatorios.

import { fijosHtml } from './movimientos.js';
import { fixedFormExt } from './movimientos.js';
import { money, esc, num, todayISO, parseISO, toISO, MONTHS, MONTHS_LONG, WEEKDAYS, addMonthKey, monthKey, addDays, startOfToday, monthDiff, monthName } from './formato.js';
import { allCategories, walletName } from './categorias.js';
import { payCycle } from './calculos.js';
import { agenda, agendaBetween, groups, pendingUntil, provisions, dueLabel, buildICS, REPEATS, repeatLabel, history, byAccount, statementDates, statementOf } from './agenda.js';
import { projection, coverage, inflows } from './flujo.js';
import { cuerpo as tarjetasCuerpo, actions as accTarjetas } from './tarjetas.js';
import { icon, screenHead, openModal, closeModal, toast, borrarConDeshacer , abrirSelectorMes, botonMes } from './interfaz.js';
import { lessonCard } from './aprender.js';
import { uid } from './almacenamiento.js';
import { fechaDeCobro, reglaDeCobro } from './feriados.js';
import { parseAmount, guessCategory } from './interprete.js';
import { mejorConTusMedios, diasTxt } from './reintegros.js';
import { listaCuentas } from './cuentas.js';

let view = 'lista'; // 'lista' | 'calendario' | 'tarjetas'
/** Abrir Por pagar en una pestaña (la ruta vieja #/tarjetas llega acá). */
export function renderVista(s, v) { view = v; return render(s); }
let showPaid = false;
let verMas = false; // la agenda muestra lo urgente; el resto, al tocar "Ver más"
let calOffset = 0;
const shortDate = (iso) => { const d = parseISO(iso); return `${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}`; };
const accountName = (id) => (id === 'efectivo' ? 'Efectivo' : walletName(id));

const montoAgenda = (it) => (it.amount ? `${it.estimated ? '≈ ' : ''}${money(it.amount)}` : 'A confirmar');
let estado = null;
// sugerencia: con cuál de tus medios conviene pagar este servicio
function sugerenciaPago(it) {
  if (!estado || it.paid || !it.amount || !['fixed', 'bill'].includes(it.kind)) return '';
  const o = mejorConTusMedios(estado, { texto: it.name, categoria: guessCategory(it.name, estado.learned), monto: it.amount });
  return o ? `<span class="small sug-pago">💡 Con ${esc(o.nombre)} te devuelven ${money(o.ahorro)} (${o.pct}%${o.dias && o.dias.length < 7 ? `, ${diasTxt(o.dias)}` : ''})</span>` : '';
}
function row(it) {
  const tone = it.paid ? 'ok' : it.overdue ? 'warn' : it.days <= 3 ? 'lime' : '';
  const label = it.kind === 'recordatorio' ? (it.paid ? 'Hecho' : it.days === 0 ? 'Hoy' : it.days === 1 ? 'Mañana' : it.days < 0 ? `Hace ${-it.days} días` : `En ${it.days} días`) : it.paid && it.paidInfo && it.paidInfo.auto ? 'Debitado' : dueLabel(it);
  return `<div class="row pay-row ${it.paid ? 'is-paid' : ''}">
    <span class="cat-icon ${it.kind === 'card' ? 'green' : ''}">${icon(it.icon, 18)}</span>
    <button class="grow" data-action="openPayment" data-key="${esc(it.key)}" style="background:none;border:none;text-align:left;padding:0">
      <span class="name">${esc(it.name)}</span>
      <span class="meta">${esc(it.sub)}${it.payWith ? ` · ${esc(accountName(it.payWith))}` : ''}</span>
      <span class="pill ${tone}" style="align-self:flex-start;margin-top:4px">${label}</span>
      ${sugerenciaPago(it)}
    </button>
    <span style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      ${it.kind === 'recordatorio' ? '' : `<span class="amount${it.amount ? '' : ' muted'}">${montoAgenda(it)}</span>`}
      ${it.paid ? '' : it.kind === 'recordatorio' ? `<button class="btn small" data-action="recordatorioListo" data-key="${esc(it.key)}" style="min-height:36px">Listo</button>` : it.autoDebit ? '<span class="small muted">Se debita solo</span>' : `<button class="btn small green" data-action="markPaid" data-key="${esc(it.key)}" style="min-height:36px">Pagué</button>`}
    </span>
  </div>`;
}

function inRow(i) {
  return `<div class="row">
    <span class="cat-icon green">${icon('up', 18)}</span>
    <span class="grow"><span class="name">${esc(i.name)}</span><span class="meta">${esc(i.sub || '')} · ${shortDate(i.date)}</span></span>
    <span style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><span class="amount pos">${i.estimated ? '≈ ' : ''}+${money(i.amount)}</span>
    ${i.kind === 'income' && i.date <= todayISO() ? `<button class="btn small" data-action="markReceived" data-key="${esc(i.key)}" style="min-height:36px">Lo cobré</button>` : ''}</span>
  </div>${i.kind === 'aguinaldo' && i.preguntar ? `<div class="aviso-sac small">¿Cobrás aguinaldo? Lo cobran quienes trabajan en relación de dependencia (no monotributistas ni autónomos).
    <span class="btn-row"><button class="btn small" data-action="setAguinaldo" data-v="si">Sí, lo cobro</button><button class="btn small" data-action="setAguinaldo" data-v="no">No cobro</button></span></div>` : ''}`;
}

function section(title, list, note = '') {
  if (!list.length) return '';
  const total = list.reduce((a, i) => a + i.amount, 0);
  return `<div class="section-title"><span>${title}</span><span class="small" style="font-weight:800;color:var(--ink)">${money(total)}</span></div>
    ${note ? `<span class="small muted" style="margin-top:-8px">${note}</span>` : ''}
    <div class="card tight">${list.map(row).join('')}</div>`;
}

// gráfico de la plata disponible día a día hasta el cobro
function chart(pr) {
  const pts = pr.points;
  if (pts.length < 2) return '';
  const W = 350; const H = 120; const pad = 8;
  const vals = pts.map((p) => p.balance);
  const min = Math.min(0, ...vals); const max = Math.max(...vals, 1);
  const x = (i) => pad + (i * (W - pad * 2)) / (pts.length - 1);
  const y = (v) => pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  const mi = pts.findIndex((p) => p.date === pr.minDate);
  const zero = y(0);
  return `<svg role="img" aria-label="Plata disponible estimada hasta el cobro" viewBox="0 0 ${W} ${H + 18}" width="100%">
    ${min < 0 ? `<rect x="0" y="${zero}" width="${W}" height="${H - zero}" fill="rgba(242,179,61,.18)"/>` : ''}
    <line x1="0" y1="${zero}" x2="${W}" y2="${zero}" stroke="rgba(255,255,255,.35)" stroke-dasharray="4 4"/>
    <polyline points="${line}" fill="none" stroke="#C6F36B" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => (p.out.length ? `<circle cx="${x(i)}" cy="${y(p.balance)}" r="3.5" fill="#FFFFFF"/>` : '')).join('')}
    ${mi >= 0 ? `<circle cx="${x(mi)}" cy="${y(pts[mi].balance)}" r="6" fill="${pts[mi].balance < 0 ? '#F2B33D' : '#C6F36B'}" stroke="#1F6F4A" stroke-width="2"/>` : ''}
    <text x="${pad}" y="${H + 14}" font-size="11" fill="#D6EBDF">Hoy</text>
    <text x="${W - pad}" y="${H + 14}" font-size="11" fill="#D6EBDF" text-anchor="end">Cobro ${shortDate(pr.until)}</text>
  </svg>`;
}

function calendar(s) {
  const mk = addMonthKey(monthKey(), calOffset);
  const [y, m] = mk.split('-').map(Number);
  const first = new Date(y, m - 1, 1); const last = new Date(y, m, 0);
  const items = agendaBetween(s, first, last);
  const ins = inflows(s, first, last);
  const payDay = reglaDeCobro(s.profile).tipo === 'varia' ? 0 : fechaDeCobro(s.profile, y, m - 1).getDate();
  const closes = (s.cards || []).map((c) => ({ c, d: statementDates(c, mk).close }));
  const today = todayISO();
  const cells = [];
  const lead = (first.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-cell empty"></span>');
  let heavy = 0;
  const totals = {};
  items.forEach((i) => { totals[i.due] = (totals[i.due] || 0) + i.amount; });
  const maxDay = Math.max(1, ...Object.values(totals));
  for (let d = 1; d <= last.getDate(); d++) {
    const iso = toISO(new Date(y, m - 1, d));
    const dayItems = items.filter((i) => i.due === iso);
    const dayIns = ins.filter((i) => i.date === iso);
    const isPay = d === payDay;
    const isClose = closes.some((c) => toISO(c.d) === iso);
    const load = totals[iso] ? totals[iso] / maxDay : 0;
    if (load > 0.5) heavy++;
    const dots = [
      ...dayItems.map((i) => `<i class="dot ${i.paid ? 'paid' : i.overdue ? 'late' : 'out'}"></i>`),
      ...(isPay || dayIns.length ? ['<i class="dot in"></i>'] : []),
      ...(isClose ? ['<i class="dot close"></i>'] : []),
    ].slice(0, 4).join('');
    cells.push(`<button class="cal-cell ${iso === today ? 'today' : ''} ${load > 0.5 ? 'heavy' : ''}" data-action="openDay" data-day="${iso}" aria-label="${d} de ${MONTHS_LONG[m - 1]}${dayItems.length ? `, ${dayItems.length} pagos` : ''}">
      <span class="n">${d}</span><span class="dots">${dots}</span></button>`);
  }
  return `<div class="card">
    <div class="month-nav" style="background:var(--bg)">
      <button class="icon-btn" data-action="calMove" data-d="-1" aria-label="Mes anterior">${icon('back', 18, 2.2)}</button>
      ${botonMes(mk, 'calElegirMes')}
      <button class="icon-btn" data-action="calMove" data-d="1" aria-label="Mes siguiente" style="transform:scaleX(-1)">${icon('back', 18, 2.2)}</button>
    </div>
    <div class="cal-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span class="cal-head">${d}</span>`).join('')}${cells.join('')}</div>
    <div class="legend small"><span><i class="dot out"></i>Vence</span><span><i class="dot in"></i>Cobro</span><span><i class="dot close"></i>Cierre de tarjeta</span><span><i class="dot late"></i>Vencido</span></div>
    ${heavy ? '<span class="small muted">Los días resaltados son los más cargados del mes.</span>' : ''}
  </div>`;
}

export function render(s) {
  estado = s;
  const items = agenda(s, 62);
  const g = groups(items);
  const cycle = payCycle(s);
  const untilPay = pendingUntil(items.filter((i) => !i.fromSavings), cycle.nextISO);
  const pr = projection(s);
  const cov = coverage(s, pr);
  const prov = provisions(s);
  // cobros que vienen: del sueldo, solo el próximo
  // solo lo que entra en lo que queda de este mes
  const ins = (() => { const t = startOfToday(); const fin = new Date(t.getFullYear(), t.getMonth() + 1, 0); let sal = false; return inflows(s, t, fin).filter((i) => (i.kind === 'salary' ? (sal ? false : (sal = true)) : true)); })();
  const weekItems = items.filter((i) => !i.paid && i.days <= 7);
  const accounts = byAccount(weekItems, accountName);
  const h = history(s);
  const empty = !items.length;

  return `<section class="screen">
    ${screenHead('Por pagar', view === 'tarjetas' ? '<button class="btn small" data-action="newCard">+ Tarjeta</button>' : view === 'fijos' ? '<button class="btn small" data-action="newFixed">+ Fijo</button>' : '<button class="btn small" data-action="agregarPorPagar">+ Agregar</button>', 'Vencimientos, tarjetas y cobros')}

    <div class="tabs" role="tablist" aria-label="Vista" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      <button role="tab" data-action="setPayView" data-v="lista" aria-pressed="${view === 'lista' || view === 'calendario'}">Agenda</button>
      <button role="tab" data-action="setPayView" data-v="fijos" aria-pressed="${view === 'fijos'}">Fijos</button>
      <button role="tab" data-action="setPayView" data-v="tarjetas" aria-pressed="${view === 'tarjetas'}">Tarjetas</button>
    </div>

    ${view === 'tarjetas' ? tarjetasCuerpo(s) : view === 'fijos' ? fijosHtml(s) : `

    <div class="card green" style="gap:6px;padding:20px">
      <span class="hero-label">Hasta tu próximo cobro (${shortDate(cycle.nextISO)}) tenés que pagar</span>
      <span style="font-size:34px;font-weight:800;letter-spacing:-1px">${money(untilPay)}</span>
      ${chart(pr)}
      <span class="small on-green-muted">${esc(cov.text)}${pr.estimated ? ' Estimado con lo que anotaste.' : ''}</span>
      ${pr.estimated ? '<button class="btn small" data-action="openClose" style="background:rgba(255,255,255,.14);color:#fff;border-color:transparent">Hacerlo exacto con mi saldo real</button>' : ''}
    </div>

    ${!cov.ok ? `<div class="card amber">
      <div class="tip-head"><span style="color:var(--amber)">${icon('bulb', 20)}</span><strong>Qué podés hacer</strong></div>
      ${cov.options.map((o) => `<p class="text">• ${esc(o)}</p>`).join('')}
    </div>` : ''}


    <div class="seg seg-mini" role="radiogroup" aria-label="Ver como">
      <button type="button" role="radio" data-action="setPayView" data-v="lista" aria-checked="${view === 'lista'}">${icon('menu', 15)} Lista</button>
      <button type="button" role="radio" data-action="setPayView" data-v="calendario" aria-checked="${view === 'calendario'}">${icon('calendar', 15)} Calendario</button>
    </div>
    ${view === 'calendario' ? calendar(s) : `
      ${empty ? `<div class="card"><strong>Todavía no hay pagos en tu agenda</strong>
        <p class="text muted">Acá aparecen solos tus gastos fijos y los resúmenes de tus tarjetas. Sumá también pagos que no son mensuales: patente, seguro, matrícula, impuestos.</p>
        <button class="btn green small" data-action="newBill">Agregar un pago</button></div>` : ''}
      ${section('Vencidos', g.overdue, '¿Ya los pagaste? Marcalos para que no te avise más.')}
      ${section('Hoy', g.today)}
      ${section('Esta semana', g.week)}
      ${verMas ? section('Más adelante', g.later) : ''}
      ${!verMas ? '' : ins.length ? `<div class="section-title"><span>Vas a cobrar este mes</span><button data-action="newIncome">+ Cobro</button></div><div class="card tight">${ins.map(inRow).join('')}</div>`
        : '<div class="section-title"><span>Vas a cobrar</span><button data-action="newIncome">+ Cobro</button></div><p class="small muted" style="margin:0">No tenés más cobros este mes.</p>'}
    `}

    ${verMas ? `
    ${accounts.length ? `<details class="card plegable"><summary><strong>Cuánto tener en cada cuenta</strong> <span class="small muted">esta semana</span></summary>
    <div class="tight">${accounts.map((a) => `<div class="row"><span class="cat-icon">${icon('wallet', 18)}</span><span class="grow"><span class="name">${esc(a.label)}</span><span class="meta">${a.items.map((i) => esc(i.name)).join(', ')}${a.auto ? ` · ${money(a.auto)} en débito automático` : ''}</span></span><span class="amount">${money(a.total)}</span></div>`).join('')}</div>
    <span class="small muted">Tené ese saldo en cada cuenta antes de cada vencimiento${accounts.some((a) => a.auto) ? ', así no rebota ningún débito' : ''}.</span></details>` : ''}

    ${prov.length ? `<details class="card plegable"><summary><strong>Ahorrando para pagos grandes</strong> <span class="small muted">${prov.length}</span></summary>
    <div class="tight">${prov.map((p) => `<div class="row"><span class="grow"><span class="name">${esc(p.bill.name)}</span><span class="meta">${money(p.bill.amount)} el ${shortDate(p.due)} · faltan ${p.months} meses</span></span><span style="display:flex;flex-direction:column;align-items:flex-end"><span class="amount">${money(p.monthly)}</span><span class="small muted">por mes</span></span></div>`).join('')}</div>
    <span class="small muted">Ya está incluido en tu ahorro del mes: así cuando llegue el pago, la plata está.</span></details>` : ''}

    ${h.total || h.increases.length ? `<details class="card plegable"><summary><strong>Tu historial de pagos</strong>${h.total ? ` <span class="small muted">${h.onTime} de ${h.total} a tiempo</span>` : ''}</summary>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${h.total ? `<div class="stat-grid three" style="gap:8px">
        <div class="quote"><span class="k">Racha a tiempo</span><span class="v">${h.streak} ${h.streak === 1 ? 'pago' : 'pagos'}</span></div>
        <div class="quote"><span class="k">A tiempo</span><span class="v">${h.onTime} de ${h.total}</span></div>
        <div class="quote"><span class="k">Con atraso</span><span class="v">${h.late}</span></div>
      </div>` : ''}
      ${h.increases.map((i) => `<span class="small"><b>${esc(i.name)}</b> subió ${Math.round((i.to / i.from - 1) * 100)}% (de ${money(i.from)} a ${money(i.to)}). Vale la pena comparar opciones.</span>`).join('')}
      ${h.late ? '<span class="small muted">Pagar a término evita recargos e intereses por mora.</span>' : h.total ? '<span class="small muted">¡Bien! Pagar a término te ahorra recargos e intereses.</span>' : ''}
    </div></details>` : ''}

    ${g.paid.length ? `<button class="btn small" data-action="togglePaid">${showPaid ? 'Ocultar' : 'Ver'} pagados (${g.paid.length})</button>${showPaid ? `<div class="card tight">${g.paid.map(row).join('')}</div>` : ''}` : ''}

    <details class="card plegable"><summary><strong>Programados, recordatorios y avisos</strong></summary>
      <p class="text muted" style="margin:0">Sumá todos tus vencimientos al calendario del celular: te avisa el día anterior y el mismo día, aunque no abras la app.</p>
      <div class="btn-row">
        <button class="btn small green" data-action="downloadICS">${icon('calendar', 18)} Agregar al calendario</button>
        <button class="btn small" data-action="enableNotifications">Avisos en este dispositivo</button>
      </div>

    ${(s.bills || []).length ? `<div class="section-title"><span>Tus pagos programados</span></div>
    <div class="card tight">${s.bills.map((b) => `<button class="row" data-action="editBill" data-id="${b.id}"><span class="grow"><span class="name">${esc(b.name)}</span><span class="meta">${repeatLabel(b.repeat, b)} · desde el ${shortDate(b.date)}${b.saveAhead ? ' · ahorrando de a poco' : ''}${b.autoDebit ? ' · débito automático' : ''}</span></span><span class="amount">${money(b.amount)}</span></button>`).join('')}</div>` : ''}

    <div class="section-title"><span>Tus recordatorios</span><button data-action="newRecordatorio">+ Recordatorio</button></div>
    ${(s.recordatorios || []).length ? `<div class="card tight">${s.recordatorios.map((r) => `<button class="row" data-action="editRecordatorio" data-id="${esc(r.id)}"><span class="cat-icon">${icon('bell', 18)}</span><span class="grow"><span class="name">${esc(r.name)}</span><span class="meta">${r.repeat && r.repeat !== 'once' ? `${repeatLabel(r.repeat, r)} · desde el ` : ''}${shortDate(r.date)}${r.nota ? ` · ${esc(r.nota)}` : ''}</span></span>${icon('chevron', 16)}</button>`).join('')}</div>`
      : '<p class="small muted" style="margin:0">Para lo que no es un pago: mover la plata antes de un débito, llamar para pedir un descuento, renovar algo. Te aviso ese día.</p>'}
    ${(s.expectedIncomes || []).length ? `<div class="section-title"><span>Tus cobros programados</span></div>
    <div class="card tight">${s.expectedIncomes.map((c) => `<button class="row" data-action="editIncome" data-id="${c.id}"><span class="grow"><span class="name">${esc(c.name)}</span><span class="meta">${repeatLabel(c.repeat, c)} · desde el ${shortDate(c.date)}</span></span><span class="amount pos">+${money(c.amount)}</span></button>`).join('')}</div>` : ''}
    </details>
    <button class="btn block" data-action="pagosVerMas">Ver menos</button>` : `<button class="btn block" data-action="pagosVerMas">${g.later.length ? `Ver lo que viene después (${g.later.length} ${g.later.length === 1 ? 'pago' : 'pagos'} · ${money(g.later.reduce((x, i) => x + i.amount, 0))})` : 'Ver más'}<br><span class="small muted" style="font-weight:500">Y los cobros que vienen</span></button>`}

    `}
  </section>`;
}

const payOptions = (s, sel) => `<option value="">Sin asignar</option>${listaCuentas(s).map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}`;
export { payOptions };

// "Personalizado": cada N días, semanas o meses
const repetirCustom = (x) => `<div class="field-row repetir-custom" ${x.repeat === 'custom' ? '' : 'hidden'}>
  <div class="field"><label>Cada</label><input name="everyN" inputmode="numeric" value="${(x.every && x.every.n) || ''}" placeholder="Ej: 10"></div>
  <div class="field"><label>Unidad</label><select name="everyUnit">${[['dias', 'Días'], ['semanas', 'Semanas'], ['meses', 'Meses']].map(([v, l]) => `<option value="${v}" ${(x.every && x.every.unit) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>`;
// descuento por un tiempo (servicios, celular, internet…) y aviso para pedir otro
export function descuentoCampos(x = {}, o = {}) {
  const dsc = x.desc || null;
  return `<details class="reint-box"${dsc ? ' open' : ''}><summary><span>🏷️ ${o.titulo || 'Descuento por un tiempo'}</span><span class="small muted">${dsc ? `hasta ${dsc.hasta.split('-').reverse().join('/')}` : 'Opcional'}</span></summary>
    <span class="small muted">${o.ayuda || 'Por ejemplo: "50% en el celular por 6 meses". Mientras dure, cuento el monto con descuento; después, el normal.'}</span>
    <div class="field-row">
      <div class="field"><label for="ds-m">${o.monto || 'Monto con descuento'}</label><input id="ds-m" name="descMonto" inputmode="decimal" value="${dsc ? dsc.monto : ''}" placeholder="Ej: 12.000"></div>
      <div class="field"><label for="ds-h">${o.hasta || 'Último mes con descuento'}</label><input id="ds-h" name="descHasta" type="month" value="${esc(dsc ? dsc.hasta : '')}"></div>
    </div>
    <div class="field"><label for="ds-a">${o.avisar || 'Recordarme pedir otro descuento el'}</label><input id="ds-a" name="descAvisar" type="date" value="${esc(dsc ? dsc.avisar || '' : '')}"><span class="hint">Si lo dejás vacío, te aviso el día 1 del último mes${o.titulo ? '' : ' con descuento'}.</span></div>
    ${dsc ? `<label class="check"><input type="checkbox" name="descQuitar"> <span>${o.quitar || 'Quitar el descuento'}</span></label>` : ''}
  </details>`;
}
export function descuentoDe(d) {
  if (d.descQuitar) return null;
  const monto = num(d.descMonto); const hasta = /^\d{4}-\d{2}$/.test(d.descHasta || '') ? d.descHasta : '';
  if (!hasta || !(monto >= 0) || d.descMonto === '' || d.descMonto === undefined) return undefined; // sin cambios
  return { monto, hasta, avisar: /^\d{4}-\d{2}-\d{2}$/.test(d.descAvisar || '') ? d.descAvisar : `${hasta}-01` };
}

function recordatorioForm(r = {}) {
  return `<form class="form" data-submit="guardarRecordatorio">
    <input type="hidden" name="id" value="${esc(r.id || '')}">
    <p class="text muted" style="margin:0">Para lo que no es un pago pero no te podés olvidar: mover la plata de una cuenta antes de un débito, llamar para pedir un descuento, renovar algo.</p>
    <div class="field"><label for="rc-n">¿Qué tenés que hacer?</label><input id="rc-n" name="name" value="${esc(r.name || '')}" placeholder="Ej: Pasar plata a la cuenta del préstamo" required maxlength="80"></div>
    <div class="field-row">
      <div class="field"><label for="rc-d">¿Cuándo?</label><input id="rc-d" name="date" type="date" value="${esc(r.date || todayISO())}" required></div>
      <div class="field"><label for="rc-r">Se repite</label><select id="rc-r" name="repeat" data-change="repeatChanged">${REPEATS.map((x) => `<option value="${x.id}" ${x.id === (r.repeat || 'once') ? 'selected' : ''}>${x.label}</option>`).join('')}</select></div>
    </div>
    ${repetirCustom(r)}
    <div class="field"><label for="rc-t">Nota (opcional)</label><input id="rc-t" name="nota" value="${esc(r.nota || '')}" placeholder="Ej: antes del día 5, que se debita el crédito" maxlength="120"></div>
    <span class="hint">Te aviso ese día en el celular si tenés los avisos activados.</span>
    <button class="btn primary block" type="submit">Guardar</button>
    ${r.id ? `<button class="btn ghost block" type="button" data-action="borrarRecordatorio" data-id="${esc(r.id)}">Borrar</button>` : ''}
  </form>`;
}

const everyDe = (d) => (d.repeat === 'custom' ? { n: Math.max(1, parseInt(d.everyN, 10) || 1), unit: ['dias', 'semanas', 'meses'].includes(d.everyUnit) ? d.everyUnit : 'dias' } : null);

function billForm(s, b = {}) {
  return `<form class="form" data-submit="saveBill">
    <input type="hidden" name="id" value="${esc(b.id || '')}">
    <div class="field"><label for="bl-n">¿Qué tenés que pagar?</label><input id="bl-n" name="name" value="${esc(b.name || '')}" placeholder="Ej: Patente, seguro del auto, matrícula" required></div>
    <div class="field-row">
      <div class="field"><label for="bl-a">Monto${b.variable ? ' aproximado' : ''}</label><input id="bl-a" name="amount" inputmode="decimal" value="${b.amount || ''}" placeholder="Ej: 45.000"></div>
      <div class="field"><label for="bl-d">Vence el</label><input id="bl-d" name="date" type="date" value="${b.date || todayISO()}" required></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="bl-r">Se repite</label><select id="bl-r" name="repeat" data-change="repeatChanged">${REPEATS.map((r) => `<option value="${r.id}" ${r.id === (b.repeat || 'once') ? 'selected' : ''}>${r.label}</option>`).join('')}</select></div>
      <div class="field"><label for="bl-c">Categoría</label><select id="bl-c" name="category">${allCategories().map((c) => `<option value="${c.id}" ${c.id === (b.category || 'otros') ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
    </div>
    ${repetirCustom(b)}
    <label class="check"><input type="checkbox" name="variable" ${b.variable ? 'checked' : ''}> <span>El monto cambia cada vez<br><span class="small muted">Por ejemplo, impuestos o servicios por consumo. Si no sabés cuánto va a ser, dejá el monto vacío: aparece "a confirmar" y, cuando marques "Pagué", te pregunto cuánto fue. Lo que pagaste queda como referencia para la próxima.</span></span></label>
    ${descuentoCampos(b)}
    <div class="field"><label for="bl-w">Se paga con</label><select id="bl-w" name="payWith">${payOptions(s, b.payWith)}</select></div>
    <label class="check"><input type="checkbox" name="autoDebit" ${b.autoDebit ? 'checked' : ''}> <span>Débito automático<br><span class="small muted">Se marca como pagado solo el día del vencimiento. Te aviso que tengas saldo.</span></span></label>
    <label class="check"><input type="checkbox" name="saveAhead" ${b.saveAhead ? 'checked' : ''}> <span>Ahorrar de a poco para este pago<br><span class="small muted">Ideal para pagos grandes: lo divido en los meses que faltan y lo sumo a tu ahorro.</span></span></label>
    <button class="btn primary block" type="submit">Guardar</button>
    ${b.id ? `<button class="btn ghost block" type="button" data-action="deleteBill" data-id="${b.id}">Borrar</button>` : ''}
  </form>`;
}

function incomeForm(c = {}) {
  return `<form class="form" data-submit="saveIncome">
    <input type="hidden" name="id" value="${esc(c.id || '')}">
    <p class="text muted">Para cobros aparte de tu ingreso de cada mes: un alquiler que cobrás, un trabajo, una venta en cuotas. Tu cobro del mes (y el aguinaldo, si te corresponde) los estimo solo.</p>
    <div class="field"><label for="in-n">¿Qué vas a cobrar?</label><input id="in-n" name="name" value="${esc(c.name || '')}" placeholder="Ej: Alquiler del departamento" required></div>
    <div class="field-row">
      <div class="field"><label for="in-a">Monto</label><input id="in-a" name="amount" inputmode="decimal" value="${c.amount || ''}" placeholder="Ej: 250.000" required></div>
      <div class="field"><label for="in-d">Fecha</label><input id="in-d" name="date" type="date" value="${c.date || todayISO()}" required></div>
    </div>
    <div class="field"><label for="in-r">Se repite</label><select id="in-r" name="repeat" data-change="repeatChanged">${REPEATS.map((r) => `<option value="${r.id}" ${r.id === (c.repeat || 'monthly') ? 'selected' : ''}>${r.label}</option>`).join('')}</select></div>
      ${repetirCustom(c)}
    <button class="btn primary block" type="submit">Guardar</button>
    ${c.id ? `<button class="btn ghost block" type="button" data-action="deleteIncome" data-id="${c.id}">Borrar</button>` : ''}
  </form>`;
}

function findItem(s, key) { return agenda(s, 400).find((i) => i.key === key); }

export const STOP_DEBIT_TXT = 'Es pedirle al banco que <b>no debite</b> un pago que tenés adherido a débito automático, solo por ese vencimiento. Se pide desde el home banking o la app del banco (suele estar en "Débitos automáticos" → "Stop debit"), normalmente hasta el día hábil anterior al vencimiento. Sirve si querés pagarlo vos (por ejemplo, desde otra cuenta o en otra fecha) o si el importe está mal y lo vas a reclamar. Ojo: el vencimiento sigue corriendo, así que tenés que pagarlo igual. En Pesitos, al marcarlo, ese mes no lo doy por debitado y queda pendiente hasta que toques "Pagué". Los meses siguientes vuelve el débito automático.';

// ---------- historial de pagos de un gasto fijo ----------
// Lo que pagaste de verdad cada mes (no estimaciones): fecha, importe, con qué,
// empresa, cuotas que quedaban, dólares y cotización, observación, y cuánto
// varió contra el pago anterior. Si cargaste cuánto suele subir por mes, marca
// lo que se sale de lo normal.
const pct1 = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 1000) / 10).toLocaleString('es-AR')}%`;
const nfUsd = (v) => `US$ ${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
export function pagosDeFijo(s, f) {
  const pre = `fixed:${f.id}:`;
  const l = Object.entries(s.paid || {}).filter(([k, p]) => k.startsWith(pre) && p && Number(p.amount) > 0)
    .map(([k, p]) => ({ key: k, mk: k.slice(pre.length), ...p, amount: Number(p.amount) })).sort((a, b) => a.mk.localeCompare(b.mk));
  l.forEach((x, i) => { x.vari = i ? x.amount / l[i - 1].amount - 1 : null; });
  const esp = Number(f.varEsperada);
  l.forEach((x) => { x.raro = esp > 0 && x.vari != null && Math.abs(x.vari * 100 - esp) > 1; });
  return l;
}
const MES_CAP = (mk) => `${monthName(mk, true).replace(/^./, (c) => c.toUpperCase())} ${mk.slice(0, 4)}`;
function historialHtml(s, f) {
  const l = pagosDeFijo(s, f);
  const anio = monthKey().slice(0, 4);
  const delAnio = l.filter((x) => x.mk.startsWith(anio));
  const esp = Number(f.varEsperada);
  const filas = [...l].reverse().map((x) => `<button class="row" data-action="editarPagoHist" data-key="${esc(x.key)}">
      <span class="grow"><span class="name">${MES_CAP(x.mk)}</span>
        <span class="meta">${[x.date ? `pagado el ${shortDate(x.date)}` : '', x.account ? esc(accountName(x.account)) : '', x.empresa ? esc(x.empresa) : '', x.quedan != null ? `quedan ${x.quedan} cuota${x.quedan === 1 ? '' : 's'}` : '', x.usd ? `${nfUsd(x.usd)} a $${Number(x.rate || x.amount / x.usd).toLocaleString('es-AR', { maximumFractionDigits: 2 })}` : ''].filter(Boolean).join(' · ')}</span>
        ${x.nota ? `<span class="meta">📝 ${esc(x.nota)}</span>` : ''}</span>
      <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span class="amount">${money(x.amount)}</span>${x.vari != null ? `<span class="pill ${x.raro ? 'warn' : ''}">${pct1(x.vari)}${x.raro ? ' · fuera de lo normal' : ''}</span>` : ''}</span>
    </button>`).join('');
  return `<div data-hist="${esc(f.id)}" style="display:flex;flex-direction:column;gap:10px">
    <div class="stat-grid">
      <div class="stat"><span class="k">Pagado en ${anio}</span><span class="v">${money(delAnio.reduce((a, x) => a + x.amount, 0))}</span><span class="small muted">${delAnio.length} pago${delAnio.length === 1 ? '' : 's'}</span></div>
      <div class="stat"><span class="k">${esp > 0 ? 'Aumento normal' : 'Último cambio'}</span><span class="v">${esp > 0 ? `${String(esp).replace('.', ',')}% por mes` : l.length > 1 ? pct1(l[l.length - 1].vari) : '—'}</span><span class="small muted">${esp > 0 ? 'te marco lo que se aleja más de 1 punto' : 'contra el pago anterior'}</span></div>
    </div>
    ${filas ? `<div class="card tight">${filas}</div>` : '<p class="empty">Todavía no hay pagos registrados. Se anotan cuando marcás "Pagué" o registrás lo que te debitaron.</p>'}
    <button class="btn small block" data-action="nuevoPagoHist" data-id="${esc(f.id)}">+ Cargar un pago anterior</button>
    <span class="small muted">Tocá un pago para corregirlo o agregarle una observación. No calculo pagos futuros: solo registro lo que pagaste.</span>
  </div>`;
}
function pagoHistForm(s, f, key, p = {}) {
  const mk = key ? key.split(':')[2] : addMonthKey(monthKey(), -1);
  return `<form class="form" data-submit="guardarPagoHist"><input type="hidden" name="id" value="${esc(f.id)}"><input type="hidden" name="key" value="${esc(key || '')}">
    ${key ? `<p class="small muted" style="margin:0">${MES_CAP(mk)}</p>` : `<div class="field"><label for="ph-m">Mes</label><input id="ph-m" name="mk" type="month" value="${mk}" max="${monthKey()}" required></div>`}
    <div class="field-row"><div class="field"><label for="ph-a">Importe</label><input id="ph-a" name="amount" inputmode="decimal" value="${p.amount ? String(p.amount).replace('.', ',') : ''}" required placeholder="Lo que pagaste o te debitaron"></div>
      <div class="field"><label for="ph-d">Fecha</label><input id="ph-d" name="date" type="date" value="${esc(p.date || '')}" max="${todayISO()}"></div></div>
    ${f.usd || p.usd ? `<div class="field"><label for="ph-u">En dólares</label><input id="ph-u" name="usd" inputmode="decimal" value="${p.usd ? String(p.usd).replace('.', ',') : f.usd ? String(f.usd).replace('.', ',') : ''}"><span class="hint">Con esto calculo a qué cotización te lo cobraron.</span></div>` : ''}
    ${f.totalCuotas || p.quedan != null ? `<div class="field"><label for="ph-q">Cuotas que quedaban después de este pago</label><input id="ph-q" name="quedan" inputmode="numeric" value="${p.quedan != null ? p.quedan : ''}"></div>` : ''}
    <div class="field-row"><div class="field"><label for="ph-c">Con qué</label><select id="ph-c" name="account">${payOptions(s, p.account || f.payWith || '').replace('Sin asignar', 'No sé / no importa')}</select></div>
      <div class="field"><label for="ph-e">Empresa</label><input id="ph-e" name="empresa" value="${esc(p.empresa != null ? p.empresa : f.empresa || '')}" placeholder="Opcional"></div></div>
    <div class="field"><label for="ph-n">Observación</label><input id="ph-n" name="nota" value="${esc(p.nota || '')}" placeholder="Ej: me descontaron por reclamo"></div>
    <button class="btn primary block" type="submit">Guardar</button>
    ${key ? `<button class="btn ghost block" type="button" data-action="borrarPagoHist" data-key="${esc(key)}" data-id="${esc(f.id)}">Borrar este registro</button>` : ''}
  </form>`;
}
// datos extra de un pago (observación, dólares, empresa, cuotas que quedan)
function extrasPago(s, it, d = {}) {
  const out = {};
  if (String(d.nota || '').trim()) out.nota = String(d.nota).trim().slice(0, 200);
  if (it && it.kind === 'fixed') {
    const f = s.fixed.find((x) => x.id === it.refId);
    if (f) {
      if (f.empresa) out.empresa = f.empresa;
      if (f.endMonth) out.quedan = Math.max(0, monthDiff(it.key.split(':')[2], f.endMonth));
      const usd = num(d.usd) || (f.usd ? Number(f.usd) : 0);
      if (usd > 0) out.usd = usd;
    }
  }
  return out;
}

export const actions = {
  repeatChanged(ctx, el) { const c = el.closest('form')?.querySelector('.repetir-custom'); if (c) c.hidden = el.value !== 'custom'; },
  setPayView(ctx, el) { view = el.dataset.v; ctx.render(); },
  calMove(ctx, el) { calOffset += Number(el.dataset.d); ctx.render(); },
  calElegirMes() { const hoy = monthKey(); abrirSelectorMes({ actual: addMonthKey(hoy, calOffset), min: addMonthKey(hoy, -240), max: addMonthKey(hoy, 60), accion: 'calIrMes' }); },
  calIrMes(ctx, el) { calOffset = monthDiff(monthKey(), el.dataset.mk); view = 'calendario'; closeModal(); ctx.render(); },
  openDay(ctx, el) {
    const iso = el.dataset.day; const d = parseISO(iso);
    const items = agendaBetween(ctx.state, d, d);
    const ins = inflows(ctx.state, d, d);
    const closes = (ctx.state.cards || []).filter((c) => toISO(statementDates(c, statementOf(c, iso)).close) === iso);
    openModal(`${WEEKDAYS[d.getDay()][0].toUpperCase() + WEEKDAYS[d.getDay()].slice(1)} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`,
      `${items.length ? `<div class="card tight">${items.map(row).join('')}</div>` : ''}
       ${ins.length ? `<div class="card tight">${ins.map(inRow).join('')}</div>` : ''}
       ${closes.map((c) => `<div class="card"><strong>Cierra la tarjeta ${esc(c.name)}</strong><span class="text muted">Lo que compres desde mañana entra en el resumen siguiente.</span></div>`).join('')}
       ${!items.length && !ins.length && !closes.length ? '<p class="empty">Nada para este día.</p>' : ''}
       <button class="btn small" data-action="newBill" data-date="${iso}">+ Agendar un pago este día</button>
       <button class="btn small" data-action="newRecordatorio" data-date="${iso}">+ Recordatorio este día</button>`);
  },
  togglePaid(ctx) { showPaid = !showPaid; ctx.render(); },
  pagosVerMas(ctx) { verMas = !verMas; ctx.render(); },
  agregarPorPagar(ctx) {
    const op = (a, ic, t, d) => `<button class="row" data-action="${a}" data-push="1"><span class="cat-icon green">${icon(ic, 18)}</span><span class="grow"><span class="name">${t}</span><span class="meta">${d}</span></span>${icon('chevron', 16)}</button>`;
    openModal('¿Qué querés agregar?', `<div class="card tight">
      ${op('newBill', 'calendar', 'Un pago', 'Algo que vence: patente, seguro, matrícula, impuestos. Una vez o cada tanto.')}
      ${op('newFixed', 'repeat', 'Un gasto fijo', 'Lo que pagás todos los meses: alquiler, servicios, prepaga.')}
      ${op('newRecordatorio', 'bell', 'Un recordatorio', 'Un aviso sin monto: renovar el DNI, llamar al banco, dar de baja algo.')}
      ${(ctx.state.cards || []).length ? op('nuevaCompraTarjeta', 'card', 'Una compra con tarjeta', 'En una o en cuotas: te muestro en qué resumen cae.') : ''}
    </div>`);
  },
  newBill(ctx, el) { openModal('Nuevo pago', billForm(ctx.state, el && el.dataset.date ? { date: el.dataset.date } : {}), { push: !!(el && el.dataset && el.dataset.push) }); },
  editBill(ctx, el) { const b = (ctx.state.bills || []).find((x) => x.id === el.dataset.id); if (b) openModal('Editar pago', billForm(ctx.state, b)); },
  saveBill(ctx, d) {
    const amount = num(d.amount);
    const variable = !!d.variable || !amount;
    if (!String(d.name || '').trim()) { toast('Completá qué pagás'); return; }
    if (!amount && d.saveAhead) { toast('Para ahorrar de a poco necesito un monto, aunque sea aproximado'); return; }
    ctx.commit((s) => {
      s.bills = s.bills || [];
      const data = { name: d.name.trim(), amount, variable, date: d.date, repeat: d.repeat, every: everyDe(d), category: d.category, payWith: d.payWith || '', autoDebit: !!d.autoDebit, saveAhead: !!d.saveAhead };
      const dsc = descuentoDe(d); if (dsc !== undefined) data.desc = dsc;
      const b = s.bills.find((x) => x.id === d.id);
      if (b) { if (b.amount !== amount) data.lastAmount = b.amount; Object.assign(b, data); } else s.bills.push({ id: uid(), ...data });
    });
    closeModal(); toast('Pago agendado: te aviso antes del vencimiento');
  },
  deleteBill(ctx, el) { closeModal(); borrarConDeshacer(ctx, 'Pago borrado', (s) => { s.bills = s.bills.filter((b) => b.id !== el.dataset.id); }); },

  newIncome() { openModal('Nuevo cobro', incomeForm()); },
  setAguinaldo(ctx, el) { ctx.commit((s) => { s.profile.aguinaldo = el.dataset.v === 'si'; }); toast(el.dataset.v === 'si' ? 'Listo: lo sumo en junio y diciembre' : 'Listo: no te cuento el aguinaldo'); },
  editIncome(ctx, el) { const c = (ctx.state.expectedIncomes || []).find((x) => x.id === el.dataset.id); if (c) openModal('Editar cobro', incomeForm(c)); },
  saveIncome(ctx, d) {
    const amount = num(d.amount);
    if (!amount || !String(d.name || '').trim()) { toast('Completá qué cobrás y el monto'); return; }
    ctx.commit((s) => {
      s.expectedIncomes = s.expectedIncomes || [];
      const data = { name: d.name.trim(), amount, date: d.date, repeat: d.repeat, every: everyDe(d) };
      const c = s.expectedIncomes.find((x) => x.id === d.id);
      if (c) Object.assign(c, data); else s.expectedIncomes.push({ id: uid(), ...data });
    });
    closeModal(); toast('Cobro agendado');
  },
  deleteIncome(ctx, el) { closeModal(); borrarConDeshacer(ctx, 'Cobro borrado', (s) => { s.expectedIncomes = s.expectedIncomes.filter((c) => c.id !== el.dataset.id); }); },
  markReceived(ctx, el) {
    const key = el.dataset.key;
    const it = inflows(ctx.state, addDays(startOfToday(), -62), startOfToday()).find((i) => i.key === key);
    if (!it) return;
    ctx.commit((s) => {
      s.received = s.received || {};
      s.received[key] = { date: todayISO(), amount: it.amount };
      s.incomes.push({ id: uid(), date: it.date, amount: it.amount, type: 'extra', note: it.name });
    });
    toast(`${it.name}: cobrado`);
  },

  newRecordatorio(ctx, el) { openModal('Nuevo recordatorio', recordatorioForm(el && el.dataset.date ? { date: el.dataset.date } : {}), { push: !!(el && (el.dataset.date || el.dataset.push)) }); },
  guardarRecordatorio(ctx, d) {
    if (!String(d.name || '').trim()) { toast('Escribí qué tenés que hacer'); return; }
    ctx.commit((s) => {
      s.recordatorios = s.recordatorios || [];
      const datos = { name: d.name.trim(), date: d.date, repeat: d.repeat || 'once', every: everyDe(d), nota: String(d.nota || '').trim() };
      const r = s.recordatorios.find((x) => x.id === d.id);
      if (r) Object.assign(r, datos); else s.recordatorios.push({ id: uid(), ...datos });
    });
    closeModal(); toast('Recordatorio guardado');
  },
  editRecordatorio(ctx, el) { const r = (ctx.state.recordatorios || []).find((x) => x.id === el.dataset.id); if (r) openModal('Recordatorio', recordatorioForm(r)); },
  borrarRecordatorio(ctx, el) { closeModal(); borrarConDeshacer(ctx, 'Recordatorio borrado', (s) => { s.recordatorios = (s.recordatorios || []).filter((x) => x.id !== el.dataset.id); }); },
  recordatorioListo(ctx, el) {
    ctx.commit((s) => { s.paid = s.paid || {}; s.paid[el.dataset.key] = { date: todayISO(), amount: 0 }; });
    toast('¡Hecho!');
  },
  openPayment(ctx, el) {
    const it = findItem(ctx.state, el.dataset.key);
    if (!it) return;
    if (it.kind === 'recordatorio') {
      if (it.key.startsWith('rec:desc:')) { if (it.refKind === 'card') { accTarjetas.editCard(ctx, { dataset: { id: it.refId } }); return; } if (it.refKind === 'fixed') ctx.state.fixed.find((f) => f.id === it.refId) && openModal('Gasto fijo', fixedFormExt(ctx.state, ctx.state.fixed.find((f) => f.id === it.refId))); else actions.editBill(ctx, { dataset: { id: it.refId } }); return; }
      const r = (ctx.state.recordatorios || []).find((x) => x.id === it.refId);
      if (r) openModal('Recordatorio', recordatorioForm(r));
      return;
    }
    const goto = it.kind === 'card' ? `<button class="btn block" data-action="verTarjeta" data-id="${esc(it.refId)}">Ver el detalle del resumen</button>`
      : it.kind === 'bill' ? `<button class="btn block" data-action="editBill" data-id="${it.refId}">Editar este pago</button>`
      : `<button class="btn block" data-action="verHistorialFijo" data-id="${it.refId}">Historial de pagos</button><button class="btn block" data-action="editFixed" data-id="${it.refId}">Editar el gasto fijo</button>`;
    const fijo = it.kind === 'fixed' ? ctx.state.fixed.find((x) => x.id === it.refId) : null;
    const campoUsd = fijo && fijo.usd ? `<div class="field"><label for="pp-u">En dólares</label><input id="pp-u" name="usd" inputmode="decimal" value="${String(fijo.usd).replace('.', ',')}"><span class="hint">Poné en "Monto pagado" lo que te cobraron en pesos: calculo la cotización.</span></div>` : '';
    const campoNota = '<div class="field"><label for="pp-n">Observación</label><input id="pp-n" name="nota" placeholder="Opcional: algo para revisar o reclamar después"></div>';
    const auto = it.paid && it.paidInfo && it.paidInfo.auto;
    openModal(it.name, `<div class="card"><span class="small muted">${esc(it.sub)}</span><span style="font-size:28px;font-weight:800">${montoAgenda(it)}</span><span class="pill ${it.overdue ? 'warn' : ''}" style="align-self:flex-start">${it.paid && it.paidInfo && it.paidInfo.auto ? 'Debitado automáticamente' : dueLabel(it)}</span>
      ${it.payWith ? `<span class="small">Se paga con ${esc(accountName(it.payWith))}</span>` : ''}
      ${it.paidInfo && !it.paidInfo.auto ? `<span class="small">Pagado el ${shortDate(it.paidInfo.date)} · ${money(it.paidInfo.amount)}${it.paidInfo.usd ? ` · ${nfUsd(it.paidInfo.usd)}` : ''}</span>${it.paidInfo.nota ? `<span class="small">📝 ${esc(it.paidInfo.nota)}</span>` : ''}` : ''}</div>
      ${auto ? `<form class="form" data-submit="markPaidForm"><input type="hidden" name="key" value="${esc(it.key)}">
        <strong>${it.variable || it.kind === 'card' ? '¿Cuánto te debitaron?' : 'Registrar lo que te debitaron'}</strong>
        <div class="field-row"><div class="field"><label for="pp-a">Importe debitado</label><input id="pp-a" name="amount" inputmode="decimal" value="${it.variable ? '' : Math.round(it.amount)}" placeholder="Mirá el movimiento en el banco" required></div>
          <div class="field"><label for="pp-d">Fecha</label><input id="pp-d" name="date" type="date" value="${esc(it.due)}" max="${todayISO()}"></div></div>
        <input type="hidden" name="account" value="${esc(it.payWith || '')}">
        ${campoUsd}${campoNota}
        <button class="btn green block" type="submit">Guardar</button></form>` : ''}
      ${it.paid ? (auto ? '' : `${it.kind === 'fixed' ? `<button class="btn block" data-action="editarPagoHist" data-key="${esc(it.key)}">Corregir o agregar observación</button>` : ''}<button class="btn block" data-action="unmarkPaid" data-key="${esc(it.key)}">Marcar como no pagado</button>`) : `<form class="form" data-submit="markPaidForm">
        <input type="hidden" name="key" value="${esc(it.key)}">
        <div class="field-row">
          <div class="field"><label for="pp-a">Monto pagado</label><input id="pp-a" name="amount" inputmode="decimal" value="${it.amount && !it.variable ? Math.round(it.amount) : ''}" placeholder="${it.amount ? `Ej: ${Math.round(it.amount)}` : 'Cuánto pagaste'}"></div>
          <div class="field"><label for="pp-d">Fecha</label><input id="pp-d" name="date" type="date" value="${todayISO()}" max="${todayISO()}"></div>
        </div>
        <div class="field"><label for="pp-c">Pagado con</label><select id="pp-c" name="account">${payOptions(ctx.state, it.payWith || '').replace('Sin asignar', 'No sé / no importa')}</select></div>
        ${it.kind === 'card' ? '<span class="small muted">Si pagaste el mínimo o una parte, poné el monto: te muestro cuánto quedó.</span>' : ''}
        ${it.variable ? '<span class="small muted">Este gasto varía: poné lo que pagaste este mes y lo uso como referencia para los próximos.</span>' : ''}
        ${campoUsd}${campoNota}
        <button class="btn green block" type="submit">Marcar como pagado</button>
      </form>`}
      ${!it.paid && (it.autoDebit || it.stopDebit) ? `<div class="card" style="gap:8px">
        <button class="btn small block" data-action="stopDebit" data-key="${esc(it.key)}">${it.stopDebit ? 'Volver al débito automático este mes' : 'Este mes no se debita (stop debit): lo pago yo'}</button>
        <details><summary class="small" style="cursor:pointer;font-weight:700">¿Qué es el stop debit?</summary>
          <p class="small" style="margin:6px 0 0">${STOP_DEBIT_TXT}</p></details></div>` : ''}
      ${!it.paid && it.kind === 'fixed' ? `<details class="card"><summary><strong>¿Este mes vence otro día?</strong></summary>
        <form class="form" data-submit="cambiarVencMes"><input type="hidden" name="key" value="${esc(it.key)}">
          <div class="field"><label for="pv-d">Este mes vence el</label><input id="pv-d" name="date" type="date" value="${it.dueDate.toISOString().slice(0, 10)}"></div>
          <span class="hint">Cambia solo este mes. Para todos los meses, editá el gasto fijo.</span>
          <button class="btn small block" type="submit">Guardar</button></form></details>` : ''}
      ${!it.paid && it.kind === 'card' ? `<button class="btn small block" data-action="editarFechasResumen" data-id="${it.refId}">Cambiar las fechas de este resumen</button>` : ''}
      ${goto}`);
  },
  cambiarVencMes(ctx, d) {
    const [, id, mk] = String(d.key).split(':');
    if (!d.date) return;
    ctx.commit((s) => { const f = s.fixed.find((x) => x.id === id); if (f) f.vencMes = { ...(f.vencMes || {}), [mk]: Number(d.date.slice(8)) }; });
    closeModal(); toast(`Listo: este mes vence el ${Number(d.date.slice(8))}`);
  },
  markPaid(ctx, el) {
    // los fijos que varían: antes de marcar, preguntar cuánto fue
    const it = findItem(ctx.state, el.dataset.key);
    if (it && (it.variable || !it.amount)) { actions.openPayment(ctx, el); return; }
    pay(ctx, el.dataset.key, undefined, undefined, undefined, true);
  },
  markPaidForm(ctx, d) {
    const amount = num(d.amount) || parseAmount(d.amount);
    const it = findItem(ctx.state, d.key);
    if (!amount && it && !it.amount) { toast('Poné cuánto pagaste'); return; }
    pay(ctx, d.key, amount, d.date, d.account || '', false, d); closeModal();
  },
  stopDebit(ctx, el) {
    const key = el.dataset.key; let on = false;
    ctx.commit((s) => { s.stopDebit = { ...(s.stopDebit || {}) }; if (s.stopDebit[key]) delete s.stopDebit[key]; else { s.stopDebit[key] = todayISO(); on = true; } });
    closeModal(); toast(on ? 'Listo: este mes no lo doy por debitado. Marcalo cuando lo pagues' : 'Listo: vuelve al débito automático');
  },
  verHistorialFijo(ctx, el) {
    const f = ctx.state.fixed.find((x) => x.id === el.dataset.id); if (!f) return;
    openModal(`Historial: ${f.name}`, historialHtml(ctx.state, f), { push: !document.getElementById('modal').hidden });
  },
  nuevoPagoHist(ctx, el) {
    const f = ctx.state.fixed.find((x) => x.id === el.dataset.id); if (!f) return;
    openModal('Cargar un pago anterior', pagoHistForm(ctx.state, f, ''), { push: true });
  },
  editarPagoHist(ctx, el) {
    const key = el.dataset.key; const id = key.split(':')[1];
    const f = ctx.state.fixed.find((x) => x.id === id); if (!f) return;
    openModal('Pago registrado', pagoHistForm(ctx.state, f, key, (ctx.state.paid || {})[key] || {}), { push: !document.getElementById('modal').hidden });
  },
  guardarPagoHist(ctx, d) {
    const amount = num(d.amount) || parseAmount(d.amount);
    const key = d.key || (/^\d{4}-\d{2}$/.test(d.mk || '') ? `fixed:${d.id}:${d.mk}` : '');
    if (!key || !amount) { toast('Completá el mes y el importe'); return; }
    const mk = key.split(':')[2];
    ctx.commit((s) => {
      s.paid = s.paid || {};
      const prev = s.paid[key] || {};
      const usd = num(d.usd);
      const q = String(d.quedan || '').trim();
      const reg = { ...prev, date: d.date || prev.date || `${mk}-${String(Math.min(28, Number((s.fixed.find((x) => x.id === d.id) || {}).dueDay) || 10)).padStart(2, '0')}`, amount };
      if (!reg.due) reg.due = reg.date;
      if (reg.onTime === undefined) reg.onTime = true;
      delete reg.auto;
      for (const [k, v] of [['account', d.account || ''], ['empresa', String(d.empresa || '').trim()], ['nota', String(d.nota || '').trim()]]) { if (v) reg[k] = v; else delete reg[k]; }
      if (usd > 0) { reg.usd = usd; reg.rate = Math.round((amount / usd) * 100) / 100; } else { delete reg.usd; delete reg.rate; }
      if (q !== '' && !Number.isNaN(parseInt(q, 10))) reg.quedan = parseInt(q, 10); else if (d.quedan !== undefined) delete reg.quedan;
      s.paid[key] = reg;
      // si es el último pago registrado de un fijo que varía, es la referencia de los próximos meses
      const f = s.fixed.find((x) => x.id === d.id);
      const ult = Object.keys(s.paid).filter((k) => k.startsWith(`fixed:${d.id}:`)).sort().pop();
      if (f && f.variable && ult === key && Math.abs(amount - f.amount) >= 1) { f.lastAmount = f.amount; f.amount = amount; }
    });
    const f = ctx.state.fixed.find((x) => x.id === d.id);
    if (f) openModal(`Historial: ${f.name}`, historialHtml(ctx.state, f)); else closeModal();
    toast('Pago guardado');
  },
  borrarPagoHist(ctx, el) {
    const key = el.dataset.key;
    ctx.commit((s) => { delete s.paid[key]; s.expenses = s.expenses.filter((e) => e.fromPayment !== key); });
    const f = ctx.state.fixed.find((x) => x.id === el.dataset.id);
    if (f) openModal(`Historial: ${f.name}`, historialHtml(ctx.state, f)); else closeModal();
    toast('Registro borrado');
  },
  unmarkPaid(ctx, el) {
    const key = el.dataset.key;
    ctx.commit((s) => {
      delete s.paid[key];
      s.expenses = s.expenses.filter((e) => e.fromPayment !== key);
    });
    closeModal(); toast('Marcado como pendiente');
  },
  downloadICS(ctx) {
    const blob = new Blob([buildICS(ctx.state)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'pesitos-pagos.ics'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Abrí el archivo para sumarlo a tu calendario');
  },
  async enableNotifications(ctx) {
    if (!('Notification' in window)) { toast('Este navegador no permite avisos'); return; }
    const p = await Notification.requestPermission();
    if (p === 'granted') { ctx.update((s) => { s.notifiedOn = ''; }); toast('Listo: cuando abras la app te aviso lo que vence'); }
    else toast('No se activaron los avisos. Podés usar el calendario.');
  },
};

function pay(ctx, key, amount, date, account, corregible = false, datos = {}) {
  const it = findItem(ctx.state, key);
  if (!it) return;
  const paidAmount = amount || it.amount;
  const when = date || todayISO();
  let msg = `${it.name}: pagado`;
  ctx.commit((s) => {
    const prev = s.paid[key];
    const total = (prev ? Number(prev.amount) : 0) + paidAmount;
    // de qué cuenta salió: la elegida, o la que tiene asignada el pago
    const cuenta = account !== undefined ? account : (it.payWith && it.payWith !== 'efectivo' ? it.payWith : it.payWith === 'efectivo' ? 'efectivo' : '');
    const ex = extrasPago(s, it, datos);
    if (ex.usd) ex.rate = Math.round((paidAmount / ex.usd) * 100) / 100;
    s.paid[key] = { date: when, amount: total, due: it.due, onTime: when <= it.due, ...(cuenta ? { account: cuenta } : {}), ...ex };
    // fijo que varía: lo que pagaste pasa a ser el monto aproximado de los próximos meses
    if (it.kind === 'fixed') {
      const f = s.fixed.find((x) => x.id === it.refId);
      if (f && f.variable && paidAmount && Math.abs(paidAmount - f.amount) >= 1) { f.lastAmount = f.amount; f.amount = paidAmount; }
    }
    // pago programado que varía: lo pagado queda como monto aproximado del próximo
    if (it.kind === 'bill') {
      const b = s.bills.find((x) => x.id === it.refId);
      if (b && b.variable && paidAmount && Math.abs(paidAmount - (b.amount || 0)) >= 1) { if (b.amount) b.lastAmount = b.amount; b.amount = paidAmount; }
    }
    // los pagos programados no están en otro lado: se anotan como gasto
    if (it.kind === 'bill') {
      const b = s.bills.find((x) => x.id === it.refId);
      const cuentaBill = account !== undefined ? account : (b && b.payWith) || '';
      s.expenses.push({ id: uid(), date: when, amount: paidAmount, category: (b && b.category) || 'otros', note: it.name, installments: 1, fromPayment: key, ...(cuentaBill ? { accountId: cuentaBill } : {}), ...(b && b.saveAhead ? { fromSavings: true } : {}) });
    }
  });
  if (it.kind === 'card' && paidAmount < it.amount - 1) msg = `Pagaste ${money(paidAmount)} de ${money(it.amount)}: quedan ${money(it.amount - paidAmount)} que generan intereses en el próximo resumen.`;
  else if (when > it.due) msg = `${it.name}: pagado (con ${Math.round((parseISO(when) - parseISO(it.due)) / 86400000)} días de atraso)`;
  // con "Pagué" se usa el monto agendado: si fue otro, se corrige con un toque
  if (corregible && it.kind !== 'card') toast(`${msg} (${money(paidAmount)})`, { label: 'Otro monto', fn: () => { ctx.commit((s) => { delete s.paid[key]; s.expenses = s.expenses.filter((e) => e.fromPayment !== key); }); actions.openPayment(ctx, { dataset: { key } }); } });
  else toast(msg);
}

