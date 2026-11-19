// Arranque como charla: pocas preguntas, una por vez, todas salteables.
// Lo demás lo pregunta la app de a poco (ver js/guia.js).
// Si la cuenta ya trae el nombre (por ejemplo, con Google), no lo pregunta.
// Preguntas: nombre → sueldo → cuándo cobrás → cómo ahorrar → provincia → ciudad → medios de pago.

import { uid } from './almacenamiento.js';
import { todayISO, esc, money, normalize, setMoneda } from './formato.js';
import { parseAmount } from './interprete.js';
import { wordmark, icon, sprout } from './interfaz.js';
import { PROVINCES, provinceLabel, WALLETS, CATEGORIES, soloEmoji, setCustomCategories } from './categorias.js';
import { entenderCobro, textoDeCobro, fechaDeCobro } from './feriados.js';
import { campoCiudad, activarCiudades } from './ciudades.js';

// v33: menos preguntas y más combinadas. Pasos: ingresos → cuánto y cuándo → ahorro →
// gastos fijos → medios y cuenta → zona. El saldo de hoy, las tarjetas, metas y fondos
// se cargan después, a mano (Inicio avisa).
const ALL_STEPS = ['nombre', 'ingresos', 'monto', 'ahorro', 'fijos', 'categorias', 'medios', 'zona'];
const mainSteps = () => (knownName ? ALL_STEPS.slice(1) : ALL_STEPS);
const WALLET_GROUPS = ['Billeteras', 'Bancos', 'Tarjetas'];

// cómo entra la plata
const INGRESOS = [
  ['dep', 'Sueldo en relación de dependencia', 'Cobrás lo mismo (o parecido) todos los meses.', false],
  ['jub', 'Jubilación o pensión', 'Un monto fijo por mes.', false],
  ['mono', 'Monotributo, autónomo o freelance', 'Facturás y lo que entra varía.', true],
  ['var', 'Changas o ingresos que varían', 'Un mes entra más y otro menos.', true],
  ['mix', 'Un poco de todo', 'Sueldo más otros ingresos.', true],
];
const varia = () => (INGRESOS.find((x) => x[0] === draft.ingresos) || [])[3];
// gastos fijos más comunes (tocás los que tenés y ponés el monto)
const FIJOS = ['Alquiler', 'Expensas', 'Luz', 'Gas', 'Agua', 'Internet', 'Celular', 'Prepaga u obra social', 'Streaming', 'Gimnasio', 'Colegio', 'Seguro del auto', 'Cuota de préstamo', 'Monotributo'];

const fresh = () => ({ cats: [], catsNuevas: [], name: '', ingresos: '', moneda: 'ARS', salary: 0, payRule: null, savingMode: '', savingPct: 0, savingAmount: 0, province: '', city: '', wallets: [], customWallets: [], fijos: {}, fijoOtro: [], cuentaSueldo: '', cuentaPrincipal: '', otraCuenta: false });
let step = 'hola';
let trail = []; // [{ step, q, a }]
let draft = fresh();
let knownName = ''; // nombre que vino con la cuenta
let nota = '';      // aclaración de Pesitos (por ejemplo, "no entendí")

function nextStep(cur) {
  switch (cur) {
    case 'hola': return knownName ? 'ingresos' : 'nombre';
    case 'nombre': return 'ingresos';
    case 'ingresos': return 'monto';
    case 'monto': return 'ahorro';
    case 'ahorro': return draft.savingMode === 'fixed' ? 'ahorroMonto' : 'fijos';
    case 'ahorroMonto': return 'fijos';
    case 'fijos': return 'categorias';
    case 'categorias': return 'medios';
    case 'medios': return 'zona';
    default: return 'listo';
  }
}

const opAhorro = (v, t, d, extra = '') => `<button class="ahorro-op ${extra}" data-action="guideNext" data-value="${v}"><b>${esc(t)}</b><span>${esc(d)}</span></button>`;
const chip = (value, label, extra = '') => `<button class="chip big ${extra}" data-action="guideNext" data-value="${esc(value)}">${esc(label)}</button>`;
const inputForm = (name, placeholder, mode = 'text', button = 'Seguir', extra = '') => `<form class="quick" data-submit="guideInput" autocomplete="off">
    <label for="g-${name}" class="sr-only">${esc(placeholder)}</label>
    <input id="g-${name}" name="value" placeholder="${esc(placeholder)}" inputmode="${mode}" data-autofocus enterkeyhint="next" ${extra}>
    <button type="submit" class="icon-btn green" aria-label="${button}">${icon('send', 20, 2.2)}</button>
  </form>`;

