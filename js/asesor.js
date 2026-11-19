// Asesor: lecciones (Aprendé) y consultas.
// La forma de ahorrar y las reglas se muestran en Mi plata → Ahorros → Cómo ahorro; los desafíos, en Mi plata → Metas
// (planAhorroHtml), pero sus acciones siguen acá.

import { money, esc, num, monthKey, todayISO } from './formato.js';
import { allCategories, catLabel, CHALLENGE_TYPES, CUSTOM_RULE_TYPES, RULE_PRESETS } from './categorias.js';
import { monedaBase, arsPer } from './cotizaciones.js';
import { challengeStatus, allChallenges, answer, DISCLAIMER } from './economista.js';
import { LESSONS } from './aprender.js';
import { aprendizajes, loQueSe } from './habitos.js';
import { renderSuggestion } from './guia.js';
import { ayudaHtml } from './ayuda.js';
import { budget, monthIncome, monthExpenses, fixedTotal } from './calculos.js';
import { sprout, icon, screenHead, openModal, closeModal, toast, borrarConDeshacer } from './interfaz.js';
import { uid } from './almacenamiento.js';

let tab = 'consultas'; // 'consultas' | 'aprende' | 'ayuda'
let masPreguntas = false;
const PREGUNTAS = ['¿Cuánto puedo gastar hoy?', '¿Qué vence esta semana?', '¿Cuánto gasté este mes?', '¿Me compro algo de $80.000?',
  '¿Cuánto tengo en mis cuentas?', '¿6 cuotas o contado con 10%? $300.000', '¿Dónde rinde más mi plata?', '¿A cuánto está el dólar?', '¿Qué promos tengo hoy?',
  '¿Le gané a la inflación?', '¿Cómo van mis metas?', '¿Quién me debe plata?', '¿Qué es el dólar MEP?', '¿Qué es un plazo fijo UVA?', '¿Conviene pagar el mínimo de la tarjeta?', '¿Cómo importo el resumen de la tarjeta?']; 

const MODE_LABEL = (s) => ({
  payFirst: `Apartás el ${s.rules.payFirst.pct}% apenas cobrás.`,
  fixed: 'Apartás un monto fijo por mes.',
  leftover: 'Ahorrás lo que te sobra a fin de mes.',
  roundup: 'Redondeás cada gasto y la diferencia va al ahorro.',
  none: 'Por ahora no elegiste ahorrar. Cuando quieras, elegí una forma.',
}[s.savingMode] || 'Todavía no elegiste cómo ahorrar.');

