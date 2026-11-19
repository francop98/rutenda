// Inicio: cuánto podés gastar hoy, tu meta, lo que necesita tu atención
// (sueldo del mes, ahorro, resumen semanal) y accesos rápidos.

import { proyectosActivos, resumenProyecto } from './proyectos.js';
import { money, esc, monthKey, MONTHS_LONG, MONTHS, num, todayISO, monthName, parseISO , addMonthKey } from './formato.js';
import { budget, mainGoal, metaDiario, diarioConfig, MODOS_DIARIO, goalEta, goalPct, savedThisMonth, cardSummary, lastSalary, lastWeekStart, weekSummary , monthIncome, monthExpenses, fixedTotal } from './calculos.js';
import { insights } from './economista.js';
import { renderQuestion, suggestions, renderSuggestion } from './guia.js';
import { lessonCard } from './aprender.js';
import { catLabel } from './categorias.js';
import { alerts, dueLabel, closings, agenda } from './agenda.js';
import { promosForDay } from './economista.js';
import { totalCuentas, cuentasConSaldo, totalMeDeben, totalDebo, patrimonio, cuentaPrincipal } from './cuentas.js';
import { projection, coverage } from './flujo.js';
import { reglaDeCobro, fechaDeCobro } from './feriados.js';
import { alertaPresupuestos } from './presupuestos.js';
import { mediosRapidos } from './acciones.js';
import { instalada } from './menu.js';
import { bioDisponible, bioActiva, bloqueoActions } from './bloqueo.js';
import { wordmark, icon, sprout, ring, tipCard, quickForm, openModal, closeModal, toast, setModalBody } from './interfaz.js';
import { uid } from './almacenamiento.js';
import { reintegrosPorConfirmar } from './reintegros.js';
import { compararCard } from './miscuentas.js';
import { chipModo, datosEspacio, cuentasDelMes } from './espacios.js';

const MODE_TEXT = {
  payFirst: (s) => `Elegiste apartar el ${s.rules.payFirst.pct}% apenas cobrás`,
  fixed: () => 'Elegiste apartar un monto fijo por mes',
  roundup: () => 'Elegiste redondear cada gasto',
};
const snoozed = (s, key) => (s.snooze || {})[key] && s.snooze[key] > todayISO();

function salaryCard(s, b) {
  if (!b.estimated || snoozed(s, 'salary')) return '';
  const last = lastSalary(s);
  const mk = b.cycle.startISO.slice(0, 7);
  const payISO = b.cycle.startISO;
  return `<div class="card ask">
    <div class="tip-head"><span class="cat-icon green" style="width:26px;height:26px;border-radius:8px">${icon('up', 16, 2.4)}</span><strong>¿Ya cobraste lo de ${monthName(mk, true)}?</strong></div>
    <p class="text">Confirmalo y lo comparo con los meses anteriores y con la inflación. Así ves mes a mes si tus ingresos crecen de verdad.</p>
    <form class="quick" data-submit="confirmSalary" autocomplete="off">
      <input type="hidden" name="date" value="${payISO <= todayISO() ? payISO : todayISO()}">
      <label class="sr-only" for="sal-c">Monto cobrado</label>
      <input id="sal-c" name="amount" inputmode="decimal" value="${last ? Math.round(last.amount).toLocaleString('es-AR') : ''}" placeholder="Ej: 900.000">
      <button type="submit" class="icon-btn green" aria-label="Confirmar cobro">${icon('send', 20, 2.2)}</button>
    </form>
    <button class="btn ghost small" data-action="snoozeCard" data-key="salary" data-days="1" style="align-self:flex-start;min-height:36px;padding:0 4px">Todavía no cobré</button>
  </div>`;
}

// ---------- empezaste a usar Pesitos a mitad de mes ----------
// No sabés todo lo que gastaste antes: me decís cuánta plata tenés hoy y calculo
// lo que falta ("gastos de antes de Pesitos") para que "Hoy podés gastar" sea real.
export function gastosDeAntes(s, tengo) {
  const b = budget(s);
  const mk = todayISO().slice(0, 7);
  const fijosPagados = (s.fixed || []).reduce((a, f) => { const p = (s.paid || {})[`fixed:${f.id}:${mk}`]; return a + (p ? Number(p.amount) || f.amount : 0); }, 0);
  const apartado = (s.transfers || []).filter((t) => t.date >= b.cycle.startISO && t.date < b.cycle.nextISO).reduce((a, t) => a + t.amount, 0);
  return { b, fijosPagados, apartado, falta: Math.round(b.income - fijosPagados - apartado - b.variable - tengo) };
}
function arranqueCard(s, b) {
  if (s.demo || s.ajusteInicial || snoozed(s, 'arranque') || b.noIncome) return '';
  const primera = (s.expenses || []).filter((e) => !e.deEspacio).map((e) => e.date).sort()[0];
  const hoy = todayISO();
  // solo si empezaste a cargar en este ciclo y ya pasaron unos días desde el cobro
  if (primera && primera < b.cycle.startISO) return '';
  const dias = Math.round((Date.parse(hoy) - Date.parse(b.cycle.startISO)) / 86400000);
  if (dias < 3) return '';
  return `<div class="card lime"><strong>¿Empezaste a usar Pesitos a mitad de mes?</strong>
    <p class="text">Cobraste hace ${dias} días y no sé qué gastaste antes. Decime cuánta plata tenés hoy (cuentas y efectivo, sin ahorros) y ajusto lo que podés gastar.</p>
    <div class="btn-row"><button class="btn green small" data-action="openArranque">Poner mi saldo de hoy</button><button class="btn small" data-action="arranqueNo">Ya cargué todo</button></div></div>`;
}