function proximoCobro(regla) {
  const t = new Date(); const hoy = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const p = { payRule: regla };
  let f = fechaDeCobro(p, t.getFullYear(), t.getMonth());
  if (f < hoy) { const nx = new Date(t.getFullYear(), t.getMonth() + 1, 1); f = fechaDeCobro(p, nx.getFullYear(), nx.getMonth()); }
  return f;
}
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const cuentasElegidas = () => [...draft.wallets.map((id) => WALLETS.find((w) => w.id === id)).filter((w) => w && w.kind !== 'Tarjetas').map((w) => [w.id, w.name]), ...draft.customWallets.filter((n) => !/tarjeta/i.test(n)).map((n) => ['x:' + normalize(n).replace(/[^a-z0-9]+/g, '-'), n])];

function current() {
  const n = draft.name ? `, ${draft.name}` : '';
  switch (step) {
    case 'hola': return {
      bubbles: [`¡Hola${knownName ? ', ' + knownName : ''}! Soy Pesitos, tu economista de bolsillo.`, `Te ayudo a saber cuánto podés gastar, a ordenar tu plata y a encontrar descuentos. Son ${mainSteps().length} pasos cortitos, casi todos con un toque.`],
      controls: `<div class="chips">${chip('go', 'Dale, arranquemos', 'primary')}<button class="chip big" data-action="loadDemo">Mostrame un ejemplo primero</button></div>`,
    };
    case 'nombre': return {
      bubbles: ['¿Cómo te llamo?'],
      controls: `${inputForm('name', 'Tu nombre')}<div class="chips">${chip('', 'Saltear')}</div>`,
    };
    case 'ingresos': return {
      bubbles: [`Buenísimo${n}. ¿Cómo entra tu plata?`],
      controls: `<div class="ahorro-ops">${INGRESOS.map(([v, t, d]) => opAhorro(v, t, d)).join('')}</div>
        <label class="check guide-usd"><input type="checkbox" data-change="guideUsd" ${draft.moneda === 'USD' ? 'checked' : ''}> <span>Manejo mi plata en dólares</span></label>`,
    };
    case 'monto': return {
      bubbles: [varia() ? `¿Cuánto te entra por mes, más o menos${draft.moneda === 'USD' ? ', en dólares' : ''}? Un promedio alcanza.` : `¿Cuánto cobrás por mes${draft.moneda === 'USD' ? ', en dólares' : ''} y cuándo?`],
      controls: `<form class="form guide-monto" data-submit="guideMonto" autocomplete="off">
          <div class="field"><label for="g-salary">${varia() ? 'Por mes, más o menos' : 'Cobro por mes'}</label><input id="g-salary" name="monto" inputmode="decimal" placeholder="${draft.moneda === 'USD' ? 'Ej: 1.500' : 'Ej: 900.000'}" data-autofocus value="${draft.salary ? Math.round(draft.salary).toLocaleString('es-AR') : ''}"></div>
          <span class="label-like">${varia() ? '¿Tenés un día fijo de cobro?' : '¿Cuándo cobrás?'}</span>
          <div class="chips" role="radiogroup">${[['dia:1', 'El 1'], ['dia:5', 'El 5'], ['dia:10', 'El 10'], ['habil:1', '1.er día hábil'], ['habil:5', '5.º día hábil'], ['ultimoHabil', 'Último hábil'], ['ultimo', 'Fin de mes'], ['varia', 'Varía']].map(([v, l]) => `<button type="button" class="chip toggle" data-action="guideCobro" data-v="${v}" aria-pressed="${draft.cobroChip === v || (!draft.cobroChip && varia() && v === 'varia')}">${l}</button>`).join('')}</div>
          <input name="cobroTxt" placeholder="O escribilo: ej. el 15, 4.º día hábil" value="">
          <button class="btn primary block" type="submit">Seguir</button>
        </form>
        <p class="small muted guide-hint">Con eso calculo cuánto podés gastar por día. Solo lo ves vos.</p>
        <div class="chips">${chip('', 'Prefiero no decirlo ahora')}</div>`,
    };
    case 'ahorro': return {
      bubbles: [`¿Cómo te gustaría ahorrar?${varia() ? ' Como tus ingresos varían, lo más cómodo suele ser un monto fijo o lo que sobre.' : ''} La podés cambiar cuando quieras.`],
      controls: `<div class="ahorro-ops">
          ${varia() ? opAhorro('fixed', 'Un monto fijo por mes', 'Vos elegís cuánto, aunque cambie lo que entra.', 'sug') : ''}
          ${opAhorro('payFirst:10', 'Apartar el 10% apenas cobro', 'Lo que mejor funciona: primero ahorrás, después gastás.', varia() ? '' : 'sug')}
          ${opAhorro('payFirst:20', 'Apartar el 20% apenas cobro', 'Igual, pero más rápido.')}
          ${varia() ? '' : opAhorro('fixed', 'Un monto fijo por mes', 'Vos elegís cuánto.')}
          ${opAhorro('leftover', 'Lo que me sobre a fin de mes', 'Te aviso cuánto sobró para apartarlo.')}
        </div>
        <div class="chips">${chip('none', 'Por ahora no quiero ahorrar')}</div>`,
    };
    case 'ahorroMonto': return {
      bubbles: ['¿Cuánto querés apartar por mes?'],
      controls: `${inputForm('ahorro', draft.moneda === 'USD' ? 'Ej: 200' : 'Ej: 100.000', 'decimal')}<div class="chips">${chip('', 'Lo decido después')}</div>`,
    };
    case 'fijos': {
      const sel = Object.keys(draft.fijos);
      return {
        bubbles: ['¿Qué pagás todos los meses? Son tus gastos fijos: los descuento solos de lo que podés gastar. Tocá los que tenés y poné cuánto, más o menos.'],
        controls: `<div class="chips">${[...FIJOS, ...draft.fijoOtro].map((f) => `<button type="button" class="chip toggle" data-action="guideFijo" data-n="${esc(f)}" aria-pressed="${sel.includes(f)}">${esc(f)}</button>`).join('')}</div>
          ${sel.length ? `<form class="form guide-fijos" data-submit="guideFijos" autocomplete="off">${sel.map((f, i) => `<div class="field-row" style="align-items:center"><label class="grow" for="gf-${i}">${esc(f)}</label><input id="gf-${i}" name="f_${esc(f)}" inputmode="decimal" placeholder="$ por mes" value="${draft.fijos[f] ? Math.round(draft.fijos[f]).toLocaleString('es-AR') : ''}" style="max-width:150px" data-change="guideFijoMonto" data-n="${esc(f)}"></div>`).join('')}
            <button class="btn primary block" type="submit">Seguir (${sel.length})</button></form>` : ''}
          ${inputForm('otroFijo', '¿Otro? Escribí cuál (ej. jardinero)', 'text', 'Agregar')}
          ${sel.length ? '' : `<div class="chips">${chip('', 'No tengo / los cargo después')}</div>`}`,
      };
    }
    case 'categorias': {
      const n = draft.cats.length + draft.catsNuevas.length;
      return {
        bubbles: ['¿En qué gastás? Marcá las categorías que vas a usar: son las que te aparecen al anotar un gasto. Las demás quedan guardadas y las sumás cuando quieras.'],
        controls: `<div class="chips">${CATEGORIES.filter((c) => c.id !== 'otros').map((c) => `<button type="button" class="chip toggle" data-action="guideCat" data-id="${c.id}" aria-pressed="${draft.cats.includes(c.id)}">${esc(c.short)}</button>`).join('')}
            ${draft.catsNuevas.map((c, i) => `<button type="button" class="chip toggle" data-action="guideCatQuitar" data-i="${i}" aria-pressed="true">${c.emoji ? `${c.emoji} ` : ''}${esc(c.label)} ✕</button>`).join('')}</div>
          <span class="small muted guide-hint">"Otros" siempre está, para lo que no entra en ninguna.</span>
          <form class="form guide-cat-nueva" data-submit="guideCatNueva" autocomplete="off">
            <span class="label-like">¿Falta alguna? Creala</span>
            <div class="field-row cat-new"><div class="field"><label for="g-ce" class="sr-only">Emoji</label><input id="g-ce" name="emoji" class="emoji-input" maxlength="8" placeholder="🙂" aria-label="Emoji (opcional)"></div>
              <div class="field"><label for="g-cn" class="sr-only">Nombre</label><input id="g-cn" name="label" placeholder="Ej: Clases de cerámica" maxlength="30" aria-label="Nombre de la categoría"></div>
              <button type="submit" class="btn small" style="align-self:flex-end">Crear</button></div>
          </form>
          ${n ? `<button class="btn primary block" data-action="guideNext" data-value="ok">Seguir (${n})</button>` : `<div class="chips">${chip('todas', 'Prefiero ver todas')}</div>`}`,
      };
    }
    case 'medios': {
      const cuentas = cuentasElegidas();
      const tot = draft.wallets.length + draft.customWallets.length;
      return {
        bubbles: ['¿Qué bancos, billeteras y tarjetas usás? Tocá todos: te aviso qué descuentos tenés cada día.'],
        controls: `${WALLET_GROUPS.map((g) => `<span class="small muted guide-hint"><b>${g}</b></span><div class="chips">${WALLETS.filter((w) => w.kind === g).map((w) => `<button class="chip toggle" data-action="guideToggleWallet" data-id="${w.id}" aria-pressed="${draft.wallets.includes(w.id)}">${esc(w.name)}</button>`).join('')}</div>`).join('')}
          ${draft.customWallets.length ? `<div class="chips">${draft.customWallets.map((c) => `<button class="chip toggle" data-action="guideRemoveCustom" data-name="${esc(c)}" aria-pressed="true">${esc(c)} ✕</button>`).join('')}</div>` : ''}
          ${inputForm('otro', '¿Otro? Escribilo: ej. Banco Patagonia', 'text', 'Agregar', 'list="g-wallet-list" maxlength="40"')}
          <datalist id="g-wallet-list">${OTROS_CONOCIDOS.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
          ${cuentas.length ? `<div class="card guide-cuenta">
            <div class="field"><label for="g-cs">¿Dónde cobrás?</label><select id="g-cs" data-change="guideCuenta" data-k="cuentaSueldo">${cuentas.map(([id, nm]) => `<option value="${esc(id)}" ${id === (draft.cuentaSueldo || cuentas[0][0]) ? 'selected' : ''}>${esc(nm)}</option>`).join('')}</select></div>
            <label class="check"><input type="checkbox" data-change="guideOtraCuenta" ${draft.otraCuenta ? 'checked' : ''}> <span>Después la paso a otra cuenta y gasto desde ahí</span></label>
            ${draft.otraCuenta ? `<div class="field"><label for="g-cp">¿Cuál es tu cuenta del día a día?</label><select id="g-cp" data-change="guideCuenta" data-k="cuentaPrincipal">${cuentas.map(([id, nm]) => `<option value="${esc(id)}" ${id === draft.cuentaPrincipal ? 'selected' : ''}>${esc(nm)}</option>`).join('')}</select></div>` : ''}
            <span class="small muted">La cambiás cuando quieras en Menú → Mis medios de pago.</span></div>` : ''}
          <button class="btn primary block" data-action="guideNext" data-value="ok">${tot ? `Listo (${tot})` : 'No uso ninguno de estos'}</button>`,
      };
    }
    case 'zona': return {
      bubbles: ['Última: ¿dónde vivís? Muchas promos valen solo en una provincia o ciudad.'],
      controls: `<form class="form ciudad-form" data-submit="guideZona" autocomplete="off">
          <div class="field"><label for="g-prov">Provincia</label><select id="g-prov" name="prov" data-change="guideProv"><option value="">Elegí tu provincia…</option>${PROVINCES.map((p) => `<option value="${esc(p)}" ${p === draft.province ? 'selected' : ''}>${esc(provinceLabel(p))}</option>`).join('')}</select></div>
          ${draft.province ? `<div class="field"><label for="g-city">Ciudad (opcional)</label>${campoCiudad({ id: 'g-city', name: 'city', prov: draft.province, valor: draft.city })}</div>` : ''}
          <button type="submit" class="btn primary block">Terminar</button></form>
        <div class="chips">${chip('', 'Prefiero no decirlo')}</div>`,
    };
    default: {
      const regla = draft.payRule;
      return {
        bubbles: [
          `¡Listo${n}! ${draft.salary ? 'Ya te puedo decir cuánto podés gastar por día.' : 'Cuando me cuentes cuánto te entra, te digo cuánto podés gastar por día.'}${regla && regla.tipo !== 'varia' ? ` Tu próximo cobro es el ${DIAS[proximoCobro(regla).getDay()]} ${proximoCobro(regla).getDate()}/${proximoCobro(regla).getMonth() + 1}.` : ''}`,
          'Si ya gastaste algo este mes, en Inicio te aviso para que pongas tu saldo de hoy. Tarjetas, metas y fondos los cargás cuando quieras.',
        ],
        controls: '<button class="btn primary block" data-action="guideFinish">Ver mi día</button>',
      };
    }
  }
}

