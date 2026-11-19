// "Pesitos quiere saber": la app pregunta de a una cosa por vez, solo lo
// que le falta. Y "Pesitos sugiere una mejora": revisa lo que cargaste
// y propone correcciones (gastos que no son fijos, duplicados, etc.).
// Máximo 3 preguntas por día; cualquiera se puede dejar para después.

import { uid } from './almacenamiento.js';
import { notaCobro } from './calculos.js';
import { money, num, todayISO, toISO, addDays, esc, normalize, addMonthKey, monthKey } from './formato.js';
import { parseAmount, merchantKey, guessCategory } from './interprete.js';
import { aprendizajes } from './habitos.js';
import { HOLDING_TYPES, ASSETS, catLabel, PROVINCES, provinceLabel } from './categorias.js';
import { refreshLive } from './datosvivos.js';
import { BILLETERAS_QUE_RINDEN, rinde } from './rendimientos.js';
import { sprout, icon, toast } from './interfaz.js';

const DAILY_LIMIT = 3;
const SNOOZE_DAYS = 3;
const BASE_IDS = ['salary', 'savingMode', 'fixedIntro', 'goal', 'goalTarget', 'savings', 'wallets'];

function candidates(s) {
  const q = [];
  const focus = s.profile.focus;
  if (!s.incomes.some((i) => i.type === 'sueldo')) q.push({ id: 'salary', p: 100, text: s.espacio ? '¿Cuánta plata entra por mes para la casa, sumando lo que pone cada uno? Con eso calculo cuánto pueden gastar por día.' : '¿Cuánto cobrás por mes? Sin ese dato no puedo calcular cuánto podés gastar por día.', kind: 'amount', placeholder: 'Ej: 900.000' });
  if (!s.fixed.length) q.push({ id: 'fixedIntro', p: 90, kind: 'info', title: 'Tus gastos fijos', text: 'Son los que pagás todos los meses por un monto parecido: alquiler, expensas, servicios, prepaga, cuotas, suscripciones… Cargalos una sola vez, con el nombre que quieras, y los descuento solos cada mes.', button: { label: 'Cargar mis gastos fijos', action: 'newFixed' } });
  // el objetivo se pregunta cuando ya hay movimientos: con eso la respuesta sirve más
  const actividad = (s.expenses || []).filter((e) => !e.pending).length;
  if (!s.goals.length && actividad >= 8) q.push({ id: 'goal', p: focus === 'meta' ? 95 : 65, text: 'Ya conozco un poco tus gastos. ¿Hay algo para lo que te gustaría juntar plata? Te digo cuánto apartar por mes y cuándo llegás.', kind: 'choice', options: ['Un viaje', 'Fondo de emergencia', 'Cambiar el auto', 'Mi casa', 'Estudiar'], other: 'Otro objetivo…', no: 'Por ahora no' });
  const noTarget = s.goals.find((g) => !g.target);
  if (noTarget) q.push({ id: 'goalTarget', p: 80, goalId: noTarget.id, text: `¿Cuánto necesitás para "${noTarget.name}"? Alcanza con un monto aproximado.`, kind: 'amount', placeholder: 'Ej: 1.500.000' });
  if (!s.holdings.length) q.push({ id: 'savings', p: focus === 'crecer' ? 95 : 55, text: '¿Tenés algo ahorrado hoy? Así te muestro cuánto vale y si te está rindiendo.', kind: 'amountWhere', no: 'Todavía no' });
  if (!(s.wallets || []).length) q.push({ id: 'wallets', p: focus === 'finmes' ? 70 : 50, kind: 'info', title: 'Promos para vos', text: '¿Qué bancos, billeteras y tarjetas usás? Con eso te aviso el día antes qué descuentos tenés.', button: { label: 'Elegir mis medios de pago', action: 'openWallets' } });
  if ((s.wallets || []).length && !(s.profile && s.profile.province)) q.push({ id: 'province', p: 60, title: 'Promos de tu zona', kind: 'select', text: '¿En qué provincia vivís? Muchas promos valen solo en una provincia: así te muestro las tuyas y las de todo el país.', options: PROVINCES.map((p) => ({ value: p, label: provinceLabel(p) })) });
  // ahorros que pueden dar intereses y todavía no sé si los dan
  const sinTasa = (s.holdings || []).find((h) => rinde(h.type) && h.type !== 'plazo_fijo' && !h.rinde && (h.currency || 'ARS') === 'ARS');
  if (sinTasa) q.push({ id: `rinde:${sinTasa.id}`, p: 75, holdingId: sinTasa.id, title: 'Que tu plata rinda', kind: 'choice',
    text: `¿"${sinTasa.name}" te da intereses? Si me decís dónde está, sumo los intereses de cada día solo.`,
    options: [...BILLETERAS_QUE_RINDEN.map((b) => ({ value: b.id, label: b.nombre })), { value: 'otra', label: 'Otra (cargo la tasa)' }], no: 'No da intereses' });
  if (!s.savingMode) q.push({ id: 'savingMode', p: 92, title: 'Tu forma de ahorrar', kind: 'choice', lesson: 'modos',
    text: '¿Cómo te gustaría ahorrar? Elegí la que te resulte más cómoda; la podés cambiar cuando quieras en Mi plata → Ahorros → Cómo ahorro.',
    options: [
      { value: 'payFirst:10', label: 'Apartar el 10% apenas cobro' },
      { value: 'payFirst:15', label: 'Apartar el 15% apenas cobro' },
      { value: 'payFirst:20', label: 'Apartar el 20% apenas cobro' },
      { value: 'fixed', label: 'Un monto fijo por mes' },
      { value: 'leftover', label: 'Lo que me sobre a fin de mes' },
      { value: 'roundup', label: 'Redondear cada gasto' },
    ], no: 'Por ahora no quiero ahorrar' });
  if (s.savingMode === 'fixed' && !(s.rules.custom || []).some((c) => c.id === 'r_fixed')) q.push({ id: 'savingAmount', p: 91, text: '¿Cuánto querés apartar por mes?', kind: 'amount', placeholder: 'Ej: 100.000' });
  return q.sort((a, b) => b.p - a.p);
}