const BUILTIN = [
  { key: 'payFirst', name: 'Págate primero', text: (r) => `El día que cobrás, apartás el ${r.pct}% de lo que cobrás`, param: 'pct', unit: '%' },
  { key: 'raiseHalf', name: 'Ahorro por aumento', text: (r) => `El ${r.pct}% de cada aumento va a tus metas`, param: 'pct', unit: '%' },
  { key: 'extraPct', name: 'Ingresos extra', text: (r) => `El ${r.pct}% de cada ingreso extra va al ahorro`, param: 'pct', unit: '%' },
  { key: 'roundup', name: 'Redondeo', text: (r) => `Cada gasto se redondea a ${money(r.to)} y la diferencia va al ahorro`, param: 'to', unit: '$' },
  { key: 'r503020', name: '50 / 30 / 20', text: () => 'Necesidades, gustos y al menos 20% de ahorro' },
];
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const catOpts = (sel) => allCategories().filter((c) => !['varios', 'otros'].includes(c.id)).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.label}</option>`).join('');

function customText(c) {
  if (c.type === 'pctSalary') return `El ${c.value}% de lo que cobrás`;
  if (c.type === 'fixedMonthly') return `${money(c.value)} por mes`;
  if (c.type === 'porGasto') return `${money(c.value)} cada vez que gastás en ${catLabel(c.category).toLowerCase()}`;
  if (c.type === 'bajoTope') return `Lo que no gastes de ${money(c.value)} en ${catLabel(c.category).toLowerCase()}`;
  if (c.type === 'pctIngresos') return `El ${c.value}% de todo lo que entra`;
  if (c.type === 'porSemana') return `${money(c.value)} por semana (≈ ${money(c.value * 4.33)} por mes)`;
  if (c.type === 'porDia') return `${money(c.value)} por día (≈ ${money(c.value * 30)} por mes)`;
  return `El ${c.value}% de lo que gastás en ${catLabel(c.category).toLowerCase()}`;
}

function aplicarModo(ctx, mode, pct, fijo, silencio = false) {
  ctx.commit((s) => {
    s.savingMode = mode;
    s.rules.payFirst.on = mode === 'payFirst';
    if (pct) s.rules.payFirst.pct = Number(pct);
    s.rules.custom = (s.rules.custom || []).filter((c) => c.id !== 'r_fixed');
    if (mode === 'fixed') s.rules.custom.push({ id: 'r_fixed', name: 'Ahorro mensual fijo', type: 'fixedMonthly', value: fijo, on: true });
    s.asked = s.asked || {}; s.asked.savingMode = { done: true };
  });
  if (!silencio) toast(`Listo: ${MODE_LABEL(ctx.state).replace(/\.$/, '').toLowerCase()}`);
}

// La forma principal (una sola). El redondeo, los ingresos extra y los aumentos son extras (se suman).
const MODOS = [
  ['payFirst:10', 'Apartar el 10% apenas cobro', 'Lo que mejor funciona: primero ahorrás, después gastás.'],
  ['payFirst:15', 'Apartar el 15% apenas cobro', 'Un poco más.'],
  ['payFirst:20', 'Apartar el 20% apenas cobro', 'Más rápido.'],
  ['payFirst:otro', 'Apartar otro porcentaje', 'Vos elegís cuánto (por ejemplo, 5% para empezar).'],
  ['fixed', 'Un monto fijo por mes', 'Ideal si tus ingresos cambian de un mes a otro.'],
  ['leftover', 'Lo que me sobre a fin de mes', 'Te aviso cuánto sobró para apartarlo.'],
  ['none', 'Por ahora no quiero ahorrar', 'Lo podés cambiar cuando quieras.'],
];
const EXTRAS = [
  { key: 'roundup', name: 'Redondear cada gasto', text: (r) => `Cada gasto se redondea a ${money(r.to)} y la diferencia va al ahorro`, param: 'to', unit: '$' },
  { key: 'extraPct', name: 'Parte de los ingresos extra', text: (r) => `El ${r.pct}% de cada ingreso extra (aguinaldo, changas, ventas)`, param: 'pct', unit: '%' },
  { key: 'raiseHalf', name: 'Parte de cada aumento', text: (r) => `El ${r.pct}% de cada aumento de lo que cobrás`, param: 'pct', unit: '%' },
];

// ---------- lo que te sugiero, según cómo manejás tu plata ----------
const mesesAtras = (n) => { const d = new Date(); return Array.from({ length: n }, (_, i) => { const x = new Date(d.getFullYear(), d.getMonth() - 1 - i, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; }); };
export function sugerenciaAhorro(s) {
  const meses = mesesAtras(3).filter((mk) => monthIncome(s, mk) > 0);
  if (meses.length < 2) return { listo: false, txt: `Todavía estoy aprendiendo cómo manejás tu plata. Con ${meses.length ? 'un mes más' : 'dos meses'} de ingresos y gastos cargados te digo qué forma te conviene.` };
  const datos = meses.map((mk) => {
    const ing = monthIncome(s, mk);
    const extra = s.incomes.filter((x) => x.date.slice(0, 7) === mk && x.type !== 'sueldo').reduce((a, x) => a + x.amount, 0);
    const gas = monthExpenses(s, mk).total + fixedTotal(s, mk);
    const chicos = s.expenses.filter((e) => !e.pending && e.date.slice(0, 7) === mk && e.amount < ing * 0.01).length;
    return { ing, extra, sobra: ing - gas, pct: (ing - gas) / ing, chicos };
  });
  const prom = (f) => datos.reduce((a, x) => a + f(x), 0) / datos.length;
  const ingProm = prom((x) => x.ing);
  const varia = Math.sqrt(prom((x) => (x.ing - ingProm) ** 2)) / ingProm;
  const pctMin = Math.min(...datos.map((x) => x.pct)); const pctProm = prom((x) => x.pct);
  const sobraMin = Math.min(...datos.map((x) => x.sobra));
  const r5 = (x) => Math.max(5, Math.min(30, Math.floor(x * 20) * 5));
  let modo; let pct = 0; let fijo = 0; let por;
  if (varia > 0.25 && sobraMin > 0) { modo = 'fixed'; fijo = Math.round((sobraMin * 0.8) / 1000) * 1000 || Math.round(sobraMin * 0.8); por = `tus ingresos cambian bastante de un mes a otro, y aun en el peor mes te sobraron ${money(sobraMin)}`; }
  else if (pctMin >= 0.1) { modo = 'payFirst'; pct = r5(pctMin); por = `en los últimos ${datos.length} meses siempre te sobró al menos el ${Math.round(pctMin * 100)}% de lo que entró: apartarlo apenas cobrás asegura que no se vaya en gastos`; }
  else if (pctProm > 0.02) { modo = 'payFirst'; pct = 5; por = `te sobra poco (en promedio, el ${Math.round(pctProm * 100)}%): empezar con un 5% apenas cobrás arma el hábito sin ahogarte`; }
  else { modo = 'leftover'; por = 'hoy gastás casi todo lo que entra: primero conviene ver qué sobra a fin de mes y bajar algún gasto'; }
  const extras = [];
  if (prom((x) => x.extra) > ingProm * 0.1) extras.push(['extraPct', 'tenés ingresos extra seguido']);
  if (prom((x) => x.chicos) >= 20) extras.push(['roundup', `hacés muchas compras chicas (${Math.round(prom((x) => x.chicos))} por mes)`]);
  const nombre = modo === 'payFirst' ? `Apartar el ${pct}% apenas cobrás` : modo === 'fixed' ? `Apartar ${money(fijo)} fijos por mes` : 'Ahorrar lo que te sobre a fin de mes';
  const igual = s.savingMode === modo && (modo !== 'payFirst' || Number(s.rules.payFirst.pct) === pct);
  return { listo: true, modo, pct, fijo, nombre, por, extras: extras.filter(([k]) => !s.rules[k].on), igual, meses: datos.length };
}
function sugerenciaHtml(s) {
  const g = sugerenciaAhorro(s);
  if (!g.listo) return `<div class="card"><strong>${sprout(18)} Lo que te sugiero</strong><span class="small muted">${esc(g.txt)}</span></div>`;
  if (g.igual && !g.extras.length) return `<div class="card"><strong>${sprout(18)} Vas bien</strong><span class="small">Por cómo venís estos ${g.meses} meses, la forma que elegiste es la que te conviene.</span></div>`;
  const ext = { roundup: 'sumá el redondeo', extraPct: 'sumá una parte de los ingresos extra' };
  return `<div class="card lime"><strong>${sprout(18)} Te sugiero: ${esc(g.igual ? 'seguí con tu forma' : g.nombre)}</strong>
    <span class="small">${g.igual ? '' : `Porque ${esc(g.por)}.`}${g.extras.length ? ` Además, ${g.extras.map(([k, r]) => `${ext[k]} (${esc(r)})`).join(' y ')}.` : ''}</span>
    <span class="small muted">Lo calculo con tus últimos ${g.meses} meses y lo voy ajustando a medida que cargás.</span>
    <button class="btn small green" data-action="usarSugerenciaAhorro" style="align-self:flex-start">Usar la sugerencia</button></div>`;
}

/** Pantalla #/formaahorro: el único lugar donde se elige cómo ahorrar. */
export const formaAhorro = {
  render(s) {
    const pf = s.rules.payFirst || {}; const fijo = (s.rules.custom || []).find((c) => c.id === 'r_fixed');
    const esOtro = s.savingMode === 'payFirst' && ![10, 15, 20].includes(Number(pf.pct));
    const act = s.savingMode === 'payFirst' ? (esOtro ? 'payFirst:otro' : `payFirst:${pf.pct}`) : s.savingMode;
    const extrasOn = EXTRAS.filter((r) => s.rules[r.key].on).length + (s.rules.custom || []).filter((c) => c.on && c.id !== 'r_fixed').length;
    return `<section class="screen">
      ${screenHead('Tu forma de ahorrar', '', 'Una principal y, si querés, extras que se suman')}
      <div class="card"><span class="small muted">Ahora</span><strong>${esc(MODE_LABEL(s))}</strong>${extrasOn ? `<span class="small">Más ${extrasOn} extra${extrasOn === 1 ? '' : 's'} que se suma${extrasOn === 1 ? '' : 'n'}.</span>` : ''}</div>
      ${sugerenciaHtml(s)}
      <div class="section-title"><span>1. La principal (elegí una)</span></div>
      <div class="ahorro-ops">
        ${MODOS.map(([v, t, d]) => `<button class="ahorro-op ${v === act ? 'on' : ''}" data-action="elegirModoAhorro" data-v="${v}" ${v === act ? 'aria-current="true"' : ''}>
          <b>${v === 'payFirst:otro' && esOtro ? `Apartar el ${pf.pct}% apenas cobro` : t}${v === act ? ' <span class="pill ok">Elegida</span>' : ''}</b><span>${d}</span></button>`).join('')}
      </div>
      <form class="card form" data-submit="guardarModoOtro" data-otro ${act === 'payFirst:otro' ? '' : 'hidden'}>
        <div class="field"><label for="mo-p">Porcentaje que apartás apenas cobrás</label><input id="mo-p" name="pct" inputmode="decimal" value="${esOtro ? pf.pct : ''}" placeholder="Ej: 5"></div>
        <button class="btn primary block" type="submit">Guardar porcentaje</button>
      </form>
      <form class="card form" data-submit="guardarModoFijo" data-fijo ${s.savingMode === 'fixed' ? '' : 'hidden'}>
        <div class="field"><label for="mo-f">Monto fijo por mes</label><input id="mo-f" name="fijo" inputmode="decimal" value="${fijo ? fijo.value : ''}" placeholder="Ej: 100.000"></div>
        <button class="btn primary block" type="submit">Guardar monto</button>
      </form>
      <div class="section-title"><span>2. Extras (opcionales, se suman)</span></div>
      <div class="card tight">
        ${EXTRAS.map((r) => { const v = s.rules[r.key]; return `<div class="row">
          <span class="grow"><span class="name">${r.name}</span><span class="meta">${esc(r.text(v))}</span></span>
          <button class="chip" data-action="editRule" data-key="${r.key}" aria-label="Cambiar ${r.name}">${r.unit === '$' ? money(v[r.param]) : v[r.param] + '%'}</button>
          <button class="switch" role="switch" aria-checked="${v.on}" aria-label="${r.name}" data-action="toggleRule" data-key="${r.key}"></button></div>`; }).join('')}
      </div>
      <p class="small muted" style="margin:0">También podés crear reglas propias (por ejemplo, "cada vez que pido delivery, aparto $1.000") en Mi plata → Ahorros → Cómo ahorro.</p>
      ${lessonBtn()}
    </section>`;
  },
};
const lessonBtn = () => '<button class="btn ghost small" data-action="openLesson" data-id="modos" style="align-self:flex-start">¿Cuál me conviene?</button>';

// Mi plata → Ahorros: "Cómo ahorro" (forma de ahorrar + reglas), plegado
export function comoAhorroHtml(s, abierto = false) {
  const b = budget(s);
  return `<details class="card plegable" id="como-ahorro"${abierto ? ' open' : ''}><summary><strong>Cómo ahorro</strong> <span class="small muted">${esc(MODE_LABEL(s))}</span></summary>
    <div class="topbar"><strong style="font-size:14px">Tu forma de ahorrar</strong><button class="chip" data-action="changeMode">Cambiar</button></div>
    <span class="text">${esc(MODE_LABEL(s))}</span>
    <button class="btn ghost small" data-action="openLesson" data-id="modos" style="align-self:flex-start;min-height:36px;padding:0 4px">¿Cuál me conviene?</button>
    <div class="section-title"><span>Reglas de ahorro</span><button data-action="newRule">+ Crear regla</button></div>
    <div class="tight">
      ${BUILTIN.map((r) => { const v = s.rules[r.key]; return `<div class="row">
        <span class="grow"><span class="name">${r.name}</span><span class="meta">${esc(r.text(v))}</span></span>
        ${r.param ? `<button class="chip" data-action="editRule" data-key="${r.key}" aria-label="Cambiar ${r.name}">${r.unit === '$' ? money(v[r.param]) : v[r.param] + '%'}</button>` : ''}
        <button class="switch" role="switch" aria-checked="${v.on}" aria-label="${r.name}" data-action="toggleRule" data-key="${r.key}"></button>
      </div>`; }).join('')}
      ${s.rules.custom.map((c) => `<div class="row">
        <button class="grow" data-action="editCustomRule" data-id="${c.id}" style="background:none;border:none;text-align:left;padding:0"><span class="name">${esc(c.name)} <span class="pill">Propia</span></span><span class="meta">${esc(customText(c))}</span></button>
        <button class="switch" role="switch" aria-checked="${c.on}" aria-label="${esc(c.name)}" data-action="toggleCustomRule" data-id="${c.id}"></button>
      </div>`).join('')}
    </div>
    ${b.savingPlan > 0 ? `<span class="small muted">Este ciclo tus reglas apartan ${money(b.savingPlan)}: ${b.savingParts.map((p) => `${esc(p.name)} ${money(p.amount)}`).join(' · ')}.</span>` : ''}
  </details>`;
}

// Mi plata → Metas → Desafíos de ahorro
export function desafiosHtml(s) {
  const ch = challengeStatus(s);
  return `<div class="section-title"><span>Desafíos de ahorro</span><button data-action="newChallenge">+ Crear desafío</button></div>
    ${ch ? `<div class="card">
      <div class="topbar"><strong style="font-size:14px">${esc(ch.def.name)}</strong><span class="pill ${ch.broken ? 'warn' : 'lime'}">${ch.broken ? 'Se cortó' : ch.done ? '¡Completado!' : `Día ${ch.day} de ${ch.def.days}`}</span></div>
      <div class="bar"><span style="width:${Math.round(ch.pct * 100)}%"></span></div>
      <span class="small muted">${esc(ch.detail)} ${ch.broken ? 'No pasa nada: podés empezar de nuevo.' : `Llevás unos ${money(ch.estimate)} ahorrados frente a tu ritmo habitual.`}</span>
      <div class="btn-row">
        ${ch.done ? `<button class="btn small green" data-action="claimChallenge" data-amount="${ch.estimate}">Sumar al contador</button>` : ''}
        ${ch.broken ? `<button class="btn small green" data-action="startChallenge" data-id="${ch.def.id}">Empezar de nuevo</button>` : ''}
        <button class="btn small" data-action="stopChallenge">${ch.broken || ch.done ? 'Cerrar desafío' : 'Abandonar'}</button>
      </div>
    </div>` : `<div class="card"><span class="small muted">Elegí uno y te muestro cuánto ahorrás frente a tu ritmo de siempre.</span>
      <div class="chips">${allChallenges(s).map((c) => `<button class="chip" data-action="startChallenge" data-id="${c.id}">${esc(c.name)}</button>`).join('')}</div></div>`}