// Bancos y billeteras que no están en la lista principal pero tienen promos en la fuente
const OTROS_CONOCIDOS = ['Banco Patagonia', 'Banco Comafi', 'Banco Hipotecario', 'Banco Santa Fe', 'Banco San Juan', 'Banco Santa Cruz', 'Banco del Chubut', 'Banco de Corrientes', 'Banco Provincia del Neuquén', 'Banco de La Pampa', 'Banco del Sol', 'Banco Columbia', 'Carrefour Banco', 'Cencopay', 'Tarjeta Clarín 365', 'Buepp', 'Prex', 'YOY', 'Tarjeta SOL', 'Tarjeta TCI', 'Sidecreer', 'Credicuotas'];

export function render(s) {
  knownName = ((s && s.profile && s.profile.name) || '').trim().split(' ')[0].slice(0, 30);
  if (knownName && !draft.name) draft.name = knownName;
  setMoneda(draft.moneda);
  const c = current();
  const MAIN_STEPS = mainSteps();
  const total = MAIN_STEPS.length;
  const base = step === 'ahorroMonto' ? 'ahorro' : step;
  const idx = MAIN_STEPS.indexOf(base);
  const hecho = step === 'listo' ? total : Math.max(0, idx);
  const progress = step === 'hola' ? '' : `<div class="guide-progreso" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${hecho}" aria-label="Paso ${Math.min(hecho + 1, total)} de ${total}"><span style="width:${Math.round((hecho / total) * 100)}%"></span></div><span class="guide-paso">${step === 'listo' ? '¡Listo!' : `Paso ${Math.min(hecho + 1, total)} de ${total}`}</span>`;
  const canBack = step !== 'hola' && step !== 'listo';
  if (step === 'zona' && draft.province) setTimeout(() => activarCiudades(document.querySelector('.guide')), 0);
  return `<section class="guide">
    <header class="guide-top">
      <div class="guide-top-fila">
      ${canBack ? `<button class="icon-btn back on-green" data-action="guideBack" aria-label="Volver">${icon('back', 20, 2.2)}</button>` : '<span style="width:44px"></span>'}
      <div class="guide-brand">${wordmark(26, '#FFFFFF', '#C6F36B')}<span>Tu economista de bolsillo</span></div>
      <span style="width:44px"></span>
      </div>
      ${progress}
    </header>
    <div class="chat guide-chat">
      ${trail.map((t) => `<div class="bubble bot faded">${esc(t.q)}</div><div class="bubble me">${esc(t.a)}</div>`).join('')}
      ${c.bubbles.map((b, i) => `<div class="bot-row">${i === 0 ? `<span class="bot-avatar">${sprout(18)}</span>` : '<span class="bot-avatar ghost"></span>'}<div class="bubble bot">${esc(b)}</div></div>`).join('')}
      ${nota ? `<div class="bot-row"><span class="bot-avatar ghost"></span><div class="bubble bot aviso" role="alert">${esc(nota)}</div></div>` : ''}
    </div>
    <div class="guide-controls">${c.controls}</div>
  </section>`;
}