const isOpen = (s, id) => {
  const a = (s.asked || {})[id];
  if (!a) return true;
  if (a.done) return false;
  return !a.until || a.until <= todayISO();
};

export function nextQuestion(s) {
  const log = s.askLog;
  if (log && log.date === todayISO() && log.count >= DAILY_LIMIT) return null;
  return candidates(s).find((q) => isOpen(s, q.id)) || null;
}

export function knownPct(s) {
  const missing = candidates(s).filter((q) => BASE_IDS.includes(q.id) && !(s.asked[q.id] && s.asked[q.id].done)).length;
  return Math.round((1 - missing / BASE_IDS.length) * 100);
}

function controls(q) {
  const send = `<button type="submit" class="icon-btn green" aria-label="Responder">${icon('send', 20, 2.2)}</button>`;
  const no = q.no ? `<button class="chip" data-action="guideQChoice" data-qid="${esc(q.id)}" data-value="__no">${esc(q.no)}</button>` : '';
  switch (q.kind) {
    case 'info':
      return `<button class="btn green small" data-action="${q.button.action}">${esc(q.button.label)}</button>`;
    case 'amount':
      return `<form class="quick" data-submit="guideQAnswer" autocomplete="off"><input type="hidden" name="qid" value="${esc(q.id)}"><label class="sr-only" for="gq">${esc(q.placeholder)}</label><input id="gq" name="amount" placeholder="${esc(q.placeholder)}" inputmode="decimal">${send}</form>${no ? `<div class="chips">${no}</div>` : ''}`;
    case 'amountWhere':
      return `<form class="form" data-submit="guideQAnswer" autocomplete="off"><input type="hidden" name="qid" value="${esc(q.id)}">
        <div class="field"><label for="gq-w">¿Dónde lo tenés?</label><select id="gq-w" name="where">${HOLDING_TYPES.map((h) => `<option value="${h.id}">${h.label}</option>`).join('')}</select></div>
        <div class="field-row">
          <div class="field"><label for="gq-a">¿Cuánto?</label><input id="gq-a" name="amount" inputmode="decimal" placeholder="Ej: 300.000"></div>
          <div class="field"><label for="gq-c">Moneda</label><select id="gq-c" name="currency">${ASSETS.map((a) => `<option value="${a.id}">${a.label}</option>`).join('')}</select></div>
        </div>
        <span class="small muted">Si tenés en varios lugares, cargá uno ahora y el resto en Ahorro.</span>
        <button class="btn green small" type="submit">Listo</button></form>${no ? `<div class="chips">${no}</div>` : ''}`;
    case 'select':
      return `<form class="quick" data-submit="guideQAnswer"><input type="hidden" name="qid" value="${esc(q.id)}"><label class="sr-only" for="gq-s">${esc(q.title || '')}</label><select id="gq-s" name="value"><option value="">Elegí…</option>${q.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>${send}</form>`;
    case 'choice':
      return `<div class="chips ${q.options.some((o) => typeof o === 'object') ? 'stack' : ''}">${q.options.map((o) => { const v = typeof o === 'object' ? o.value : o; const l = typeof o === 'object' ? o.label : o; return `<button class="chip" data-action="guideQChoice" data-qid="${esc(q.id)}" data-value="${esc(v)}">${esc(l)}</button>`; }).join('')}${no}</div>
        ${q.lesson ? `<button class="btn ghost small" data-action="openLesson" data-id="${q.lesson}" style="align-self:flex-start;min-height:36px;padding:0 4px">¿Cuál me conviene?</button>` : ''}
        ${q.other ? `<form class="quick" data-submit="guideQAnswer" autocomplete="off"><input type="hidden" name="qid" value="${esc(q.id)}"><label class="sr-only" for="gq-o">${esc(q.other)}</label><input id="gq-o" name="other" placeholder="${esc(q.other)}">${send}</form>` : ''}`;
    default: return '';
  }
}