function savingCard(s, b) {
  const mk = monthKey();
  if (!s.savingMode || s.savingMode === 'none' || s.setAside[mk] || snoozed(s, 'setAside')) return '';
  if (s.savingMode === 'leftover') {
    if (b.cycle.daysLeft > 3 || b.free <= 0) return '';
    return `<div class="card lime">
      <strong>Se termina tu mes y te sobran ${money(b.free)}</strong>
      <p class="text">Elegiste ahorrar lo que sobra a fin de mes. Pasalo desde Mi plata → Ahorros.</p>
      <div class="btn-row"><button class="btn small" data-action="snoozeCard" data-key="setAside" data-days="1">Entendido</button></div>
    </div>`;
  }
  if (b.saving <= 0 || b.estimated) return '';
  return `<div class="card lime">
    <strong>Cobraste: apartá ${money(b.saving)}</strong>
    <p class="text">${esc(MODE_TEXT[s.savingMode] ? MODE_TEXT[s.savingMode](s) : 'Según tus reglas de ahorro')}${b.savingParts.length > 1 ? ` (incluye ${b.savingParts.map((p) => p.name).join(', ')})` : ''}. Pasalo antes de gastar: en Mi plata → Ahorros te digo de qué cuenta y a dónde.</p>
    <div class="btn-row"><button class="btn small" data-action="snoozeCard" data-key="setAside" data-days="1">Entendido</button></div>
  </div>`;
}

// Si con los vencimientos y tu ritmo de gasto no alcanza hasta el cobro
function coverageAlert(s) {
  if (!s.fixed.length && !(s.cards || []).length && !(s.bills || []).length) return '';
  const pr = projection(s);
  if (pr.shortfall <= 0) return '';
  const cov = coverage(s, pr);
  return `<a class="card amber" href="#/pagos" style="text-decoration:none;color:inherit">
    <div class="tip-head"><span style="color:var(--amber)">${icon('bulb', 20)}</span><strong>Ojo: no te alcanzaría hasta el cobro</strong></div>
    <p class="text">${esc(cov.text)}</p>
    <span class="small" style="font-weight:700">Ver qué podés hacer →</span>
  </a>`;
}

// Aviso antes del cierre de la tarjeta
function closingTip(s) {
  const c = closings(s, 1)[0];
  if (!c) return '';
  const when = c.days === 0 ? 'hoy' : 'mañana';
  return `<div class="card">
    <div class="tip-head"><span class="badge">${sprout(17)}</span><strong>La ${esc(c.card.name)} cierra ${when}</strong></div>
    <p class="text">Si tenés una compra grande en mente, hacela desde el ${c.bestDay.getDate()}/${c.bestDay.getMonth() + 1}: entra en el resumen siguiente y la pagás recién el ${c.nextDue.getDate()}/${c.nextDue.getMonth() + 1}.</p>
  </div>`;
}

// Avisos de vencimientos: lo vencido y lo que vence en los próximos 3 días
function payAlerts(s) {
  const list = alerts(s);
  if (!list.length) return '';
  const total = list.reduce((a, i) => a + i.amount, 0);
  const urgent = list.some((i) => i.days <= 0);
  return `<div class="card ${urgent ? 'amber' : 'ask'}">
    <div class="tip-head"><span style="color:${urgent ? 'var(--amber)' : 'var(--green)'}">${icon('calendar', 20)}</span><strong>${list.length === 1 ? 'Tenés un pago por vencer' : `Tenés ${list.length} pagos por vencer`}</strong></div>
    ${list.slice(0, 3).map((i) => `<div class="row" style="padding:6px 0;border-color:rgba(0,0,0,.06)">
      <span class="grow"><span class="name">${esc(i.name)}</span><span class="meta">${dueLabel(i)}${i.estimated ? ' · monto estimado' : ''}</span></span>
      <span class="amount">${money(i.amount)}</span>
      ${i.autoDebit ? '<span class="small muted">Débito</span>' : `<button class="btn small green" data-action="markPaid" data-key="${esc(i.key)}" style="min-height:36px">Pagué</button>`}
    </div>`).join('')}
    <span class="small">${list.length > 1 ? `Total: ${money(total)}. ` : ''}Asegurate de tener esa plata disponible.</span>
    <a class="btn small" href="#/pagos">Ver todo lo que tengo por pagar</a>
  </div>`;
}

function weekCard(s) {
  const key = lastWeekStart();
  if (s.weekSeen === key) return '';
  const w = weekSummary(s, key);
  if (!w.count) return '';
  const f = parseISO(w.from); const t = parseISO(w.to);
  return `<div class="card week">
    <div class="tip-head"><span class="cat-icon green" style="width:26px;height:26px;border-radius:8px">${icon('calendar', 16)}</span><strong>Tu semana del ${f.getDate()} al ${t.getDate()} de ${MONTHS[t.getMonth()].toLowerCase()}</strong></div>
    <span style="font-size:24px;font-weight:800">${money(w.spent)} gastados</span>
    <p class="text">${esc(w.verdict)}${w.top[0] ? ` Lo que más pesó: ${esc(w.top.slice(0, 2).map((c) => catLabel(c.cat).toLowerCase()).join(' y '))}.` : ''}</p>
    <div class="btn-row"><button class="btn small green" data-action="openWeek" data-week="${key}">Ver detalle</button><button class="btn small" data-action="dismissWeek" data-week="${key}">Listo</button></div>
  </div>`;
}

// reintegros que ya tendrían que haber llegado: hay que confirmarlos para que sumen
function reintConfirmarCard(s) {
  const l = reintegrosPorConfirmar(s); if (!l.length) return '';
  const t = l.reduce((a, e) => a + e.reintegro.monto, 0);
  return `<button class="card amber" data-action="irReintegros" style="border:none;text-align:left"><strong>¿Te llegaron ${l.length === 1 ? 'el reintegro' : `${l.length} reintegros`}? (${money(t)})</strong><span class="text">Confirmalo${l.length === 1 ? '' : 's'} para sumarlo${l.length === 1 ? '' : 's'} a tu saldo.</span></button>`;
}