function reglaDeChip(v) {
  const [tipo, num] = String(v).split(':');
  if (tipo === 'dia') return { tipo: 'dia', dia: Number(num) };
  if (tipo === 'habil') return { tipo: 'habil', n: Number(num) };
  if (['ultimoHabil', 'ultimo', 'varia'].includes(tipo)) return { tipo };
  return null;
}

function answer(ctx, raw, fromInput) {
  const value = String(raw ?? '').trim();
  const q = current().bubbles.slice(-1)[0];
  let shown = value;
  nota = '';
  switch (step) {
    case 'hola': step = nextStep(step); ctx.render(); return;
    case 'nombre': draft.name = value.slice(0, 30); shown = value || 'Prefiero saltearlo'; break;
    case 'ingresos': {
      const op = INGRESOS.find((x) => x[0] === value); if (!op) return;
      draft.ingresos = value; shown = op[1] + (draft.moneda === 'USD' ? ' (en dólares)' : '');
      if (value === 'mono' && !draft.fijos.Monotributo) draft.fijos.Monotributo = 0;
      if (op[3] && !draft.cobroChip) draft.cobroChip = 'varia';
      break;
    }
    case 'monto': { draft.salary = 0; draft.payRule = varia() ? { tipo: 'varia' } : null; shown = 'Prefiero no decirlo ahora'; break; }
    case 'fijos': shown = 'Los cargo después'; break;
    case 'categorias': {
      if (value === 'todas') { draft.cats = []; draft.catsNuevas = []; shown = 'Todas'; break; }
      const noms = [...draft.cats.map((id) => (CATEGORIES.find((c) => c.id === id) || {}).short), ...draft.catsNuevas.map((c) => `${c.emoji ? c.emoji + ' ' : ''}${c.label}`)].filter(Boolean);
      shown = noms.join(', ');
      break;
    }
    case 'zona': draft.province = ''; draft.city = ''; shown = 'Prefiero no decirlo'; break;
    case 'ahorro': {
      const [mode, pct] = value.split(':');
      draft.savingMode = mode || 'none'; draft.savingPct = Number(pct) || 0;
      shown = { payFirst: `Apartar el ${pct}% apenas cobro`, fixed: 'Un monto fijo por mes', leftover: 'Lo que me sobre a fin de mes', roundup: 'Redondear cada gasto', none: 'Por ahora no' }[draft.savingMode];
      break;
    }
    case 'ahorroMonto': {
      const n = value ? parseAmount(value) : 0;
      if (fromInput && !n) { nota = 'No entendí el monto. Probá así: 100.000'; ctx.render(); return; }
      draft.savingAmount = n; shown = n ? `${money(n)} por mes` : 'Lo decido después';
      break;
    }
    case 'medios': {
      if (fromInput) { // "Otro": se agrega y se queda en la misma pregunta
        const nombre = value.slice(0, 40);
        const conocido = WALLETS.find((w) => normalize(w.name) === normalize(nombre));
        if (conocido) { if (!draft.wallets.includes(conocido.id)) draft.wallets.push(conocido.id); }
        else if (nombre && !draft.customWallets.some((c) => normalize(c) === normalize(nombre))) draft.customWallets.push(nombre);
        ctx.render(); return;
      }
      const names = [...draft.wallets.map((id) => (WALLETS.find((w) => w.id === id) || {}).name), ...draft.customWallets].filter(Boolean);
      shown = names.length ? names.join(', ') : 'Ninguno de estos';
      const cs = cuentasElegidas();
      if (cs.length) { const nom = (id) => (cs.find((c) => c[0] === id) || [, ''])[1]; const sue = draft.cuentaSueldo || cs[0][0]; draft.cuentaSueldo = sue; shown += ` · cobro en ${nom(sue)}${draft.otraCuenta && draft.cuentaPrincipal && draft.cuentaPrincipal !== sue ? ` y uso ${nom(draft.cuentaPrincipal)}` : ''}`; }
      break;
    }
    default: return;
  }
  trail.push({ step, q, a: shown });
  step = nextStep(step);
  ctx.render();
}