export function renderQuestion(s) {
  const q = nextQuestion(s);
  if (!q) return '';
  return `<div class="card ask">
    <div class="tip-head"><span class="badge">${sprout(17)}</span><strong>${esc(q.title || 'Pesitos quiere saber')}</strong><span class="small muted">Te conozco un ${knownPct(s)}%</span></div>
    <p class="text ask-q">${esc(q.text)}</p>
    ${controls(q)}
    <button class="btn ghost small" data-action="guideQLater" data-qid="${esc(q.id)}" style="align-self:flex-start;min-height:36px;padding:0 4px">Después</button>
  </div>`;
}

function markDone(s, id) {
  s.asked[id] = { done: true };
  const today = todayISO();
  s.askLog = s.askLog && s.askLog.date === today ? { date: today, count: s.askLog.count + 1 } : { date: today, count: 1 };
}

function apply(ctx, qid, input) {
  const q = candidates(ctx.state).find((x) => x.id === qid);
  if (!q) return;
  const no = input.value === '__no';
  const amount = input.amount ? num(input.amount) || parseAmount(input.amount) || 0 : 0;
  if (!no && (q.kind === 'amount' || q.kind === 'amountWhere') && !amount) { toast('No entendí el monto. Ejemplo: 60.000'); return; }
  if (!no && q.id === 'goal' && !(input.other || input.value || '').trim()) return;
  if (q.kind === 'select' && !input.value) { toast('Elegí una opción'); return; }
  let msg = 'Anotado, gracias';
  let openHoldingAfter = '';
  ctx.commit((s) => {
    if (!no) {
      switch (q.id) {
        case 'salary':
          s.incomes.push({ id: uid(), date: todayISO(), amount, type: 'sueldo', note: notaCobro(s), ...(s.cuentaSueldo ? { accountId: s.cuentaSueldo } : {}) });
          msg = 'Listo, ya calculo tu día';
          break;
        case 'goal': {
          const name = (input.other || input.value).trim();
          const sal = s.incomes.filter((i) => i.type === 'sueldo').sort((a, b) => b.date.localeCompare(a.date))[0];
          s.goals.forEach((g) => { g.main = false; });
          s.goals.push({ id: uid(), name: name.slice(0, 40), target: 0, saved: 0, monthly: sal ? Math.round(sal.amount * 0.15) : 0, main: true });
          msg = '¡Buenísimo! Después vemos cuánto necesitás';
          break;
        }
        case 'goalTarget': {
          const g = s.goals.find((x) => x.id === q.goalId);
          if (g) g.target = amount;
          msg = 'Ya calculo cuándo llegás';
          break;
        }
        case 'savings': {
          const t = HOLDING_TYPES.find((h) => h.id === input.where) || HOLDING_TYPES[0];
          s.holdings.push({ id: uid(), type: t.id, name: t.label.replace(/ \(.*\)$/, ''), amount, currency: input.currency || t.asset });
          msg = 'Anotado en Ahorro';
          break;
        }
        case 'savingMode': {
          const [mode, pct] = String(input.value).split(':');
          s.savingMode = mode;
          s.rules.payFirst.on = mode === 'payFirst';
          if (pct) s.rules.payFirst.pct = Number(pct);
          s.rules.roundup.on = mode === 'roundup';
          if (mode === 'roundup') s.savingMode = 'leftover'; // el redondeo es un extra
          msg = { payFirst: `Listo: cuando cobres te recuerdo apartar el ${pct}%`, leftover: 'Listo: a fin de mes te digo cuánto te sobró para apartarlo', roundup: 'Listo: cada gasto se redondea y la diferencia va al ahorro', fixed: 'Perfecto, ahora decime cuánto' }[mode];
          break;
        }
        case 'province':
          s.profile.province = PROVINCES.includes(input.value) ? input.value : '';
          msg = 'Listo, te muestro las promos de tu zona';
          break;
        case 'savingAmount': {
          s.rules.custom = (s.rules.custom || []).filter((c) => c.id !== 'r_fixed');
          s.rules.custom.push({ id: 'r_fixed', name: 'Ahorro mensual fijo', type: 'fixedMonthly', value: amount, on: true });
          const g = s.goals.find((x) => x.main) || s.goals[0];
          if (g && !g.monthly) g.monthly = amount;
          msg = `Listo: ${money(amount)} por mes`;
          break;
        }
        default:
          if (q.holdingId) {
            const h = s.holdings.find((x) => x.id === q.holdingId);
            if (h && input.value === 'otra') { h.rinde = 'manual'; h.since = h.since || todayISO(); openHoldingAfter = h.id; msg = 'Cargá la tasa y listo'; }
            else if (h) { h.rinde = input.value; h.since = todayISO(); msg = 'Listo: desde hoy sumo los intereses de cada día'; }
          }
          break;
      }
    }
    if (no && q.holdingId) { const h = s.holdings.find((x) => x.id === q.holdingId); if (h) h.rinde = 'no'; }
    if (no && q.id === 'savingMode') { s.savingMode = 'none'; s.rules.payFirst.on = false; }
    // si la meta principal no tiene aporte, usa lo que marcan las reglas
    const g = s.goals.find((x) => x.main) || s.goals[0];
    const sal = s.incomes.filter((i) => i.type === 'sueldo').sort((a, b) => b.date.localeCompare(a.date))[0];
    if (g && !g.monthly && s.rules.payFirst.on && sal) g.monthly = Math.round((sal.amount * s.rules.payFirst.pct) / 100);
    markDone(s, q.id);
  });
  if (q.id === 'province') refreshLive(ctx, true);
  if (openHoldingAfter) { const b = document.createElement('button'); b.dataset.action = 'editHolding'; b.dataset.id = openHoldingAfter; document.body.appendChild(b); b.click(); b.remove(); }
  toast(no ? (q.id === 'savingMode' ? 'Entendido. Cuando quieras, lo activás en Mi plata → Ahorros → Cómo ahorro' : 'Perfecto, sigo con otra cosa') : msg);
}