// Todo lo que pide tu atención, ordenado por importancia.
// En Inicio se ve solo el primero; el resto queda en "Novedades".
function avisos(s, b) {
  const sugg = suggestions(s);
  const pending = s.expenses.filter((e) => e.pending).length;
  const lista = [
    payAlerts(s),
    coverageAlert(s),
    reintConfirmarCard(s),
    compararCard(s),
    salaryCard(s, b),
    arranqueCard(s, b),
    savingCard(s, b),
    renderQuestion(s),
    alertaPresupuestos(s),
    pending ? `<button class="card amber" data-action="openPending" style="border:none;text-align:left;flex-direction:row;align-items:center"><span style="color:var(--amber)">${icon('receipt')}</span><span class="text" style="flex:1"><b>${pending} comprobante${pending > 1 ? 's' : ''} para confirmar.</b> Ya los categoricé.</span>${icon('chevron', 16)}</button>` : '',
    closingTip(s),
    weekCard(s),
    huellaCard(),
    instalarCard(),
    sugg[0] ? renderSuggestion(sugg[0]) + (sugg.length > 1 ? `<button class="btn small" data-action="openSuggestions">Ver las ${sugg.length} sugerencias</button>` : '') : '',
    ...insights(s).filter((t) => !tipOculto(s, t.id)).slice(0, 2).map((t) => '<!--fijo-->' + tipCard(t)),
  ];
  return lista.filter((x) => x && x.replace('<!--fijo-->', '').trim());
}

const tipOculto = (s, id) => { const h = (s.tipsNo || {})[id]; return h && h >= todayISO(); };

// Avisos ya vistos (en este dispositivo): la campanita solo cuenta los nuevos.
// Las lecciones y los consejos generales no cuentan.
const K_VISTOS = 'pesitos_avisos_vistos';
const claveAviso = (html) => {
  const m = html.match(/<(strong|b)>([\s\S]*?)<\/\1>/);
  return (m ? m[2] : html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 90);
};
const vistos = () => { try { return new Set(JSON.parse(localStorage.getItem(K_VISTOS) || '[]')); } catch { return new Set(); } };
function nuevos(lista) { const v = vistos(); return lista.filter((h) => !h.startsWith('<!--fijo-->') && !v.has(claveAviso(h))).length; }
function marcarVistos(lista) {
  const v = vistos();
  for (const h of lista) v.add(claveAviso(h));
  try { localStorage.setItem(K_VISTOS, JSON.stringify([...v].slice(-150))); } catch { /* nada */ }
}

function novedadesHtml(s) {
  const b = budget(s);
  const resto = avisos(s, b).slice(1);
  return `<div data-novedades>${resto.length ? resto.join('').replace(/<!--fijo-->/g, '') : '<p class="empty">No hay nada más por ahora. ¡Todo en orden!</p>'}
</div>`;
}

const ATAJOS = [
  ['#/pagos', 'calendar', 'Por pagar'],
  ['#/cuentas', 'wallet', 'Saldo'],
  ['#/beneficios', 'ticket', 'Beneficios'],
  ['#/tarjetas', 'card', 'Tarjetas'],
];
const tile = ([a, ic, l]) => (a.startsWith('#')
  ? `<a class="tile" href="${a}">${icon(ic, 22)}<span>${l}</span></a>`
  : `<button class="tile" data-action="${a}">${icon(ic, 22)}<span>${l}</span></button>`);

// Qué decir debajo de "Hoy podés gastar": cómo venís y qué hacer si te pasaste.
const diasTxt = (n) => (n === 1 ? '1 día' : `${String(Math.round(n * 10) / 10).replace('.', ',')} días`);
function heroMensaje(s, b, payText) {
  const est = b.estimated ? ' Estimado con tu último cobro.' : '';
  const linea = (t, extra = '') => `<span class="small on-green-muted hero-msg ${extra}">${t}${est}</span>`;
  const restantes = Math.max(1, b.cycle.daysLeft - 1);
  // te pasaste de todo lo que tenías hasta el cobro
  if (b.free < 0) {
    return linea(`<b>Ya gastaste ${money(-b.free)} más de lo que tenías hasta el cobro.</b> Para no tocar tus ahorros, tratá de no gastar hasta que cobres (${payText}).`, 'alerta');
  }
  // hoy gastaste más de lo sugerido
  if (b.todayLeft < 0 && b.dailyBase > 0) {
    const dias = b.spentToday / b.dailyBase;
    const nuevo = b.free / restantes;
    return linea(`Gastaste lo de <b>${diasTxt(dias)}</b>. Para compensar, hasta el cobro: <b>${money(nuevo)} por día</b>.`, 'alerta');
  }
  // venís gastando más rápido que tu ritmo normal
  if (b.adelanto > b.normalDaily * 0.5 && b.normalDaily > 0) {
    return linea(`Por día, para llegar bien: ${payText}. Ojo: este mes vas <b>${diasTxt(b.adelanto / b.normalDaily)} adelantado</b> respecto de tu ritmo normal.`);
  }
  // venís gastando menos: una parte se suma a tus próximos días y otra se sugiere ahorrar
  if (b.colchon > Math.max(500, b.normalDaily * 0.3)) {
    const meta = metaDiario(s);
    const partes = [];
    if (b.extraDia >= 1) partes.push(`<b>+${money(b.extraDia)} por día</b> hasta el cobro`);
    if (b.paraAhorrar >= 1) partes.push(`<b>${money(b.paraAhorrar)}</b> para ${meta ? `"${esc(meta.name)}"` : 'ahorrar'}${adelantoMeta(meta, b.paraAhorrar)}`);
    if (b.aparte >= 1) partes.push(`ya apartaste ${money(b.aparte)}`);
    return `${linea(`No gastaste ${money(b.colchon)} de días anteriores: ${partes.join(' y ')}.`)}
      <span class="hero-acciones"><button class="link-btn on-green-muted" data-action="openDiario">Cómo se reparte</button></span>`;
  }
  return linea(`Por día, para llegar bien: ${payText}.`);
}