`;
}

// Lo que Pesitos aprendió de vos y los consejos que salen de eso (js/habitos.js)
function aprendidoHtml(s) {
  const ap = aprendizajes(s);
  return `<div class="section-title"><span>Lo que aprendí de vos</span></div>
    <div class="card tight aprendi">${loQueSe(s).map((t) => `<span class="text">• ${t}</span>`).join('')}</div>
    ${ap.length ? ap.map(renderSuggestion).join('') : '<p class="small muted" style="margin:0">Por ahora no tengo consejos nuevos: vas bien. Los reviso cada vez que anotás algo.</p>'}`;
}

export function render(s) {
  const chat = s.chat.slice(-8);
  return `<section class="screen">
    ${screenHead('Asesor y ayuda', '', 'Consultá, aprendé o buscá cómo se usa')}

    <div class="tabs" role="tablist" aria-label="Sección" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      ${[['consultas', 'Consultas'], ['aprende', 'Aprendé'], ['ayuda', 'Ayuda']].map(([v, l]) => `<button role="tab" data-action="asesorTab" data-v="${v}" aria-pressed="${tab === v}">${l}</button>`).join('')}
    </div>


    ${tab === 'aprende' ? `
    <p class="small muted" style="margin:0">Lecciones cortas para manejar mejor tu plata. Leíste ${LESSONS.filter((l) => s.lessonsSeen[l.id]).length} de ${LESSONS.length}.</p>
    <div class="bar" style="height:6px"><span style="width:${Math.round((LESSONS.filter((l) => s.lessonsSeen[l.id]).length / LESSONS.length) * 100)}%"></span></div>
    <div class="card tight">
      ${LESSONS.map((l) => `<button class="row" data-action="openLesson" data-id="${l.id}"><span class="grow"><span class="name" style="white-space:normal">${esc(l.title)}</span></span>${s.lessonsSeen[l.id] ? '<span class="pill ok">Leída</span>' : ''}${icon('chevron', 16)}</button>`).join('')}
    </div>

    ` : ''}

    ${tab === 'consultas' ? `
    ${aprendidoHtml(s)}
    <div class="section-title"><span>Consultale a Pesitos</span>${s.chat.length ? '<button data-action="clearChat">Limpiar</button>' : ''}</div>
    <div class="chat">
      ${chat.length ? chat.map((m) => `<div class="bubble ${m.from}">${esc(m.text)}</div>`).join('') : '<div class="bubble bot">Hola. Preguntame lo que quieras de tu plata, con tus palabras: cuánto podés gastar hoy, qué vence, cuánto gastaste en algo, si te conviene una compra, dónde rinde más o dónde está cada cosa en la app.</div>'}
    </div>
    <div class="chips">
      ${PREGUNTAS.slice(0, masPreguntas ? PREGUNTAS.length : 4).map((q) => `<button class="chip" data-action="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
      <button class="chip mas" data-action="masPreguntas">${masPreguntas ? 'Menos' : 'Más preguntas'}</button>
    </div>
    <form class="quick" data-submit="askForm" autocomplete="off">
      <label for="ask" class="sr-only">Escribí tu consulta</label>
      <input id="ask" name="q" placeholder="Escribí tu consulta" enterkeyhint="send">
      <button type="submit" class="icon-btn green" aria-label="Enviar">${icon('send', 20, 2.2)}</button>
    </form>
    <p class="small muted" style="margin:0">${DISCLAIMER}</p>
    ` : ''}
    ${tab === 'ayuda' ? ayudaHtml() : ''}
  </section>`;
}