// ---------- sugerencias de mejora ----------
const VARIABLE_CATS = new Set(['super', 'comida', 'transporte', 'vehiculo', 'compras', 'salud', 'ocio', 'regalos', 'viajes', 'mascotas']);
const FIXED_LIKE = new Set(['vivienda', 'servicios', 'suscripciones', 'educacion', 'deporte', 'otros']);
const ES_SUSCRIPCION = /netflix|spotify|disney|hbo|\bmax\b|prime video|amazon prime|paramount|youtube|icloud|google one|chatgpt|claude|canva|adobe|office 365|microsoft 365|dropbox|deezer|crunchyroll|mubi|suscripcion|membresia|patreon|twitch|game pass|playstation plus|apple (music|tv|one)|duolingo|vpn|kindle|audible|flow|directv go|fanatiz|universal\+/;

export function suggestions(s) {
  const out = [];
  const mk = monthKey();
  const dismissed = s.dismissed || {};

  // 1. Algo cargado como fijo que en realidad suele variar
  for (const f of s.fixed) {
    const cat = guessCategory(f.name, s.learned);
    const id = 'fixvar-' + f.id;
    if (VARIABLE_CATS.has(cat) && !dismissed[id]) {
      out.push({ id, text: `Cargaste "${f.name}" como gasto fijo, pero ${catLabel(cat).toLowerCase()} suele variar de un mes a otro. Si lo anotás como gasto variable, tu "hoy podés gastar" es más preciso.`,
        yes: { label: 'Pasarlo a variable', action: 'fixToVariable', data: `data-id="${f.id}"` }, impact: f.amount, why: 'Afecta tu "hoy podés gastar" todos los días' });
    }
  }

  // 2. Un gasto fijo que además se anotó como gasto (se cuenta dos veces)
  for (const f of s.fixed) {
    const key = merchantKey(f.name);
    if (!key) continue;
    const dup = s.expenses.find((e) => !e.pending && e.date.slice(0, 7) === mk && merchantKey(e.note) === key);
    const id = 'dup-' + (dup && dup.id);
    if (dup && !dismissed[id]) {
      out.push({ id, text: `Anotaste "${dup.note}" (${money(dup.amount)}) como gasto, pero ya es un gasto fijo: se estaría contando dos veces.`,
        yes: { label: 'Borrar el gasto', action: 'deleteDuplicate', data: `data-id="${dup.id}"` }, impact: dup.amount, why: 'Hoy se está contando dos veces' });
    }
  }

  // 3. Algo que pagás todos los meses y no está como fijo
  const from = addMonthKey(mk, -3);
  const groups = {};
  for (const e of s.expenses) {
    if (e.pending || e.installments > 1 || e.date.slice(0, 7) < from) continue;
    const key = merchantKey(e.note);
    if (key) (groups[key] = groups[key] || []).push(e);
  }
  for (const [key, list] of Object.entries(groups)) {
    if (s.fixed.some((f) => normalize(f.name).includes(key))) continue;
    list.sort((a, b) => b.date.localeCompare(a.date));
    const last = list[0];
    const months = new Set(list.map((e) => e.date.slice(0, 7)));
    const similar = list.every((e) => Math.abs(e.amount - last.amount) <= last.amount * 0.05);
    // servicios: montos que varían un poco, pero se pagan siempre cerca del mismo día
    const days = list.map((e) => Number(e.date.slice(8, 10)));
    const sameDay = Math.max(...days) - Math.min(...days) <= 5;
    const close = list.every((e) => Math.abs(e.amount - last.amount) <= last.amount * 0.25);
    const looksBill = months.size >= 2 && sameDay && close && !VARIABLE_CATS.has(last.category);
    const id = 'rec-' + key;
    if (!dismissed[id] && (ES_SUSCRIPCION.test(normalize(last.note || '')) || (months.size >= 2 && similar && FIXED_LIKE.has(last.category)) || looksBill)) {
      out.push({ id, text: looksBill && !similar
        ? `Parece que ${last.note} es un vencimiento mensual: lo pagás siempre alrededor del día ${Math.round(days.reduce((a, d) => a + d, 0) / days.length)} (último: ${money(last.amount)}). ¿Lo agendo como gasto fijo para avisarte antes?`
        : `Vi que pagás ${last.note} todos los meses (${money(last.amount)}). ¿Lo agrego como gasto fijo así lo descuento solo y te aviso antes del vencimiento?`,
        yes: { label: 'Sí, agregarlo', action: 'makeFixed', data: `data-name="${esc(last.note)}" data-amount="${last.amount}" data-day="${Math.round(days.reduce((a, d) => a + d, 0) / days.length)}"` }, impact: last.amount, why: 'Así lo descuento solo y te aviso antes de que venza' });
    }
  }
  // lo que aprendí de tus hábitos (js/habitos.js)
  try { out.push(...aprendizajes(s)); } catch (err) { console.warn('aprendizajes', err); }
  // primero la que más plata mueve por mes (las alertas, siempre arriba)
  return out.sort((a, b) => (b.tipo === 'alerta') - (a.tipo === 'alerta') || b.impact - a.impact);
}