// Tu ritmo: cómo venís esta semana, cuántos días seguidos dentro de lo previsto y lo de ayer.
function ritmoDia(s, iso) {
  return s.expenses.filter((e) => !e.pending && !e.fromSavings && e.date === iso && !(e.installments > 1)).reduce((a, e) => a + e.amount, 0)
    + s.expenses.filter((e) => !e.pending && !e.fromSavings && e.date === iso && e.installments > 1).reduce((a, e) => a + e.amount / e.installments, 0);
}
function ritmoSlide(s, b) {
  if (b.noIncome || !(b.normalDaily > 0)) return '';
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dSem = (hoy.getDay() + 6) % 7; // lunes = 0
  let gastoSem = 0;
  for (let k = 0; k <= dSem; k++) { const d = new Date(hoy); d.setDate(d.getDate() - k); gastoSem += ritmoDia(s, iso(d)); }
  const ritmoSem = b.normalDaily * (dSem + 1);
  const pct = Math.min(1, gastoSem / Math.max(1, ritmoSem));
  // días seguidos (hasta ayer) sin pasarte de tu ritmo, desde que usás la app
  const primero = s.expenses.reduce((a, e) => (!a || e.date < a ? e.date : a), '');
  let racha = 0;
  for (let k = 1; k <= 60; k++) { const d = new Date(hoy); d.setDate(d.getDate() - k); if (!primero || iso(d) < primero) break; if (ritmoDia(s, iso(d)) > b.normalDaily) break; racha++; }
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  const sobroAyer = primero && iso(ayer) >= primero ? b.normalDaily - ritmoDia(s, iso(ayer)) : 0;
  const dif = ritmoSem - gastoSem;
  return `<div class="card green hero slide">
      <span class="hero-label">Esta semana gastaste</span>
      <span class="hero-number">${money(gastoSem)}</span>
      <div class="bar" role="img" aria-label="Usaste el ${Math.round(pct * 100)}% de tu ritmo de la semana"><span style="width:${Math.round(pct * 100)}%"></span></div>
      <span class="small on-green-muted">${dif >= 0 ? `Vas <b>${money(dif)} abajo</b> de tu ritmo de la semana (${money(ritmoSem)}).` : `Vas <b>${money(-dif)} arriba</b> de tu ritmo de la semana (${money(ritmoSem)}).`}${racha >= 2 ? ` 🔥 ${racha} días seguidos dentro de lo previsto.` : ''}</span>
      ${sobroAyer >= 500 && b.paraAhorrar >= 1 ? `<span class="small on-green-muted">Ayer te sobraron ${money(sobroAyer)}: lo podés pasar desde Mi plata → Ahorros.</span>` : ''}
    </div>`;
}

// Cartel principal: un widget que se desliza de costado con distintos datos.
const K_WIDGET = 'pesitos_widget';
const widgetGuardado = () => { try { return Number(localStorage.getItem(K_WIDGET)) || 0; } catch { return 0; } };
function widget(s, b, payText) {
  const mk = monthKey();
  const entro = monthIncome(s, mk); const salio = monthExpenses(s, mk).total + fixedTotal(s, mk);
  const prevMk = addMonthKey(mk, -1); const dia = new Date().getDate();
  const salioAntes = s.expenses.filter((e) => !e.pending && e.date.slice(0, 7) === prevMk && Number(e.date.slice(8)) <= dia).reduce((a, e) => a + (e.installments > 1 ? e.amount / e.installments : e.amount), 0);
  const varMes = monthExpenses(s, mk).total;
  const pat = patrimonio(s);
  const cyclePct = Math.min(1, Math.max(0, 1 - b.cycle.daysLeft / Math.max(1, Math.round((b.cycle.next - b.cycle.start) / 86400000))));
  const slides = [
    `<div class="card green hero slide">
      <span class="hero-label">${b.noIncome || b.todayLeft >= 0 ? 'Hoy podés gastar' : 'Hoy te pasaste'}<button class="hero-info" data-action="openDiario" aria-label="Cómo se calcula y cómo se reparte lo que no gastás">${icon('info', 15)}</button></span>
      <span class="hero-number${!b.noIncome && b.todayLeft < 0 ? ' negative' : ''}">${b.noIncome ? '—' : money(Math.abs(b.todayLeft))}</span>
      <div class="bar" role="img" aria-label="Usaste el ${Math.round(b.usedPct * 100)}% de tu plata del ciclo"><span style="width:${Math.round(b.usedPct * 100)}%"></span></div>
      ${b.noIncome ? '<span class="small on-green-muted">Contame cuánto cobrás para empezar.</span>' : heroMensaje(s, b, payText)}
    </div>`,
    `<div class="card green hero slide">
      <span class="hero-label">Hasta el cobro te quedan</span>
      <span class="hero-number">${b.noIncome ? '—' : money(Math.max(0, b.free))}</span>
      <div class="bar" role="img" aria-label="Pasó el ${Math.round(cyclePct * 100)}% del mes"><span style="width:${Math.round(cyclePct * 100)}%"></span></div>
      <span class="small on-green-muted">${payText[0].toUpperCase() + payText.slice(1)} (${b.cycle.next.getDate()}/${b.cycle.next.getMonth() + 1}). Ya descontados tus gastos fijos${b.saving ? ` y ${money(b.saving)} de ahorro` : ''}.</span>
    </div>`,
    ritmoSlide(s, b),
  ].filter(Boolean);
  // carrusel infinito: copia de la última al principio y de la primera al final;
  // al llegar a una copia salta (sin animación) a la real.
  const n = slides.length;
  const i = Math.min(n - 1, widgetGuardado());
  const vueltas = n > 1;
  const copia = (h) => h.replace('class="card green hero slide"', 'class="card green hero slide copia" aria-hidden="true" inert');
  const todas = vueltas ? [copia(slides[n - 1]), ...slides, copia(slides[0])] : slides;
  requestAnimationFrame(() => { const c = document.querySelector('[data-widget]'); if (c) c.scrollLeft = paso(c) * (i + (vueltas ? 1 : 0)); });
  return `<div class="hero-wrap"><div class="hero-carrusel" data-widget data-n="${n}" data-vueltas="${vueltas ? 1 : 0}" aria-roledescription="carrusel" aria-label="Resumen de tu plata">${todas.join('')}</div>
    <div class="hero-puntos" role="tablist">${slides.map((_, k) => `<button role="tab" data-action="widgetIr" data-i="${k}" aria-label="Ver ${['hoy', 'hasta el cobro', 'tu ritmo'][k]}" aria-selected="${k === i}"></button>`).join('')}</div></div>`;
}
// al deslizar el widget, se marca el puntito, se recuerda y se da la vuelta
// (paso = ancho de una tarjeta + el espacio entre tarjetas)
const paso = (c) => { const a = c.children[0]; const b = c.children[1]; return a && b ? b.offsetLeft - a.offsetLeft : Math.max(1, c.clientWidth); };
const posReal = (c) => {
  const n = Number(c.dataset.n) || 1; const v = c.dataset.vueltas === '1';
  const p = Math.round(c.scrollLeft / Math.max(1, paso(c)));
  return v ? (p - 1 + n) % n : p;
};
let finScroll = 0;
const darVuelta = (c) => {
  if (c.dataset.vueltas !== '1') return;
  const n = Number(c.dataset.n); const w = paso(c);
  const p = Math.round(c.scrollLeft / Math.max(1, w));
  if (p === 0) c.scrollLeft = w * n;
  else if (p === n + 1) c.scrollLeft = w;
};
document.addEventListener('scroll', (e) => {
  const c = e.target;
  if (!c || !c.matches || !c.matches('[data-widget]')) return;
  const i = posReal(c);
  c.parentElement.querySelectorAll('.hero-puntos button').forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
  try { localStorage.setItem(K_WIDGET, String(i)); } catch { /* nada */ }
  clearTimeout(finScroll); finScroll = setTimeout(() => darVuelta(c), 140);
}, true);
document.addEventListener('scrollend', (e) => { const c = e.target; if (c && c.matches && c.matches('[data-widget]')) { clearTimeout(finScroll); darVuelta(c); } }, true);