// los montos de las ideas están pensados en pesos: si manejás dólares, los paso
const enTuMoneda = (s, v) => { const u = monedaBase(s) === 'USD' ? arsPer(s, 'USD') : 0; return u ? Math.max(1, Math.round(v / u)) : v; };
function ruleForm(c = {}, s = null) {
  return `<form class="form" data-submit="saveCustomRule">
    <input type="hidden" name="id" value="${esc(c.id || '')}">
    ${c.id ? '' : `<span class="small" style="font-weight:800">Ideas listas para usar</span>
    <div class="rule-presets">${RULE_PRESETS.map((p, i) => `<button type="button" class="ahorro-op" data-action="usarPreset" data-i="${i}"><b>${esc(p.name)}</b><span>${esc(p.txt((v) => money(s ? enTuMoneda(s, v) : v)))}</span></button>`).join('')}</div>
    <span class="small" style="font-weight:800">O armala a tu medida</span>`}
    <div class="field"><label for="r-n">Nombre</label><input id="r-n" name="name" value="${esc(c.name || '')}" placeholder="Ej: Impuesto al antojo" required></div>
    <div class="field"><label for="r-t">¿Cuánto apartar?</label><select id="r-t" name="type">${CUSTOM_RULE_TYPES.map((t) => `<option value="${t.id}" ${t.id === c.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>
    <div class="field-row">
      <div class="field"><label for="r-v">Valor (% o monto)</label><input id="r-v" name="value" inputmode="decimal" value="${c.value || ''}" placeholder="Ej: 10" required></div>
      <div class="field"><label for="r-c">Categoría</label><select id="r-c" name="category">${catOpts(c.category)}</select><span class="hint">Solo para las opciones con categoría.</span></div>
    </div>
    <button class="btn primary block" type="submit">Guardar regla</button>
    ${c.id ? `<button class="btn ghost block" type="button" data-action="deleteCustomRule" data-id="${c.id}">Borrar regla</button>` : ''}
  </form>`;
}

function challengeForm() {
  return `<form class="form" data-submit="saveChallenge">
    <div class="field"><label for="ch-n">Nombre</label><input id="ch-n" name="name" placeholder="Ej: Un mes sin comprar ropa" required></div>
    <div class="field"><label for="ch-t">Tipo</label><select id="ch-t" name="type">${CHALLENGE_TYPES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}</select></div>
    <div class="field-row">
      <div class="field"><label for="ch-c">Categoría</label><select id="ch-c" name="category">${catOpts('comida')}</select></div>
      <div class="field"><label for="ch-d">Duración (días)</label><input id="ch-d" name="days" inputmode="numeric" placeholder="Ej: 30" required></div>
    </div>
    <div class="field"><label for="ch-a">Monto (tope o gasto mínimo)</label><input id="ch-a" name="amount" inputmode="decimal" placeholder="Ej: 20.000"><span class="hint">Para "No pasar un monto": el tope. Para "Sin gastos chicos": el monto mínimo.</span></div>
    <label style="display:flex;gap:10px;align-items:center;font-size:14px;font-weight:600;min-height:44px"><input type="checkbox" name="start" checked style="width:20px;height:20px"> Empezarlo hoy</label>
    <button class="btn primary block" type="submit">Crear desafío</button>
  </form>`;
}

function ask(ctx, q) {
  const text = String(q || '').trim();
  if (!text) return;
  const reply = answer(text, ctx.state);
  ctx.commit((s) => { s.chat.push({ from: 'me', text }, { from: 'bot', text: reply }); s.chat = s.chat.slice(-30); });
  requestAnimationFrame(() => document.getElementById('ask')?.scrollIntoView({ block: 'center' }));
}

export const actions = {
  asesorTab(ctx, el) { tab = el.dataset.v; ctx.render(); },
  masPreguntas(ctx) { masPreguntas = !masPreguntas; ctx.render(); },
  // "Cambiar" lleva a la única sección donde se elige la forma de ahorrar
  changeMode(ctx) { ctx.go('formaahorro'); },
  elegirModoAhorro(ctx, el) {
    const [mode, pct] = String(el.dataset.v || '').split(':');
    if (pct === 'otro') {
      const box = document.querySelector('[data-otro]'); const f = document.getElementById('mo-p');
      if (box) { box.hidden = false; f.focus(); } toast('Poné el porcentaje y tocá Guardar'); return;
    }
    if (mode === 'fixed') {
      const f = document.getElementById('mo-f');
      const fijo = num(f && f.value);
      if (!fijo) { const box = document.querySelector('[data-fijo]'); if (box) { box.hidden = false; f.focus(); } toast('Poné cuánto querés apartar por mes y tocá Guardar'); return; }
      aplicarModo(ctx, 'fixed', null, fijo); return;
    }
    aplicarModo(ctx, mode, pct);
  },
  guardarModoOtro(ctx, d) {
    const pct = num(d.pct);
    if (!(pct > 0 && pct <= 90)) { toast('Poné un porcentaje entre 1 y 90'); return; }
    aplicarModo(ctx, 'payFirst', pct);
  },
  usarSugerenciaAhorro(ctx) {
    const g = sugerenciaAhorro(ctx.state); if (!g.listo) return;
    if (!g.igual) aplicarModo(ctx, g.modo, g.pct || null, g.fijo, true);
    if (g.extras.length) ctx.commit((s) => { for (const [k] of g.extras) s.rules[k].on = true; });
    toast(`Listo: ${g.igual ? 'sumé los extras' : g.nombre.toLowerCase()}${!g.igual && g.extras.length ? ', con extras' : ''}`);
  },
  guardarModoFijo(ctx, d) {
    const fijo = num(d.fijo);
    if (!fijo) { toast('Poné cuánto querés apartar por mes'); return; }
    aplicarModo(ctx, 'fixed', null, fijo);
  },
  toggleRule(ctx, el) { ctx.commit((s) => { s.rules[el.dataset.key].on = !s.rules[el.dataset.key].on; }); },
  editRule(ctx, el) {
    const r = BUILTIN.find((x) => x.key === el.dataset.key);
    const v = ctx.state.rules[r.key][r.param];
    openModal(r.name, `<form class="form" data-submit="saveRuleParam"><input type="hidden" name="key" value="${r.key}">
      <div class="field"><label for="rp">${r.unit === '$' ? 'Redondear a' : 'Porcentaje'}</label>
      ${r.unit === '$' ? `<select id="rp" name="value">${[100, 500, 1000, 5000].map((n) => `<option value="${n}" ${n === v ? 'selected' : ''}>${money(n)}</option>`).join('')}</select>` : `<input id="rp" name="value" inputmode="decimal" value="${v}" placeholder="Ej: 10">`}</div>
      <button class="btn primary block" type="submit">Guardar</button></form>`);
  },
  saveRuleParam(ctx, d) {
    const r = BUILTIN.find((x) => x.key === d.key);
    const v = Math.max(1, num(d.value));
    ctx.commit((s) => { s.rules[r.key][r.param] = r.unit === '%' ? Math.min(100, v) : v; s.rules[r.key].on = true; });
    closeModal(); toast('Regla actualizada');
  },
  newRule(ctx) { openModal('Crear regla de ahorro', ruleForm({}, ctx.state)); },
  usarPreset(ctx, el) {
    const p = RULE_PRESETS[Number(el.dataset.i)]; if (!p) return;
    // la de "lo que no gasto" necesita el tope: se lo propongo con lo que gastaste el mes pasado
    if (p.type === 'bajoTope') { const f = el.closest('form'); f.querySelector('[name=name]').value = p.name; f.querySelector('[name=type]').value = p.type; f.querySelector('[name=category]').value = p.category; f.querySelector('[name=value]').focus(); toast('Poné el tope para el súper'); return; }
    ctx.commit((s) => { s.rules.custom.push({ id: uid(), on: true, name: p.name, type: p.type, value: CUSTOM_RULE_TYPES.find((t) => t.id === p.type).unit === '$' ? enTuMoneda(s, p.value) : p.value, ...(p.category ? { category: p.category } : {}) }); });
    closeModal(); toast(`"${p.name}" creada y activada`);
  },
  editCustomRule(ctx, el) { const c = ctx.state.rules.custom.find((x) => x.id === el.dataset.id); if (c) openModal('Editar regla', ruleForm(c)); },
  saveCustomRule(ctx, d) {
    const value = num(d.value);
    if (!value) { toast('Indicá un valor'); return; }
    ctx.commit((s) => {
      const data = { name: d.name.trim(), type: d.type, value, category: d.category };
      const c = s.rules.custom.find((x) => x.id === d.id);
      if (c) Object.assign(c, data); else s.rules.custom.push({ id: uid(), on: true, ...data });
    });
    closeModal(); toast('Regla guardada y activada');
  },
  toggleCustomRule(ctx, el) { ctx.commit((s) => { const c = s.rules.custom.find((x) => x.id === el.dataset.id); if (c) c.on = !c.on; }); },
  deleteCustomRule(ctx, el) { closeModal(); borrarConDeshacer(ctx, 'Regla borrada', (s) => { s.rules.custom = s.rules.custom.filter((x) => x.id !== el.dataset.id); }); },

  newChallenge() { openModal('Crear desafío', challengeForm()); },
  saveChallenge(ctx, d) {
    const days = Math.min(365, Math.max(1, parseInt(d.days, 10) || 30));
    const amount = num(d.amount);
    if ((d.type === 'capCat' || d.type === 'noSmall') && !amount) { toast('Indicá el monto'); return; }
    const id = uid();
    ctx.commit((s) => {
      s.customChallenges.push({ id, name: d.name.trim(), days, type: d.type, category: d.category, amount });
      if (d.start) s.challenge = { id, start: todayISO() };
    });
    closeModal(); toast(d.start ? '¡Arrancó tu desafío!' : 'Desafío creado');
  },
  startChallenge(ctx, el) { ctx.commit((s) => { s.challenge = { id: el.dataset.id, start: todayISO() }; }); toast('¡Arrancó el desafío!'); },
  stopChallenge(ctx) { ctx.commit((s) => { s.challenge = null; }); },
  claimChallenge(ctx, el) {
    const amount = num(el.dataset.amount);
    ctx.commit((s) => { const mk = monthKey(); s.savedByApp[mk] = (s.savedByApp[mk] || 0) + amount; s.challenge = null; });
    toast(`¡Desafío cumplido! ${money(amount)} al contador`);
  },

  ask(ctx, el) { ask(ctx, el.dataset.q); },
  askForm(ctx, d) { ask(ctx, d.q); },
  clearChat(ctx) { ctx.commit((s) => { s.chat = []; }); },
};