export function renderSuggestion(sg) {
  const titulo = sg.titulo || 'Pesitos sugiere una mejora';
  return `<div class="card suggest${sg.tipo === 'alerta' ? ' alerta' : ''}">
    <div class="tip-head"><span class="badge">${sprout(17)}</span><strong>${esc(titulo)}</strong></div>
    <p class="text">${esc(sg.text)}</p>
    <span class="small muted">${sg.impact ? `${sg.tipo === 'alerta' ? 'En juego' : 'Impacto'}: ${money(sg.impact)} por mes · ` : ''}${esc(sg.why)}</span>
    <div class="btn-row">
      ${sg.yes ? `<button class="btn small green" data-action="${sg.yes.action}" data-sid="${esc(sg.id)}" ${sg.yes.data}>${esc(sg.yes.label)}</button>` : ''}
      <button class="btn small" data-action="dismissSuggestion" data-sid="${esc(sg.id)}">${sg.yes ? 'Está bien así' : 'Entendido'}</button>
    </div>
  </div>`;
}

export const guideActions = {
  guideQChoice(ctx, el) { apply(ctx, el.dataset.qid, { value: el.dataset.value }); },
  guideQAnswer(ctx, d) { apply(ctx, d.qid, d); },
  guideQLater(ctx, el) {
    ctx.commit((s) => { s.asked[el.dataset.qid] = { until: toISO(addDays(new Date(), SNOOZE_DAYS)) }; });
    toast('Dale, te pregunto en unos días');
  },
};