// Día de cobro: si ya cobraste este mes y todavía no cargaste el sueldo, te lo recuerdo (hasta 5 días después)
function sueldoPorCargar(s) {
  if (reglaDeCobro(s.profile).tipo === 'varia') return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const pd = fechaDeCobro(s.profile, t.getFullYear(), t.getMonth()); pd.setHours(0, 0, 0, 0);
  const dias = Math.round((t - pd) / 86400000);
  if (dias < 0 || dias > 5) return null;
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const desde = new Date(pd); desde.setDate(desde.getDate() - 5);
  if ((s.incomes || []).some((i) => i.type === 'sueldo' && i.date >= iso(desde))) return null;
  return { mk: iso(pd).slice(0, 7), hoy: dias === 0, dia: `${pd.getDate()}/${pd.getMonth() + 1}` };
}

// "Tu día": el próximo pago, la promo de hoy y cuánto tenés en tus cuentas
// ---------- en un espacio compartido: lo de la casa ----------
function espacioHero(s) {
  const mk = todayISO().slice(0, 7);
  const d0 = datosEspacio(); const d = d0 && d0.esp === s.espacio.id ? d0 : null;
  const yo = d ? d.yo : '';
  const filas = d ? cuentasDelMes(s, d, yo, mk) : [];
  const total = (s.expenses || []).filter((e) => !e.pending && e.date.slice(0, 7) === mk).reduce((a, e) => a + e.amount, 0);
  const pres = Object.values(s.presupuestos || {}).reduce((a, v) => a + Number(v || 0), 0);
  const mio = filas.find((x) => x.uid === yo);
  const otros = filas.filter((x) => x.uid !== yo && !x.sinDato);
  const deuda = mio && otros.length === 1 && Math.round(mio.saldo) !== 0 ? (mio.saldo > 0 ? `${esc(otros[0].nombre)} te debe ${money(mio.saldo)}` : `Le debés ${money(-mio.saldo)} a ${esc(otros[0].nombre)}`) : '';
  return `<div class="card green esp-hero">
    <span class="hero-label">Gastado este mes en ${esc(s.espacio.nombre)}</span>
    <span class="hero-number" style="font-size:34px">${money(total)}</span>
    ${pres ? `<span class="small on-green-muted">de ${money(pres)} de presupuesto · ${total <= pres ? `quedan ${money(pres - total)}` : `se pasaron ${money(total - pres)}`}</span>` : ''}
    ${d && filas.length > 1 ? `<div class="esp-personas">${filas.filter((x) => !x.sinDato).map((x) => `<span class="esp-persona"><span>${esc(x.nombre)} (${String(x.pct).replace('.', ',')}%)</span><span>puso ${money(x.puso)} · le toca ${money(x.parte)}</span></span>`).join('')}</div>` : ''}
    ${deuda ? `<span class="small"><b>${deuda}</b> este mes</span>` : ''}
    ${mio ? `<span class="small on-green-muted">Tu parte (${money(mio.parte)}) se suma sola a tu plata personal.</span>` : ''}
  </div>`;
}
function espacioDia(s) {
  const ag = agenda(s, 31);
  const prox = ag.find((i) => !i.paid && i.kind !== 'recordatorio' && i.days >= -7);
  return `<div class="card tight tu-dia"><span class="tu-dia-t">La casa</span>
    <a class="dia-fila" href="#/pagos"><span class="cat-icon">${icon('calendar', 18)}</span><span class="grow"><span class="k">Próximo pago${prox ? ` · ${esc(dueLabel(prox))}` : ''}</span><span class="v">${prox ? `${esc(prox.name)}${prox.amount ? ` · ${money(prox.amount)}` : ''}` : 'Nada por pagar este mes'}</span></span>${icon('chevron', 16)}</a>
    <a class="dia-fila" href="#/movimientos"><span class="cat-icon">${icon('moves', 18)}</span><span class="grow"><span class="k">Movimientos</span><span class="v">Qué cargó cada uno</span></span>${icon('chevron', 16)}</a>
    <button class="dia-fila" data-action="openEspacios"><span class="cat-icon">${icon('people', 18)}</span><span class="grow"><span class="k">Cómo dividen e invitar</span><span class="v">${esc(s.espacio.nombre)}</span></span>${icon('chevron', 16)}</button>
  </div>`;
}