// pasos con formulario: registran la respuesta y avanzan
function avanzar(ctx, shown) {
  trail.push({ step, q: current().bubbles.slice(-1)[0], a: shown });
  nota = ''; step = nextStep(step); ctx.render();
}
export const actions = {
  guideNext(ctx, el) { answer(ctx, el.dataset.value, false); },
  guideUsd(ctx, el) { draft.moneda = el.checked ? 'USD' : 'ARS'; setMoneda(draft.moneda); },
  guideCobro(ctx, el) {
    draft.cobroChip = draft.cobroChip === el.dataset.v ? '' : el.dataset.v;
    el.closest('.chips').querySelectorAll('[data-action=guideCobro]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === draft.cobroChip)));
  },
  guideMonto(ctx, d) {
    const n = d.monto ? parseAmount(d.monto) : 0;
    if (String(d.monto || '').trim() && !n) { nota = 'No entendí el monto. Probá así: 900.000'; ctx.render(); return; }
    const regla = String(d.cobroTxt || '').trim() ? entenderCobro(d.cobroTxt) : draft.cobroChip ? reglaDeChip(draft.cobroChip) : null;
    if (String(d.cobroTxt || '').trim() && !regla) { nota = 'No entendí cuándo cobrás. Probá con "el 5", "4.º día hábil" o tocá una opción.'; draft.salary = n; ctx.render(); return; }
    if (!n && !regla) { nota = 'Poné cuánto te entra o tocá "Prefiero no decirlo ahora".'; ctx.render(); return; }
    draft.salary = n; draft.payRule = regla || (varia() ? { tipo: 'varia' } : { tipo: 'dia', dia: 1 });
    const t = textoDeCobro({ payRule: draft.payRule });
    avanzar(ctx, `${n ? money(n) : 'Sin monto'} · ${t.charAt(0).toUpperCase() + t.slice(1)}`);
  },
  guideFijo(ctx, el) {
    const f = el.dataset.n; const form = document.querySelector('.guide-fijos');
    if (form) for (const inp of form.querySelectorAll('input[data-n]')) draft.fijos[inp.dataset.n] = parseAmount(inp.value) || 0;
    if (f in draft.fijos) delete draft.fijos[f]; else draft.fijos[f] = 0;
    ctx.render();
    const inp = document.querySelector(`.guide-fijos input[data-n="${CSS.escape(f)}"]`); if (inp) inp.focus();
  },
  guideFijoMonto(ctx, el) { draft.fijos[el.dataset.n] = parseAmount(el.value) || 0; },
  guideFijos(ctx, d) {
    for (const [k, v] of Object.entries(d)) if (k.startsWith('f_')) draft.fijos[k.slice(2)] = parseAmount(v) || 0;
    const con = Object.entries(draft.fijos);
    avanzar(ctx, con.map(([k, v]) => (v ? `${k} ${money(v)}` : k)).join(', '));
  },
  guideCat(ctx, el) { const id = el.dataset.id; draft.cats = draft.cats.includes(id) ? draft.cats.filter((x) => x !== id) : [...draft.cats, id]; ctx.render(); },
  guideCatQuitar(ctx, el) { draft.catsNuevas.splice(Number(el.dataset.i), 1); ctx.render(); },
  guideCatNueva(ctx, d) {
    const label = String(d.label || '').trim().slice(0, 30);
    if (!label) { nota = 'Escribí el nombre de la categoría.'; ctx.render(); return; }
    const nombre = label.charAt(0).toUpperCase() + label.slice(1);
    const base = CATEGORIES.find((c) => normalize(c.label) === normalize(label) || normalize(c.short) === normalize(label));
    if (base) { if (!draft.cats.includes(base.id)) draft.cats.push(base.id); ctx.render(); return; }
    if (!draft.catsNuevas.some((c) => normalize(c.label) === normalize(label))) draft.catsNuevas.push({ label: nombre, emoji: soloEmoji(d.emoji) });
    ctx.render();
  },
  guideCuenta(ctx, el) { draft[el.dataset.k] = el.value; },
  guideOtraCuenta(ctx, el) { draft.otraCuenta = el.checked; if (!el.checked) draft.cuentaPrincipal = ''; ctx.render(); },
  guideProv(ctx, el) { draft.province = PROVINCES.includes(el.value) ? el.value : ''; draft.city = ''; ctx.render(); },
  guideZona(ctx, d) {
    draft.province = PROVINCES.includes(d.prov) ? d.prov : '';
    draft.city = String(d.city || '').trim().slice(0, 40);
    avanzar(ctx, draft.province ? `${provinceLabel(draft.province)}${draft.city ? ` · ${draft.city}` : ''}` : 'Prefiero no decirlo');
  },
  guideInput(ctx, d) {
    const v = String(d.value || '').trim();
    if (step === 'fijos') { if (v) { const nom = v.charAt(0).toUpperCase() + v.slice(1, 40); if (!FIJOS.includes(nom) && !draft.fijoOtro.includes(nom)) draft.fijoOtro.push(nom); draft.fijos[nom] = draft.fijos[nom] || 0; ctx.render(); } return; }
    if (v) answer(ctx, d.value, true);
  },
  guideToggleWallet(ctx, el) {
    const id = el.dataset.id;
    draft.wallets = draft.wallets.includes(id) ? draft.wallets.filter((x) => x !== id) : [...draft.wallets, id];
    ctx.render();
  },
  guideRemoveCustom(ctx, el) { draft.customWallets = draft.customWallets.filter((x) => x !== el.dataset.name); ctx.render(); },
  guideBack(ctx) {
    const last = trail.pop();
    step = last ? last.step : 'hola';
    nota = '';
    ctx.render();
  },
  guideFinish(ctx) {
    const d = draft;
    ctx.commit((s) => {
      s.ready = true;
      s.settings = { ...(s.settings || {}), moneda: d.moneda === 'USD' ? 'USD' : 'ARS' };
      const regla = d.payRule || { tipo: 'dia', dia: 1 };
      s.profile = { ...s.profile, name: d.name || s.profile.name, payRule: regla, paydayVaries: regla.tipo === 'varia', payday: regla.tipo === 'dia' ? regla.dia : regla.tipo === 'ultimo' ? 31 : 1, province: d.province, city: d.city, ...(d.ingresos ? { ingresos: d.ingresos } : {}) };
      const nota = { dep: 'Sueldo', jub: 'Jubilación', mono: 'Ingresos del mes', var: 'Ingresos del mes', mix: 'Ingresos del mes' }[d.ingresos] || 'Sueldo';
      if (d.salary) s.incomes.push({ id: uid(), date: todayISO(), amount: d.salary, type: 'sueldo', note: nota, ...(d.cuentaSueldo ? { accountId: d.cuentaSueldo } : {}) });
      // gastos fijos elegidos (los que no tienen monto quedan para completar)
      s.fixed = s.fixed || [];
      for (const [name, amount] of Object.entries(d.fijos || {})) if (!s.fixed.some((f) => normalize(f.name) === normalize(name))) s.fixed.push({ id: uid(), name, amount: amount || 0, dueDay: 10, payWith: '', autoDebit: false });
      if (d.cuentaSueldo) s.cuentaSueldo = d.cuentaSueldo;
      if (d.cuentaPrincipal || d.cuentaSueldo) s.cuentaPrincipal = d.otraCuenta && d.cuentaPrincipal ? d.cuentaPrincipal : d.cuentaSueldo;
      // forma de ahorrar (si la eligió; si no, Pesitos la pregunta más adelante)
      if (d.savingMode) {
        s.asked = s.asked || {};
        s.savingMode = d.savingMode;
        s.rules.payFirst.on = d.savingMode === 'payFirst';
        if (d.savingPct) s.rules.payFirst.pct = d.savingPct;
        s.rules.roundup.on = d.savingMode === 'roundup';
        if (d.savingMode === 'roundup') s.savingMode = 'leftover'; // el redondeo es un extra
        s.asked.savingMode = { done: true };
        if (d.savingMode === 'fixed' && d.savingAmount) {
          s.rules.custom = (s.rules.custom || []).filter((c) => c.id !== 'r_fixed');
          s.rules.custom.push({ id: 'r_fixed', name: 'Ahorro mensual fijo', type: 'fixedMonthly', value: d.savingAmount, on: true });
          s.asked.savingAmount = { done: true };
        }
      }
      // categorías: las que no marcó quedan ocultas (las puede sumar desde "Más"); las nuevas se crean
      if (d.cats.length || d.catsNuevas.length) {
        s.catPrefs = { ...(s.catPrefs || {}), ocultas: CATEGORIES.filter((c) => c.id !== 'otros' && !d.cats.includes(c.id)).map((c) => c.id) };
        s.customCategories = s.customCategories || [];
        for (const c of d.catsNuevas) if (!s.customCategories.some((x) => normalize(x.label) === normalize(c.label))) s.customCategories.push({ id: 'c_' + uid(), label: c.label, ...(c.emoji ? { emoji: c.emoji } : {}) });
        setCustomCategories(s.customCategories, s.catPrefs.eliminadas || [], s.catPrefs.nombres || {});
      }
      s.wallets = [...new Set([...(s.wallets || []), ...d.wallets])];
      s.customWallets = s.customWallets || [];
      for (const name of d.customWallets) {
        const id = 'x:' + normalize(name).replace(/[^a-z0-9]+/g, '-');
        if (s.customWallets.some((w) => w.id === id)) { if (!s.wallets.includes(id)) s.wallets.push(id); continue; }
        s.customWallets.push({ id, name, kind: /tarjeta/i.test(name) ? 'Tarjetas' : /banco/i.test(name) ? 'Bancos' : 'Billeteras' });
        s.wallets.push(id);
      }
    });
    step = 'hola'; trail = []; draft = fresh(); nota = '';
    ctx.go('inicio');
  },
};