// Solo lo que aporta algo: sin filas de relleno ni repetir el aviso de pagos de arriba.
function tuDia(s, yaHayPagos = false) {
  const ag = agenda(s, 31);
  const prox = ag.find((i) => !i.paid && i.kind !== 'recordatorio' && i.days >= -7);
  const rec = ag.find((i) => !i.paid && i.kind === 'recordatorio' && i.days >= -3 && i.days <= 2);
  const promo = promosForDay(s, new Date().getDay())[0];
  const con = cuentasConSaldo(s).length;
  const tm = totalMeDeben(s); const td = totalDebo(s);
  const fila = (href, ic, k, v, sub) => `<a class="dia-fila" href="${href}"><span class="cat-icon">${icon(ic, 18)}</span><span class="grow"><span class="k">${k}${sub ? ` · ${sub}` : ''}</span><span class="v">${v}</span></span>${icon('chevron', 16)}</a>`;
  const sueldo = sueldoPorCargar(s);
  const filas = `${sueldo ? `<button class="dia-fila sueldo-fila" data-action="newSalary" data-mk="${sueldo.mk}"><span class="cat-icon green">${icon('up', 18)}</span><span class="grow"><span class="k">${sueldo.hoy ? 'Hoy cobrás' : `Cobraste el ${sueldo.dia}`}</span><span class="v">Anotá lo que cobraste</span></span>${icon('chevron', 16)}</button>` : ''}
    ${prox && !yaHayPagos ? fila('#/pagos', 'calendar', 'Próximo pago', `${esc(prox.name)}${prox.amount ? ` · ${prox.estimated ? '≈ ' : ''}${money(prox.amount)}` : ''}`, esc(dueLabel(prox))) : ''}
    ${rec ? fila('#/pagos', 'bell', 'Recordatorio', esc(rec.name), rec.days === 0 ? 'hoy' : rec.days === 1 ? 'mañana' : rec.days < 0 ? 'pendiente' : `en ${rec.days} días`) : ''}
    ${promo ? fila('#/beneficios', 'ticket', 'Promo de hoy', `${promo.pct}% ${esc(promo.merchant || catLabel(promo.category))}`, esc(promo.name)) : ''}
    ${con ? fila('#/cuentas', 'wallet', 'En tus cuentas', money(totalCuentas(s)), '') : ''}
    ${proyectosActivos(s).slice(0, 3).map((p) => { const r = resumenProyecto(s, p); return fila('#/proyectos', 'folder', `Proyecto · ${esc(p.nombre)}`, `${money(r.gastado)}${p.presupuesto ? ` de ${money(p.presupuesto)}` : ' gastado'}`, ''); }).join('')}
    ${tm || td ? fila('#/deudas', 'people', 'Deudas y préstamos', `${tm ? `Te deben ${money(tm)}` : ''}${tm && td ? ' · ' : ''}${td ? `Debés ${money(td)}` : ''}`, '') : ''}`;
  return filas.trim() ? `<div class="card tight tu-dia"><span class="tu-dia-t">Tu día</span>${filas}</div>` : '';
}

export function render(s) {
  const b = budget(s);
  const g = mainGoal(s);
  const days = b.cycle.daysLeft;
  const payText = reglaDeCobro(s.profile).tipo === 'varia'
    ? (days === 1 ? 'último día del mes' : `quedan ${days} días del mes`)
    : (days === 1 ? 'cobrás mañana' : `cobrás en ${days} días`);
  const lista = avisos(s, b);
  const sinLeer = nuevos(lista.slice(1));
  // si "Novedades" está abierto, se actualiza solo
  setTimeout(() => { const n = document.querySelector('#modal:not([hidden]) [data-novedades]'); if (n) n.outerHTML = novedadesHtml(s); }, 0);

  return `<section class="screen">
    <div class="topbar">
      <div class="head-left"><button class="icon-btn menu-btn" data-action="openMenu" aria-label="Menú">${icon('menu', 22)}</button>${s.espacio ? '' : wordmark(26)}${chipModo(s)}</div>
      <span class="head-actions"><button class="icon-btn campana" data-action="openNovedades" aria-label="Novedades${sinLeer ? `: ${sinLeer} sin ver` : ''}">${icon('bell', 22)}${sinLeer ? `<span class="badge-num">${sinLeer}</span>` : ''}</button><a class="icon-btn" href="#/asesor" aria-label="Asesor y ayuda">${icon('help', 22)}</a></span>
    </div>

    ${s.demo ? '<div class="card amber" style="padding:10px 14px"><span class="small">Estás viendo <b>datos de ejemplo</b>. Podés borrarlos desde el menú ☰ → Copia de seguridad.</span></div>' : ''}

    ${s.espacio ? espacioHero(s) : widget(s, b, payText)}

    ${quickForm('q-home', s, mediosRapidos(s))}

    ${s.espacio ? espacioDia(s) : `${lista[0] || ''}

    ${tuDia(s, !!lista[0] && lista[0] === payAlerts(s))}`}

    ${g && !s.espacio ? `<a class="card goal-row" href="#/ahorro" style="text-decoration:none;color:inherit;flex-direction:row">
      ${ring(goalPct(g), 56, 7, `${g.name}: ${Math.round(goalPct(g) * 100)}%`)}
      <div class="grow" style="display:flex;flex-direction:column;gap:2px">
        <span class="small muted" style="font-weight:600">Tu meta</span>
        <span style="font-size:16px;font-weight:800">${esc(g.name)}</span>
        <span class="small muted">${esc(goalEta(g).text.replace('A este ritmo llegás', 'Llegás'))}</span>
      </div>
    </a>` : ''}
  </section>`;
}

// Sugerencia de entrar con huella o cara (si el dispositivo lo permite y no hay bloqueo)
const K_HUELLA = 'pesitos_huella_no';
let hayBio = null;
bioDisponible().then((v) => { hayBio = v; });
function huellaCard() {
  let no = false;
  try { no = localStorage.getItem(K_HUELLA) === '1'; } catch { /* nada */ }
  if (no || !hayBio || bioActiva()) return '';
  return `<div class="card card-huella">
    <div class="tip-head"><span style="color:var(--green)">${icon('lock', 20)}</span><strong>Entrá con tu huella o tu cara</strong></div>
    <span class="text">Cuando inicies sesión en este celular, usá tu huella o tu cara en lugar de escribir el PIN.</span>
    <div class="btn-row"><button class="btn small ghost" data-action="huellaNo">Ahora no</button><button class="btn small primary" data-action="huellaSi">Activar</button></div>
  </div>`;
}

// Sugerencia de instalar (solo si se abre desde el navegador y no la descartó)
const K_INSTALAR = 'pesitos_instalar_no';
function instalarCard() {
  let no = false;
  try { no = localStorage.getItem(K_INSTALAR) === '1'; } catch { /* nada */ }
  if (no || instalada()) return '';
  return `<div class="card card-instalar">
    <div class="tip-head"><span style="color:var(--green)">${icon('phone', 20)}</span><strong>Instalá Pesitos en tu celular</strong></div>
    <span class="text">Queda en la pantalla de inicio como cualquier app: abre más rápido, funciona sin conexión, te puede avisar los vencimientos y podés compartirle tus comprobantes.</span>
    <div class="btn-row"><button class="btn small ghost" data-action="instalarNo">No, gracias</button><button class="btn small primary" data-action="instalarApp">Instalar</button></div>
  </div>`;
}

// cuánto adelanta la meta un aporte (en días), según lo que le ponés por mes
function adelantoMeta(g, monto) {
  if (!g || !(g.monthly > 0) || !(monto > 0)) return '';
  const d = Math.round(monto / (g.monthly / 30));
  return d >= 1 ? ` y te adelanta "${esc(g.name)}" ${d === 1 ? '1 día' : `${d} días`}` : '';
}

function diarioBody(s) {
  const b = budget(s); const cfg = diarioConfig(s); const meta = metaDiario(s);
  const op = (k) => { const m = MODOS_DIARIO[k]; const on = cfg.modo === k; return `<button type="button" class="medio-op${on ? ' on' : ''}" data-action="setModoDiario" data-v="${k}" aria-pressed="${on}"><span class="grow"><span class="name">${m.nombre}${k === 'ahorrador' ? ' <span class="chip-mini">Recomendado</span>' : ''}</span><span class="meta">${m.txt}</span></span>${on ? icon('check', 18, 2.6) : ''}</button>`; };
  const pct = Math.round(cfg.reparto * 100);
  const topes = [[0.1, '+10%'], [0.2, '+20%'], [0.5, '+50%'], [1, 'El doble'], ['sin', 'Sin techo']];
  const topeAct = cfg.tope == null ? 'sin' : cfg.tope;
  const metas = s.goals || [];
  const aMedida = cfg.modo === 'personalizado' ? `<div class="card diario-medida">
      <div class="field"><label for="dm-rep">De lo que no gastás, a tus próximos días: <b data-out="rep">${pct}%</b> (a tu meta: <b data-out="aho">${100 - pct}%</b>)</label>
        <input id="dm-rep" type="range" min="0" max="100" step="5" value="${pct}" data-change="setDiarioReparto" data-input="verDiarioReparto"></div>
      <span class="small" style="font-weight:700">Tu día puede subir hasta</span>
      <div class="chips">${topes.map(([v, l]) => `<button type="button" class="chip toggle" data-action="setDiarioTope" data-v="${v}" aria-pressed="${String(v) === String(topeAct)}">${l}</button>`).join('')}</div>
      <span class="small muted">Por encima de tu ritmo normal${b.normalDaily ? ` (${money(b.normalDaily)})` : ''}. Lo que pasa ese techo te sugiero ahorrarlo.</span>
    </div>` : '';
  const destino = metas.length > 1 ? `<div class="field"><label for="dm-dest">Lo que ahorrás de tu día va a</label><select id="dm-dest" data-change="setDiarioDestino">${metas.map((g) => `<option value="${esc(g.id)}" ${meta && meta.id === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>` : '';
  const sinMeta = !metas.length ? `<div class="card tight"><span class="text">Todavía no tenés una meta. Lo que no gastás se va a <b>ahorro</b>; si le ponés un nombre (vacaciones, fondo de emergencia, un auto) te digo cuánto te adelanta cada peso.</span><button class="btn small ghost" data-action="openGoalForm">Crear una meta</button></div>` : '';
  return `<div class="card"><span class="text">Cada día te muestro tu <b>ritmo normal</b>: lo que cobrás, menos tus gastos fijos y lo que separás para ahorrar, dividido por los días del mes${b.normalDaily ? ` (hoy: <b>${money(b.normalDaily)} por día</b>)` : ''}.</span>
      <span class="text">Si un día gastás de más, los días que siguen bajan para que llegues al cobro. Si gastás de menos, lo que no gastaste se reparte según el modo que elijas.</span></div>
    <span class="small" style="font-weight:700">Elegí cómo querés que funcione</span>
    <div class="medio-hoja">${['ahorrador', 'equilibrado', 'flexible', 'personalizado'].map(op).join('')}</div>
    ${aMedida}${destino}${sinMeta}
    ${b.colchon ? `<div class="card lime"><span class="text">Hasta hoy no gastaste <b>${money(b.colchon)}</b> de tu ritmo: ${b.extraDia >= 1 ? `<b>+${money(b.extraDia)} por día</b> hasta el cobro` : 'nada se suma a tus días'}${b.paraAhorrar >= 1 ? ` y <b>${money(b.paraAhorrar)}</b> para ahorrar${adelantoMeta(meta, b.paraAhorrar)}` : ''}.</span>
      ${b.paraAhorrar >= 1 ? '<span class="small muted">Lo pasás desde Mi plata → Ahorros.</span>' : ''}</div>` : ''}`;
}

export const actions = {
  openNovedades(ctx) {
    const lista = avisos(ctx.state, budget(ctx.state)).slice(1);
    openModal('Novedades', novedadesHtml(ctx.state));
    marcarVistos(lista);
    document.querySelectorAll('.campana .badge-num').forEach((b) => b.remove());
  },
  tipNo(ctx, el) {
    const id = el.dataset.tip;
    const hasta = new Date(); if (!/^promo-/.test(id)) hasta.setDate(hasta.getDate() + 13);
    ctx.commit((s) => { s.tipsNo = { ...(s.tipsNo || {}), [id]: hasta.toISOString().slice(0, 10) }; });
    toast(/^promo-/.test(id) ? 'Listo, no te la muestro más hoy' : 'Listo, lo oculto por un tiempo');
  },
  // lo que no gastaste, a la meta (o a ahorro): baja lo libre del ciclo
  openArranque(ctx) {
    const s = ctx.state;
    openModal('Empezar con mi saldo de hoy', `<form class="form" data-submit="guardarArranque">
      <p class="text" style="margin:0">¿Cuánta plata tenés hoy entre tus cuentas, billeteras y efectivo? Sin contar ahorros ni inversiones.</p>
      <div class="field"><label for="ar-t">Tengo hoy</label><input id="ar-t" name="tengo" inputmode="decimal" required placeholder="Ej: 350.000" data-input="arranqueVivo"></div>
      <p class="small" data-ar-vivo></p>
      <span class="small muted">Con lo que cobraste, tus gastos fijos ya pagados y lo que cargaste, calculo cuánto gastaste antes de empezar y lo anoto como "Gastos de antes de Pesitos" (con fecha del día de cobro, para que no cuente como gasto de hoy). ${(s.cuentas && Object.keys(s.cuentas).length) ? '' : 'También lo tomo como el saldo de tu cuenta principal.'}</span>
      <button class="btn primary block" type="submit">Ajustar</button></form>`);
  },
  arranqueVivo(ctx, el) {
    const t = num(el.value); const p = document.querySelector('[data-ar-vivo]'); if (!p) return;
    if (!t) { p.textContent = ''; return; }
    const g = gastosDeAntes(ctx.state, t);
    p.innerHTML = g.falta > 0 ? `Gastaste unos <b>${money(g.falta)}</b> antes de empezar. Lo anoto y "Hoy podés gastar" queda en lo real.` : g.falta < 0 ? `Tenés ${money(-g.falta)} más de lo que da la cuenta (¿algún ingreso sin cargar?). No anoto nada.` : 'Cuadra justo.';
  },
  guardarArranque(ctx, d) {
    const tengo = num(d.tengo); if (!(tengo >= 0)) return;
    const g = gastosDeAntes(ctx.state, tengo);
    ctx.commit((s) => {
      if (g.falta > 0) s.expenses.push({ id: uid(), date: g.b.cycle.startISO, amount: g.falta, category: 'otros', note: 'Gastos de antes de Pesitos', installments: 1, ajusteInicial: true });
      s.ajusteInicial = { date: todayISO(), tengo };
      if (!s.cuentas || !Object.keys(s.cuentas).length) { s.cuentas = { [cuentaPrincipal(s)]: { saldo: tengo, desde: todayISO() } }; }
      s.lastClose = { date: todayISO(), balance: tengo };
    });
    closeModal(); toast(g.falta > 0 ? `Listo: anoté ${money(g.falta)} de gastos de antes. Ya está ajustado` : 'Listo: arranco desde tu saldo de hoy');
  },
  arranqueNo(ctx) { ctx.commit((s) => { s.ajusteInicial = { date: todayISO(), no: true }; }); toast('Perfecto'); },
  openDiario(ctx) {
    openModal('Cómo funciona "Hoy podés gastar"', diarioBody(ctx.state));
  },
  setModoDiario(ctx, el) {
    const k = el.dataset.v;
    ctx.commit((s) => {
      const d = { ...(s.diario || {}), modo: k };
      // al pasar a "A tu medida" arranca con lo que tenías
      if (k === 'personalizado' && s.diario && !s.diario.modo) { const c = diarioConfig(s); d.reparto = c.reparto; d.tope = c.tope; }
      s.diario = d;
    });
    setModalBody('.modal-body', diarioBody(ctx.state));
    toast(`Modo ${MODOS_DIARIO[k].nombre.toLowerCase()}`);
  },
  verDiarioReparto(ctx, el) {
    const v = Number(el.value); const m = el.closest('.modal-body');
    if (m) { const r = m.querySelector('[data-out=rep]'); const a = m.querySelector('[data-out=aho]'); if (r) r.textContent = `${v}%`; if (a) a.textContent = `${100 - v}%`; }
  },
  setDiarioReparto(ctx, el) {
    ctx.commit((s) => { s.diario = { ...(s.diario || {}), modo: 'personalizado', reparto: Number(el.value) / 100 }; });
    setModalBody('.modal-body', diarioBody(ctx.state));
  },
  setDiarioTope(ctx, el) {
    const v = el.dataset.v;
    ctx.commit((s) => { s.diario = { ...(s.diario || {}), modo: 'personalizado', tope: v === 'sin' ? null : Number(v) }; });
    setModalBody('.modal-body', diarioBody(ctx.state));
  },
  setDiarioDestino(ctx, el) {
    ctx.commit((s) => { s.diario = { ...(s.diario || {}), destino: el.value }; });
    setModalBody('.modal-body', diarioBody(ctx.state));
  },
  widgetIr(ctx, el) { const c = document.querySelector('[data-widget]'); if (c) c.scrollTo({ left: paso(c) * (Number(el.dataset.i) + (c.dataset.vueltas === '1' ? 1 : 0)), behavior: 'smooth' }); },
  openAtajos() { openModal('Más secciones', `<div class="tiles">${ATAJOS.slice(3).map(tile).join('')}</div>`); },
  async huellaSi(ctx) { await bloqueoActions.bloqueoBio(); ctx.render(); },
  huellaNo(ctx) { try { localStorage.setItem(K_HUELLA, '1'); } catch { /* nada */ } ctx.render(); toast('Listo. Si cambiás de idea, está en Menú → PIN de seguridad y huella'); },
  instalarNo(ctx) { try { localStorage.setItem(K_INSTALAR, '1'); } catch { /* nada */ } ctx.render(); toast('Listo. Si cambiás de idea, está en Menú → La app'); },
  promoUsed(ctx, el) {
    const cap = num(el.dataset.id);
    openModal('¿Cuánto te ahorraste?', `<form class="form" data-submit="promoSaved">
      <div class="field"><label for="ps">Ahorro con la promo</label><input id="ps" name="amount" inputmode="decimal" placeholder="${cap ? `Tope: ${money(cap)}` : 'Ej: 8.000'}" required></div>
      <button class="btn primary block" type="submit">Sumar al contador</button>
    </form>`);
  },
  promoSaved(ctx, d) {
    const amount = num(d.amount);
    if (!amount) return;
    ctx.commit((s) => { const mk = monthKey(); s.savedByApp[mk] = (s.savedByApp[mk] || 0) + amount; s.tipsNo = { ...(s.tipsNo || {}), [`promo-${new Date().getDay()}`]: todayISO() }; });
    closeModal(); toast(`¡Bien! Sumé ${money(amount)} a lo que te ahorraste (lo ves en Movimientos)`);
  },
};
