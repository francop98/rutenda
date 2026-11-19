// Herramientas para decidir: ¿me lo compro?, cuotas o contado,
// cuánto ahorrar por mes, cuánto rinde mi plata y conversor.

import { money, MONTHS_LONG, esc } from './formato.js';
import { lastSalary, resumenCuotas, budget, cardSummary } from './calculos.js';
import { listaCuentas, tnaCuenta, saldoCuenta, totalCuentas, cuentasConSaldo } from './cuentas.js';
import { BILLETERAS_QUE_RINDEN, gananciaEn, textoTasa } from './rendimientos.js';
import { expectedInflation } from './datosvivos.js';
import { parseAmount } from './interprete.js';
import { icon, screenHead, openModal, setModalBody } from './interfaz.js';
import { lessonCard } from './aprender.js';

const GRUPOS = [
  ['Antes de comprar', [
    { action: 'openBuy', icon: 'cart', title: '¿Me lo compro?', text: 'Cómo pega una compra en tu mes y tus metas' },
    { action: 'openInstallments', icon: 'card', title: 'Cuotas o contado', text: 'Qué conviene, con inflación y reintegros' },
    { action: 'openConQuePagar', icon: 'coins', title: '¿Con qué conviene pagar?', text: 'El medio con mejor promo hoy' },
    { action: 'openTope', icon: 'ticket', title: 'Descuento con tope', text: 'Cuánto gastar para aprovechar el tope' },
  ]],
  ['Hacer rendir tu plata', [
    { action: 'openRinde', icon: 'percent', title: '¿Dónde rinde más?', text: 'Billeteras y plazos fijos por tasa' },
    { action: 'showOptions', icon: 'wallet', title: '¿Dónde pongo mis ahorros?', text: 'Opciones según para qué y para cuándo' },
    { action: 'openPfDolar', icon: 'trend', title: 'Plazo fijo o dólar', text: 'A qué dólar empatan' },
    { action: 'openGoalCalc', icon: 'sprout', title: '¿Cuánto ahorrar por mes?', text: 'Para llegar a una meta a tiempo' },
    { action: 'openInversiones', icon: 'chart', title: 'Inversiones', text: 'Letras, bonos, cauciones y acciones' },
  ]],
  ['Monedas', [
    { action: 'openCotizaciones', icon: 'trend', title: 'Cotizaciones', text: 'Dólares, euro, real, cripto y oro' },
    { action: 'openConverter', icon: 'swap', title: 'Conversor de monedas', text: 'Entre pesos, dólares y otras' },
  ]],
];

export function render(s) {
  return `<section class="screen">
    ${screenHead('Herramientas', '', 'Para decidir mejor antes de gastar')}
    ${GRUPOS.map(([titulo, tools]) => `<div class="section-title"><span>${titulo}</span></div>
    <div class="card tight">${tools.map((t) => `<button class="row" data-action="${t.action}">
      <span class="cat-icon green">${icon(t.icon, 18)}</span>
      <span class="grow"><span class="name">${t.title}</span><span class="meta">${t.text}</span></span>
      ${icon('chevron', 16)}
    </button>`).join('')}</div>`).join('')}
  </section>`;
}

const amt = (v) => parseAmount(v) || 0;

const pctTxt = (v, d = 1) => `${(v * 100).toFixed(d).replace('.', ',')}%`;
const tasaTxt = (v) => String(v).replace('.', ',');

// a dónde iría la plata: solo TUS cuentas (con su tasa y su saldo), un plazo fijo si tenés banco,
// "otra tasa" para escribirla y "sin que rinda". La primera es la sugerida.
// Devuelve [valor, etiqueta larga, etiqueta corta, saldo]
function opcionesPlata(s, monto = 0) {
  const pf = mejorPlazoFijo(s);
  const mias = listaCuentas(s).filter((c) => c.id !== 'efectivo').map((c) => {
    const tna = tnaCuenta(s, c.id);
    const saldo = s.cuentas && s.cuentas[c.id] ? saldoCuenta(s, c.id) : null;
    return { c, tna, saldo };
  });
  // primero las que tienen plata suficiente, después las que rinden más
  mias.sort((a, b) => ((b.saldo || 0) >= monto && monto ? 1 : 0) - ((a.saldo || 0) >= monto && monto ? 1 : 0) || b.tna - a.tna || (b.saldo || 0) - (a.saldo || 0));
  const out = mias.filter((x) => x.tna > 0 || (x.saldo || 0) > 0).slice(0, 4).map(({ c, tna, saldo }) => [
    `tna:${tna}`, `${c.name} (${tna ? `${tasaTxt(tna)}% anual` : 'no rinde'})${saldo !== null ? ` · tenés ${money(saldo)}` : ''}`,
    `${c.name}${tna ? ` ${tasaTxt(tna)}%` : ''}`, saldo]);
  if (pf && listaCuentas(s).some((c) => c.kind === 'Bancos')) out.push([`tna:${pf.tna}`, `Plazo fijo (${tasaTxt(pf.tna)}% anual)`, `Plazo fijo ${tasaTxt(pf.tna)}%`, null]);
  out.push(['tna:0', 'Guardada sin que rinda', 'Sin que rinda', null]);
  out.push(['otra', 'Otra tasa (la escribo)', 'Otra tasa', null]);
  return out;
}
// Cuando cuotas y contado dan casi lo mismo, las cuotas ganan por la liquidez:
// la plata queda en tu cuenta rindiendo mientras pagás. Salvo que la tarjeta esté muy cargada.
function liquidez(s, cash, cuota, n) {
  const tasas = (s.rendimientos && s.rendimientos.tasas) || {};
  const mias = listaCuentas(s).map((c) => ({ nombre: c.name, tna: tnaCuenta(s, c.id) })).filter((x) => x.tna > 0).sort((a, b) => b.tna - a.tna);
  const otra = BILLETERAS_QUE_RINDEN.filter((b) => tasas[b.id] && tasas[b.id].tna).map((b) => ({ nombre: b.nombre, tna: tasas[b.id].tna, noTenes: true })).sort((a, b) => b.tna - a.tna)[0];
  const lugar = mias[0] || otra || null;
  let interes = 0;
  if (lugar) { const r = lugar.tna / 100 * 30 / 365; let saldo = cash; for (let k = 1; k <= n; k++) { const gan = saldo * r; interes += gan; saldo = saldo + gan - cuota; } }
  const tarjetas = (s.cards || []).filter((c) => c.limit).map((c) => ({ c, used: cardSummary(s, c).used })).sort((a, b) => b.used - a.used);
  const cargada = tarjetas[0] && tarjetas[0].used >= 0.7 ? tarjetas[0] : null;
  return { lugar, interes, cargada };
}

// si no sabe dónde juntarlo: la billetera que más paga hoy y cuánto menos tendría que ahorrar
function sugerirDonde(s, future, have, months, monthly) {
  const tasas = (s.rendimientos && s.rendimientos.tasas) || {};
  const mejor = BILLETERAS_QUE_RINDEN.filter((b) => tasas[b.id] && tasas[b.id].tna).sort((a, b) => tasas[b.id].tna - tasas[a.id].tna)[0];
  if (!mejor) return '';
  const r = tasas[mejor.id].tna / 100 * 30 / 365; const g = Math.pow(1 + r, months);
  const conR = Math.max(0, (future - have * g) * r / (g - 1));
  return monthly - conR >= 1 ? `<span class="text">Tip: si lo vas juntando en <b>${esc(mejor.nombre)}</b> (hoy paga ${tasaTxt(tasas[mejor.id].tna)}% anual), alcanza con <b>${money(conR)} por mes</b>.</span>` : '';
}
const tnaDeModo = (d, campo = 'modo') => (d[campo] === 'otra' ? parseFloat(String(d.tnaOtra || '0').replace(',', '.')) || 0 : Number(String(d[campo] || '').split(':')[1]) || 0);
function mejorPlazoFijo(s) {
  const pf = plazosFijos(s);
  if (!pf.length) return null;
  const prov = pf.find(([n]) => /provincia de buenos aires/i.test(n));
  const [entidad, tna] = prov || pf.sort((a, b) => b[1] - a[1])[0];
  return { entidad, tna };
}

// Bancos provinciales: solo atienden en su provincia. Los demás (Nación, Galicia, Macro…) en todo el país.
const BANCO_PROV = [[/provincia de buenos aires/, 'Buenos Aires'], [/ciudad de buenos aires/, 'CABA'], [/cordoba|bancor/, 'Córdoba'], [/santa fe/, 'Santa Fe'], [/entre rios/, 'Entre Ríos'], [/san juan/, 'San Juan'], [/santa cruz/, 'Santa Cruz'], [/chubut/, 'Chubut'], [/corrientes/, 'Corrientes'], [/neuquen/, 'Neuquén'], [/la pampa/, 'La Pampa'], [/tierra del fuego/, 'Tierra del Fuego'], [/formosa/, 'Formosa'], [/rioja/, 'La Rioja'], [/chaco/, 'Chaco'], [/santiago del estero/, 'Santiago del Estero'], [/tucuman/, 'Tucumán'], [/catamarca/, 'Catamarca'], [/jujuy/, 'Jujuy'], [/salta/, 'Salta'], [/misiones/, 'Misiones'], [/mendoza/, 'Mendoza'], [/san luis/, 'San Luis'], [/rio negro/, 'Río Negro']];
const provDeBanco = (n) => { const t = sinTildes(n); const x = BANCO_PROV.find(([re]) => re.test(t)); return x ? x[1] : ''; };
let pfZona = 'mia'; // 'mia' (nacionales + los de tu provincia) | 'todos'
const tuProv = (s) => (s.profile && s.profile.province) || '';
/** Plazos fijos [entidad, tna] que podés usar según tu provincia (o todos). */
function plazosFijos(s) {
  const pf = Object.entries((s.rendimientos && s.rendimientos.plazoFijo) || {});
  const prov = tuProv(s);
  if (pfZona === 'todos' || !prov) return pf;
  return pf.filter(([n]) => { const p = provDeBanco(n); return !p || p === prov; });
}
const zonaSeg = (s) => (tuProv(s) ? `<div class="seg pf-zona" role="radiogroup" aria-label="Qué bancos ver"><button type="button" role="radio" data-action="pfZona" data-v="mia" aria-checked="${pfZona === 'mia'}">Los de ${esc(tuProv(s) === 'Buenos Aires' ? 'Provincia de Bs. As.' : tuProv(s))}</button><button type="button" role="radio" data-action="pfZona" data-v="todos" aria-checked="${pfZona === 'todos'}">Todos</button></div>` : '<span class="small muted">Contame tu provincia (Menú → Mi cuenta) y te muestro solo los bancos que atienden donde vivís.</span>');
const nombreBanco = (n) => n.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y)\b/g, (w) => w.toLowerCase()).replace(/\bS\.a\.(u\.)?/gi, (w) => w.toUpperCase());
const sinTildes = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function bancosHtml(s, q) {
  const pf = plazosFijos(s).sort((a, b) => b[1] - a[1]);
  const qq = sinTildes(String(q || '').trim());
  const lista = pf.filter(([n]) => !qq || sinTildes(n).includes(qq) || sinTildes(nombreBanco(n)) === qq);
  const todos = qq && lista.length === 1 && sinTildes(nombreBanco(lista[0][0])) === qq ? pf : lista; // ya elegido: mostrar todos
  return todos.length ? todos.map(([n, v]) => `<button type="button" class="ciudad-op${sinTildes(nombreBanco(n)) === qq ? ' on' : ''}" data-action="pfElegirBanco" data-v="${v}" data-n="${esc(nombreBanco(n))}"><span>${esc(nombreBanco(n))}</span><b>${tasaTxt(v)}%</b></button>`).join('') : '<span class="small muted">No encuentro ese banco. Podés escribir la tasa a mano arriba.</span>';
}

// dólares disponibles (DolarApi): blue, oficial, MEP, CCL, tarjeta, cripto
function tiposDolar(s) {
  const r = s.rates || {};
  const d = r.dolares || {};
  const orden = [['blue', 'Blue'], ['oficial', 'Oficial'], ['bolsa', 'MEP (bolsa)'], ['contadoconliqui', 'Contado con liqui'], ['tarjeta', 'Tarjeta'], ['cripto', 'Cripto']];
  const out = orden.filter(([id]) => d[id]).map(([id, nombre]) => ({ id, nombre, compra: d[id].compra, venta: d[id].venta }));
  if (!out.length && r.USD) out.push({ id: 'blue', nombre: 'Blue', compra: r.USD.compra, venta: r.USD.venta });
  if (!out.length) out.push({ id: 'blue', nombre: 'Blue' });
  return out;
}

// selector de banco: cerrado muestra el elegido; al tocarlo se abre con buscador
function bancoPicker(s, def, { destino = 'pd-t', calc = false } = {}) {
  const pf = Object.entries((s.rendimientos && s.rendimientos.plazoFijo) || {});
  if (!pf.length) return '';
  return `<div class="field banco-picker" data-destino="${destino}" ${calc ? 'data-calc="1"' : ''}><span class="label-like">Banco</span>
    <button type="button" class="banco-actual" data-action="pfAbrirBancos"><span data-banco-elegido>${def ? `${esc(nombreBanco(def.entidad))} · <b>${tasaTxt(def.tna)}%</b>` : 'Elegí un banco'}</span>${icon('chevron', 16, 2.4)}</button>
    <div class="banco-panel">${zonaSeg(s)}<input placeholder="Escribí para buscar (ej: Galicia)" autocomplete="off" data-input="pfFiltrar" aria-label="Buscar banco">
      <div class="ciudad-lista banco-lista" data-banco-lista></div></div>
    <span class="hint">Tasas para clientes que publica el BCRA.</span></div>`;
}

let rindeTab = 'billeteras';
function rindeLista(s, monto) {
  const tasas = (s.rendimientos && s.rendimientos.tasas) || {};
  const filas = rindeTab === 'billeteras'
    ? BILLETERAS_QUE_RINDEN.filter((b) => tasas[b.id]).map((b) => { const t = tasas[b.id]; return { n: b.nombre, t, g30: gananciaEn(t, monto, 30), g1: gananciaEn(t, monto, 1) }; })
    : plazosFijos(s).map(([n, v]) => ({ n: nombreBanco(n), t: { tna: Number(v) }, g30: monto * Number(v) / 100 * 30 / 365 }));
  filas.sort((a, b) => b.g30 - a.g30);
  if (!filas.length) return '<p class="empty">Todavía no pude traer las tasas. Se cargan solas apenas haya conexión.</p>';
  const at = s.rendimientos && s.rendimientos.at;
  return `${rindeTab === 'pf' ? zonaSeg(s) : ''}<div class="card tight">${filas.map((f, i) => `<div class="row"><span class="rank ${i === 0 ? 'top' : ''}">${i + 1}</span><span class="grow"><span class="name">${esc(f.n)}</span><span class="meta">${rindeTab === 'billeteras' ? `${textoTasa(f.t, money)} · ${money(f.g1)} por día${f.t.condiciones ? ` · ${esc(f.t.condiciones)}` : ''}` : `${tasaTxt(f.t.tna)}% anual`}</span>${f.t.control ? `<span class="meta">ℹ️ ${esc(f.t.control)}</span>` : ''}</span><span style="display:flex;flex-direction:column;align-items:flex-end"><span class="amount pos">+${money(f.g30)}</span><span class="small muted">en 30 días</span></span></div>`).join('')}</div>
    <span class="small muted">${rindeTab === 'billeteras' ? 'Ordenadas por lo que ganás con el monto que pusiste: si una paga más pero tiene tope, lo tengo en cuenta. Las de tasa fija son las que publica cada billetera; las que invierten en un fondo, el rendimiento de los últimos 7 días (criterio del BCRA). Fuente: ArgentinaDatos (los mismos datos que comparatasas.ar).' : 'El plazo fijo paga todo al final y la plata queda inmovilizada esos días. Tasas para clientes que publica el BCRA para cada banco.'} ${at ? `Actualizado ${new Date(at).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}.` : ''}</span>`;
}

function installmentsForm(s, d = {}) {
  const rc = resumenCuotas(s);
  return `<form class="form" data-submit="calcInstallments" data-input-form="cuotas">
    <div class="field"><label for="iq-p">Precio de contado</label><input id="iq-p" name="price" inputmode="decimal" value="${d.price || ''}" placeholder="Ej: 270.000" required data-input="cuotaVivo"><span class="hint">Lo que pagás en efectivo o transferencia (con el descuento, si hay).</span></div>
    <div class="field-row">
      <div class="field"><label for="iq-t">Precio total en cuotas</label><input id="iq-t" name="tarjeta" inputmode="decimal" placeholder="Valor total" data-input="cuotaVivo"></div>
      <div class="field"><label for="iq-n">Cantidad de cuotas</label><input id="iq-n" name="n" inputmode="numeric" value="${d.n || ''}" placeholder="Ej: 6" required data-input="cuotaVivo"></div>
    </div>
    <span class="hint" style="margin-top:-6px">El valor de cada cuota lo calculo solo (total ÷ cantidad). Si el total ya trae el interés, dejá "Sin interés".</span>
    <div class="field-row">
      <div class="field"><label for="iq-i">¿Tiene interés?</label><select id="iq-i" name="interes" data-change="cuotaVivo"><option value="no">Sin interés</option><option value="si">Con interés</option></select></div>
      <div class="field" data-iq-pct hidden><label for="iq-x">Interés o recargo total (%)</label><input id="iq-x" name="pct" inputmode="decimal" placeholder="Ej: 15" data-input="cuotaVivo"><span class="hint">Sobre el precio, si no lo incluye.</span></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="iq-r">¿Hay reintegro?</label><select id="iq-r" name="reint" data-change="cuotaVivo"><option value="no">No</option><option value="cuotas">Sí, en cuotas</option><option value="contado">Sí, de contado</option></select></div>
      <div class="field" data-iq-rein hidden><label for="iq-rp">Reintegro (%)</label><input id="iq-rp" name="rpct" inputmode="decimal" placeholder="Ej: 20" data-input="cuotaVivo"></div>
    </div>
    <div class="field" data-iq-rein hidden><label for="iq-rt">Tope del reintegro</label><input id="iq-rt" name="rtope" inputmode="decimal" placeholder="Sin tope" data-input="cuotaVivo"></div>
    <p class="cuota-vivo" data-cuota-vivo>Completá los precios y las cuotas y te muestro cuánto es cada una.</p>
    <input type="hidden" name="modo" value="sueldo">
    <div class="field"><span class="label-like">¿Tenés la plata hoy?</span>
      <div class="seg" role="radiogroup" aria-label="¿Tenés la plata hoy?">
        <button type="button" role="radio" data-action="iqTengo" data-v="no" aria-checked="true">No, pago con lo que cobro</button>
        <button type="button" role="radio" data-action="iqTengo" data-v="si" aria-checked="false">Sí, la tengo</button>
      </div>
      <div class="iq-donde" data-iq-donde hidden><span class="small" style="font-weight:700">Mientras pagás las cuotas, la dejarías en:</span>
        <div class="medio-row iq-chips" role="radiogroup" aria-label="Dónde dejarías la plata">${opcionesPlata(s).map(([v, l, corto], i) => `<button type="button" class="medio-chip" role="radio" data-action="iqDonde" data-v="${esc(v)}" aria-checked="${v === (opcionesPlata(s).find((o) => o[0] !== 'otra') || [])[0]}" title="${esc(l)}">${esc(corto)}</button>`).join('')}</div>
        <div class="field" data-iq-otra hidden><label for="iq-o">Tasa anual (TNA %)</label><input id="iq-o" name="tnaOtra" inputmode="decimal" placeholder="Ej: 30"></div>
        <span class="small muted" data-iq-donde-txt></span>
      </div>
      <span class="hint">Si tenés la plata, lo que rinde mientras pagás de a poco también cuenta.</span></div>
    <button class="btn primary block" type="submit">Comparar</button>
  </form><div id="iq-result"></div>
  ${rc.compras ? `<div class="card lime"><strong>Tus compras en cuotas</strong>
    <span class="text">${rc.compras} ${rc.compras === 1 ? 'compra' : 'compras'} por ${money(rc.total)}. Con la inflación, en plata del día en que compraste te salieron <b>${money(rc.pv)}</b>: la inflación te ahorró <b>${money(rc.licuado)}</b>.</span>
    <span class="small muted">Uso la inflación real del INDEC para los meses publicados y la esperada para el resto. Tocá cualquier compra en cuotas en Movimientos para ver su detalle.</span></div>` : ''}`;
}

// cuánto es cada cuota: precio con tarjeta (o el de contado) más el interés, dividido en las cuotas
function datosCuotas(d) {
  const cash = amt(d.price);
  const n = Math.max(1, parseInt(d.n, 10) || 0);
  const lista = amt(d.tarjeta) || cash;
  const pctI = d.interes === 'si' ? (parseFloat(String(d.pct || '0').replace(',', '.')) || 0) : 0;
  const total = lista * (1 + pctI / 100);
  const rpct = d.reint && d.reint !== 'no' ? (parseFloat(String(d.rpct || '0').replace(',', '.')) || 0) : 0;
  const rtope = amt(d.rtope);
  const base = d.reint === 'contado' ? cash : total;
  const rein = rpct ? Math.min(base * rpct / 100, rtope || Infinity) : 0;
  return { cash, lista, n, pctI, total, cuota: n ? total / n : 0, rein, reinQ: d.reint === 'cuotas' ? rein : 0, reinC: d.reint === 'contado' ? rein : 0, rpct, rtope, topeEn: rpct && rtope ? rtope / (rpct / 100) : 0 };
}

// tasa mensual que hace que las cuotas valgan lo mismo que el contado (lo que "te cobran" las cuotas)
function tasaImplicita(cash, cuota, n) {
  const vh = (r) => { let pv = 0; for (let k = 1; k <= n; k++) pv += cuota / Math.pow(1 + r, k); return pv; };
  if (Math.abs(vh(0) - cash) < 0.5) return 0;
  let lo = -0.5; let hi = 1.5;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (vh(m) > cash) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// valor de hoy de una serie de cuotas, con la inflación mensual i
const valorHoy = (cuota, n, i) => { let pv = 0; for (let k = 1; k <= n; k++) pv += cuota / Math.pow(1 + i, k); return pv; };

export const actions = {
  openInstallments(ctx, el) { openModal('Cuotas o contado', installmentsForm(ctx.state), { push: !!(el && el.dataset.push) }); },
  calcInstallments(ctx, d) {
    const s = ctx.state;
    const { cash, n, total, cuota, rein, reinQ, reinC, rpct, topeEn } = datosCuotas(d);
    if (!cash || !parseInt(d.n, 10)) return;
    const infl = expectedInflation(s); const i = infl / 100;
    const r = tasaImplicita(cash, cuota, n); // por mes
    const recargo = total - cash;
    // el reintegro suele llegar con el resumen siguiente: lo tomo a un mes
    const resultado = (inf) => (cash - reinC / (1 + inf)) - (valorHoy(cuota, n, inf) - reinQ / (1 + inf)); // >0: convienen las cuotas (en plata de hoy)
    const gana = resultado(i);
    let veredicto; let detalle;
    const parejo = Math.abs(gana) < cash * 0.01; let liq = null;
    if (d.modo === 'sueldo' || !d.modo) {
      liq = parejo ? liquidez(s, cash, cuota, n) : null;
      veredicto = parejo ? (liq.cargada ? `Da casi lo mismo (${money(Math.abs(gana))} de diferencia): mirá tu tarjeta` : `Convienen las cuotas: el precio da casi igual y te quedás con la plata`) : gana >= 0 ? `Convienen las cuotas: ganás ${money(gana)}` : `Conviene pagar de contado: ahorrás ${money(-gana)}`;
      detalle = `Pagando con lo que cobrás cada mes, las ${n} cuotas de ${money(cuota)} valen hoy <b>${money(valorHoy(cuota, n, i) - reinQ / (1 + i))}</b>${reinQ ? ' (ya descontado el reintegro)' : ''}. De contado pagás <b>${money(cash - reinC / (1 + i))}</b>${reinC ? ' (con el reintegro)' : ''}.`;
    } else {
      const tna = tnaDeModo(d);
      const rr = tna / 100 * 30 / 365;
      let saldo = cash; for (let k = 1; k <= n; k++) saldo = saldo * (1 + rr) - cuota + (k === 1 ? reinQ - reinC : 0);
      veredicto = saldo >= 0 ? `Convienen las cuotas: te quedan ${money(saldo)}` : `Conviene pagar de contado: con cuotas te faltan ${money(-saldo)}`;
      detalle = `Si en vez de pagar ${money(cash)} de contado dejás esa plata ${tna ? `rindiendo al ${tasaTxt(tna)}% anual` : 'guardada'} y vas usando ${money(cuota)} por mes, al terminar ${saldo >= 0 ? `te sobran <b>${money(saldo)}</b> (≈ ${money(saldo / Math.pow(1 + i, n))} en plata de hoy)` : `te faltan <b>${money(-saldo)}</b>`}.`;
    }
    // escenarios: ¿y si la inflación cambia?
    const esc3 = [['Si la inflación baja a la mitad', i / 2], ['Con la inflación esperada', i], ['Si la inflación sube 50%', i * 1.5]].map(([l, inf]) => { const v = resultado(inf); return `<div class="split small"><span>${l} (${tasaTxt((inf * 100).toFixed(1))}%/mes)</span><b class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? `Cuotas +${money(v)}` : `Contado +${money(-v)}`}</b></div>`; }).join('');
    const sal = lastSalary(s);
    // ¿te alcanza? lo que tenés en tus cuentas y lo libre del mes
    const b = budget(s);
    const enCuentas = cuentasConSaldo(s).length ? totalCuentas(s) : null;
    const libreMes = b.noIncome ? null : Math.max(0, b.income - b.fixed - b.saving);
    const tuPlata = [];
    if (enCuentas !== null) {
      if (cash > enCuentas) tuPlata.push(`De contado <b>no te alcanza</b> con lo que tenés en tus cuentas (${money(enCuentas)}): te faltan ${money(cash - enCuentas)}. En cuotas no necesitás tenerlo hoy.`);
      else tuPlata.push(`De contado te quedarían <b>${money(enCuentas - cash)}</b> en tus cuentas (hoy tenés ${money(enCuentas)}).`);
    }
    if (!b.noIncome) {
      if (cash > Math.max(0, b.free)) tuPlata.push(`Pagarlo de contado es más de lo que te queda libre hasta el cobro (${money(Math.max(0, b.free))}): ${money(cash - Math.max(0, b.free))} saldrían de ahorros o de otro lado.`);
      else tuPlata.push(`De contado entra en lo que te queda hasta el cobro, pero tu "Hoy podés gastar" bajaría a <b>${money(Math.max(0, (b.free - cash) / Math.max(1, b.cycle.daysLeft)))} por día</b>.`);
      if (libreMes) tuPlata.push(`En cuotas: ${money(cuota)} por mes es el <b>${Math.max(1, Math.round((cuota / libreMes) * 100))}%</b> de lo que te queda libre cada mes después de fijos y ahorro.`);
    }
    const fin = (() => { const x = new Date(); x.setMonth(x.getMonth() + n); return `${MONTHS_LONG[x.getMonth()]}${x.getFullYear() !== new Date().getFullYear() ? ` ${x.getFullYear()}` : ''}`; })();
    setModalBody('#iq-result', `<div class="result ${gana >= 0 || parejo ? 'ok' : 'warn'}">
      <strong>${veredicto}</strong>
      <span class="text">${detalle}</span>
      ${liq ? `<span class="text">${liq.lugar && liq.interes >= 1 ? `Con una diferencia de ${money(Math.abs(gana))}, lo que decide es la liquidez: si dejás los ${money(cash)} en <b>${esc(liq.lugar.nombre)}</b> (${tasaTxt(liq.lugar.tna)}% anual${liq.lugar.noTenes ? ', no la tenés' : ''}) y vas pagando las cuotas, ganás ≈ <b>${money(liq.interes)}</b> de intereses. Y tenés la plata a mano para un imprevisto.` : `Con una diferencia de ${money(Math.abs(gana))}, lo que decide es la liquidez: en cuotas te quedás con la plata para un imprevisto.`}</span>` : ''}
      ${liq && liq.cargada ? `<span class="text">Ojo: tu tarjeta ${esc(liq.cargada.c.name)} ya tiene comprometido el <b>${Math.round(liq.cargada.used * 100)}% del límite</b>. Si querés descomprimirla, pagá de contado.</span>` : ''}
      <span class="text">${r <= 0.0005 ? '<b>Las cuotas no tienen interés</b>' : `Las cuotas te cobran <b>${pctTxt(r)} por mes</b> (${pctTxt(Math.pow(1 + r, 12) - 1, 0)} anual)`}. La inflación esperada es ${tasaTxt(infl)}% por mes: ${r < i ? 'como es mayor, la inflación "paga" parte de las cuotas.' : 'como es menor, el interés le gana a la inflación.'}</span>
    </div>
    ${tuPlata.length ? `<div class="card"><strong>Con tu plata</strong>${tuPlata.map((x) => `<span class="small">• ${x}</span>`).join('')}</div>` : ''}
    <div class="card"><strong>¿Y si la inflación cambia?</strong>${esc3}
      <span class="small muted">${resultado(i / 2) >= 0 && resultado(i * 1.5) >= 0 ? 'Las cuotas convienen en los tres casos: es una decisión segura.' : resultado(i / 2) < 0 && resultado(i * 1.5) < 0 ? 'El contado conviene en los tres casos.' : 'Depende de qué pase con la inflación: si esperás que baje, mejor contado.'}</span></div>
    <div class="card"><strong>En tu bolsillo</strong>
      <div class="split small"><span>Total en cuotas</span><b>${money(total)}</b></div>
      <div class="split small"><span>${recargo > 0.5 ? 'Pagás de más (interés o recargo)' : 'Recargo'}</span><b>${recargo > 0.5 ? `+${money(recargo)} (${pctTxt(recargo / cash)})` : '$0'}</b></div>
      ${rein ? `<div class="split small"><span>Reintegro ${reinQ ? 'en cuotas' : 'de contado'} (${tasaTxt(rpct)}%)</span><b class="pos">−${money(rein)}</b></div>
      <span class="small muted">${topeEn && (reinQ ? total : cash) > topeEn ? `Llegaste al tope: el reintegro máximo se alcanza con ${money(topeEn)}; lo que gastes de más no tiene reintegro.` : topeEn ? `El tope se alcanza con compras de ${money(topeEn)}.` : 'Sin tope.'} Suele acreditarse en el resumen o el mes siguiente.</span>` : ''}
      <div class="split small"><span>Cada mes, hasta ${fin}</span><b>${money(cuota)}${sal ? ` · ${Math.max(1, Math.round((cuota / sal.amount) * 100))}% de tus ingresos` : ''}</b></div>
      ${sal && cuota / sal.amount > 0.15 ? '<span class="small">Ojo: la cuota es más del 15% de tus ingresos. Sumada a otras cuotas, puede apretarte el mes.</span>' : ''}
    </div>
    <button class="btn ghost small" data-action="openLesson" data-id="cuotas" data-push="1">¿Cómo se calcula?</button>`);
  },

  openPfDolar(ctx) {
    const s = ctx.state;
    const def = mejorPlazoFijo(s);
    const tipos = tiposDolar(s);
    const t0 = tipos.find((x) => x.id === 'blue') || tipos[0];
    openModal('Plazo fijo o dólar', `<form class="form" data-submit="calcPfDolar">
      <div class="field"><label for="pd-a">¿Cuántos pesos tenés?</label><input id="pd-a" name="amount" inputmode="decimal" placeholder="Ej: 1.000.000" required></div>
      <div class="field-row">
        <div class="field"><label for="pd-d">Plazo (días)</label><input id="pd-d" name="days" inputmode="numeric" placeholder="30"></div>
        <div class="field"><label for="pd-t">Tasa del plazo fijo (TNA %)</label><input id="pd-t" name="tna" inputmode="decimal" value="${def ? tasaTxt(def.tna) : ''}" placeholder="Ej: 32" required></div>
      </div>
      ${bancoPicker(s, def)}
      <div class="field"><label for="pd-tipo">¿Qué dólar comprarías?</label><select id="pd-tipo" name="tipo" data-change="pfTipoDolar">${tipos.map((x) => `<option value="${x.id}" ${x === t0 ? 'selected' : ''}>${esc(x.nombre)}${x.venta ? ` · ${money(x.venta)}` : ''}</option>`).join('')}</select></div>
      <div class="field"><label for="pd-v">Precio al que lo comprás hoy</label><input id="pd-v" name="venta" inputmode="decimal" placeholder="${t0 && t0.venta ? `Hoy: ${Math.round(t0.venta).toLocaleString('es-AR')}` : 'Ej: 1.200'}"><input type="hidden" name="ventaDef" value="${t0 && t0.venta ? Math.round(t0.venta) : ''}">
        <span class="hint" data-pd-hint>${t0 && t0.venta ? 'Si lo dejás vacío, uso el de hoy (DolarApi, se actualiza cada 5 minutos). Si te lo venden a otro precio, escribilo.' : 'No pude traer la cotización: escribila.'}</span></div>
      <input type="hidden" name="compra" value="${t0 && t0.compra ? Math.round(t0.compra) : ''}">
      <button class="btn primary block" type="submit">Comparar</button>
    </form><div id="pd-result"></div>`);
  },
  cuotaVivo(ctx, el) {
    const f = el.closest('form'); if (!f) return;
    const d = Object.fromEntries(new FormData(f));
    f.querySelector('[data-iq-pct]').hidden = d.interes !== 'si';
    f.querySelectorAll('[data-iq-rein]').forEach((n) => { n.hidden = !d.reint || d.reint === 'no'; });
    const x = datosCuotas(d);
    const p = f.querySelector('[data-cuota-vivo]');
    if (p) p.innerHTML = x.n > 1 && x.total ? `<b>${x.n} cuotas de ${money(x.cuota)}</b> · total ${money(x.total)}${x.cash && x.total > x.cash + 0.5 ? ` (${money(x.total - x.cash)} más que de contado)` : ''}${x.rein ? `<br>Reintegro: <b>${money(x.rein)}</b>${x.topeEn ? ` (el tope se alcanza con ${money(x.topeEn)})` : ''}` : ''}` : 'Completá los precios y las cuotas y te muestro cuánto es cada una.';
  },
  iqTengo(ctx, el) {
    const f = el.closest('form'); if (!f) return;
    f.querySelectorAll('[data-action=iqTengo]').forEach((b) => b.setAttribute('aria-checked', String(b === el)));
    const si = el.dataset.v === 'si';
    f.querySelector('[data-iq-donde]').hidden = !si;
    // sugiero la cuenta tuya que tiene la plata (y rinde más)
    const precio = amt(f.price.value);
    if (si && precio) {
      const ops = opcionesPlata(ctx.state, precio);
      const b = f.querySelector(`[data-action=iqDonde][data-v="${CSS.escape((ops.find((o) => o[0] !== 'otra') || ops[0])[0])}"]`);
      if (b) { actions.iqDonde(ctx, b); return; }
    }
    const on = f.querySelector('[data-action=iqDonde][aria-checked=true]');
    f.modo.value = si ? (on ? on.dataset.v : 'tna:0') : 'sueldo';
    if (si && on) { const t = f.querySelector('[data-iq-donde-txt]'); if (t) t.textContent = on.title || ''; }
  },
  iqDonde(ctx, el) {
    const f = el.closest('form'); if (!f) return;
    f.querySelectorAll('[data-action=iqDonde]').forEach((b) => b.setAttribute('aria-checked', String(b === el)));
    f.modo.value = el.dataset.v;
    f.querySelector('[data-iq-otra]').hidden = el.dataset.v !== 'otra';
    const t = f.querySelector('[data-iq-donde-txt]'); if (t) t.textContent = el.title || '';
    if (el.dataset.v === 'otra') f.tnaOtra.focus();
  },
  pfTipoDolar(ctx, el) {
    const x = tiposDolar(ctx.state).find((t) => t.id === el.value);
    const f = el.closest('form'); if (!f || !x) return;
    f.venta.value = ''; f.venta.placeholder = x.venta ? `Hoy: ${Math.round(x.venta).toLocaleString('es-AR')}` : 'Ej: 1.200'; f.ventaDef.value = x.venta ? Math.round(x.venta) : '';
    f.compra.value = x.compra ? Math.round(x.compra) : '';
  },
  pfAbrirBancos(ctx, el) {
    const p = el.closest('.banco-picker'); if (!p) return;
    const abierto = p.classList.toggle('abierto');
    if (abierto) { const i = p.querySelector('input'); if (i) { i.value = ''; p.querySelector('[data-banco-lista]').innerHTML = bancosHtml(ctx.state, ''); setTimeout(() => i.focus(), 50); } p.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  },
  pfZona(ctx, el) {
    pfZona = el.dataset.v === 'todos' ? 'todos' : 'mia';
    document.querySelectorAll('#modal [data-action=pfZona]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === pfZona)));
    const l = el.closest('.banco-picker')?.querySelector('[data-banco-lista]');
    if (l) { const i = el.closest('.banco-picker').querySelector('input'); l.innerHTML = bancosHtml(ctx.state, i ? i.value : ''); } else actions.calcRinde(ctx);
  },
  pfFiltrar(ctx, el) { const l = el.closest('.banco-picker')?.querySelector('[data-banco-lista]'); if (l) l.innerHTML = bancosHtml(ctx.state, el.value); },
  pfElegirBanco(ctx, el) {
    const p = el.closest('.banco-picker');
    const i = document.getElementById(p?.dataset.destino || 'pd-t'); if (i) i.value = tasaTxt(el.dataset.v);
    const b = p && p.querySelector('[data-banco-elegido]'); if (b) b.innerHTML = `${esc(el.dataset.n)} · <b>${tasaTxt(el.dataset.v)}%</b>`;
    if (p) p.classList.remove('abierto');
    if (p && p.dataset.calc) actions.calcRinde(ctx);
  },
  calcPfDolar(ctx, d) {
    const monto = amt(d.amount); const dias = Math.max(1, parseInt(d.days, 10) || 30);
    const tna = parseFloat(String(d.tna || '').replace(',', '.')) || 0;
    const venta = amt(d.venta) || amt(d.ventaDef); const compra = amt(d.compra) || venta;
    if (!monto || !tna || !venta) return;
    const pfFinal = monto * (1 + tna / 100 * dias / 365);
    const dolares = monto / venta;
    const equilibrio = pfFinal / dolares; // precio al que tendrías que poder vender cada dólar para empatar
    const suba = equilibrio / compra - 1;
    const subaMes = Math.pow(1 + Math.max(suba, -0.99), 30 / dias) - 1;
    const siQueda = dolares * compra;
    const infl = expectedInflation(ctx.state) / 100;
    const inflPlazo = Math.pow(1 + infl, dias / 30) - 1;
    setModalBody('#pd-result', `<div class="result ok">
      <strong>El dólar tiene que estar arriba de ${money(equilibrio)} en ${dias} días</strong>
      <span class="text">Si cuando vendas tus dólares te pagan <b>menos de ${money(equilibrio)}</b> por cada uno, gana el plazo fijo. <b>Más</b>, gana el dólar.</span>
      <span class="text">Hoy te lo compran a ${money(compra)}: tendría que subir <b>${pctTxt(suba)}</b> en ${dias} días (≈ ${pctTxt(subaMes)} por mes).</span>
      <div class="cuentas-cuotas">
        <div class="split small"><span>Plazo fijo al vencimiento</span><b>${money(pfFinal)}</b></div>
        <div class="split small"><span>Dólares que comprás hoy</span><b>US$ ${(Math.round(dolares * 100) / 100).toLocaleString('es-AR')}</b></div>
        <div class="split small"><span>Si el dólar no se mueve, al venderlos</span><b>${money(siQueda)}</b></div>
      </div>
      <span class="small">${compra < venta ? `Por qué hace falta que suba: el dólar se compra a ${money(venta)} y se vende a ${money(compra)}. Solo por esa diferencia, si comprás y vendés enseguida, perdés ${money(monto - siQueda)}. ` : ''}La inflación esperada para ese plazo es ${pctTxt(inflPlazo)}: el plazo fijo ${tna / 100 * dias / 365 >= inflPlazo ? 'le gana' : 'no le gana'}.</span>
    </div>`);
  },

  // ---------- ¿Dónde rinde más? ----------
  openRinde(ctx) {
    openModal('¿Dónde rinde más?', `<div class="field"><label for="rd-a">Si ponés</label><input id="rd-a" inputmode="decimal" placeholder="Ej: 1.000.000" data-input="calcRinde"></div>
      <div class="tabs" role="tablist" style="grid-template-columns:repeat(2,minmax(0,1fr))"><button data-action="rindeTab" data-v="billeteras" aria-pressed="${rindeTab === 'billeteras'}">Billeteras (día a día)</button><button data-action="rindeTab" data-v="pf" aria-pressed="${rindeTab === 'pf'}">Plazo fijo (30 días)</button></div>
      <div id="rd-lista">${rindeLista(ctx.state, 1000000)}</div>
      <button class="btn block" data-action="openYield" data-push="1">${icon('percent', 18)} ¿Te ofrecen otra tasa? Calculá cuánto ganás</button>`);
  },
  rindeTab(ctx, el) { rindeTab = el.dataset.v; document.querySelectorAll('#modal [data-action=rindeTab]').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); actions.calcRinde(ctx); },
  calcRinde(ctx) { const a = amt(document.getElementById('rd-a')?.value) || 1000000; setModalBody('#rd-lista', rindeLista(ctx.state, a)); },

  // ---------- Descuento con tope ----------
  openTope() {
    openModal('Descuento con tope', `<form class="form" data-submit="calcTope" autocomplete="off">
      <div class="field-row">
        <div class="field"><label for="tp-p">Descuento o reintegro (%)</label><input id="tp-p" name="pct" inputmode="decimal" placeholder="Ej: 30" required data-input="calcTopeVivo"></div>
        <div class="field"><label for="tp-t">Tope de reintegro</label><input id="tp-t" name="tope" inputmode="decimal" placeholder="Ej: 10.000" required data-input="calcTopeVivo"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="tp-n">¿Entre cuántas personas?</label><input id="tp-n" name="personas" type="number" inputmode="numeric" min="1" max="20" placeholder="1" data-input="calcTopeVivo"><span class="hint">Cada una paga con su cuenta y tiene su propio tope.</span></div>
        <div class="field"><label for="tp-g">Precio de la compra</label><input id="tp-g" name="gasto" inputmode="decimal" placeholder="Opcional" data-input="calcTopeVivo"></div>
      </div>
    </form><div id="tp-result" class="tp-result"><p class="small muted">Completá el % y el tope.</p></div>`, { alto: true });
  },
  calcTope(ctx) { actions.calcTopeVivo(ctx, document.getElementById('tp-p')); },
  calcTopeVivo(ctx, el) {
    const f = el && el.closest('form'); if (!f) return;
    const p = (parseFloat(String(f.pct.value).replace(',', '.')) || 0) / 100;
    const tope = amt(f.tope.value); const gasto = amt(f.gasto.value);
    const n = Math.max(1, Math.min(20, parseInt(f.personas.value, 10) || 1));
    // el resultado se pinta debajo sin mover el campo que estás escribiendo
    const foco = document.activeElement; const y0 = foco && foco.getBoundingClientRect().top;
    const pintar = (html) => {
      setModalBody('#tp-result', html);
      if (foco && document.body.contains(foco)) {
        const sc = foco.closest('.modal-sheet'); const dy = foco.getBoundingClientRect().top - y0;
        if (sc && Math.abs(dy) > 1) sc.scrollTop += dy;
      }
    };
    if (!p || !tope || p > 1) { pintar('<p class="small muted">Completá el % y el tope.</p>'); return; }
    const ideal = tope / p; // lo que tiene que gastar cada uno para llegar justo al tope
    // 1) la respuesta: cuánto podés gastar, cuánto te devuelven, cuánto pagás
    const dato = (k, v, cls = '') => `<div class="tp-dato"><span class="k">${k}</span><b class="${cls}">${v}</b></div>`;
    let leyenda; let nota = ''; let reparto = '';
    if (!gasto) {
      leyenda = `<div class="result ok tp-leyenda"><span class="small">${n > 1 ? `Entre ${n} personas, para aprovechar todo el reintegro` : 'Para aprovechar todo el reintegro'}</span>
        <div class="tp-datos">${dato('Podés gastar hasta', money(ideal * n))}${dato('Te devuelven', money(tope * n), 'pos')}${dato('Terminás pagando', money((ideal - tope) * n))}${dato('Descuento real', pctTxt(p, 0))}</div>
        <span class="small">${n > 1 ? `Cada una gasta hasta ${money(ideal)} con su medio de pago. ` : ''}Lo que pase de ${money(ideal)}${n > 1 ? ' por persona' : ''} ya no tiene descuento.</span></div>`;
    } else {
      const necesitan = Math.ceil(gasto / ideal - 1e-9);
      const pagos = []; let resto = gasto;
      for (let i = 0; i < n; i++) { const x = i === n - 1 ? resto : Math.min(ideal, resto); pagos.push(Math.max(0, x)); resto -= x; }
      const reint = pagos.reduce((a, x) => a + Math.min(x * p, tope), 0);
      const solo = Math.min(gasto * p, tope);
      leyenda = `<div class="result ${reint >= gasto * p - 1 ? 'ok' : 'warn'} tp-leyenda"><span class="small">Tu compra de ${money(gasto)}${n > 1 ? ` entre ${n} personas` : ''}</span>
        <div class="tp-datos">${dato('Te devuelven', money(reint), 'pos')}${dato('Terminás pagando', money(gasto - reint))}${dato('Descuento real', pctTxt(reint / gasto, 1))}${dato('Para todo el tope, hasta', money(ideal * n))}</div>
        <span class="small">${reint >= gasto * p - 1 ? `Entra entera en el tope: te devuelven el ${pctTxt(p, 0)} de todo.` : `Pasás el tope: ${money(gasto - ideal * Math.min(n, necesitan))} de la compra van sin descuento.`}${n > 1 && reint > solo + 1 ? ` Si pagara una sola persona, serían ${money(solo)}.` : ''}</span></div>`;
      if (gasto < ideal * n * 0.99 && necesitan <= n) nota = `<p class="small muted" style="margin:0">Les sobra tope: podrían sumar ${money(ideal * n - gasto)} más de compras con descuento.</p>`;
      // 2) qué hacer: sumar gente, o cómo dividir
      if (necesitan > n) {
        const extra = necesitan - n;
        const plan = []; let r2 = gasto;
        for (let i = 0; i < necesitan; i++) { const x = i === necesitan - 1 ? r2 : Math.min(ideal, r2); plan.push(Math.max(0, x)); r2 -= x; }
        const reintPlan = plan.reduce((a, x) => a + Math.min(x * p, tope), 0);
        const sobra = gasto - ideal * n;
        reparto += `<div class="card amber"><strong>Para no perder descuento: ${extra === 1 ? 'sumá una persona más' : `sumá ${extra} personas más`}</strong>
          <span class="text">Les devolverían <b>${money(reintPlan)}</b> en vez de ${money(reint)} (<b>${money(reintPlan - reint)} más</b>).</span>
          ${plan.map((x, i) => `<div class="split small"><span>${i < n ? `Persona ${i + 1}` : `<b>Persona ${i + 1} (la que se suma)</b>`}</span><b>paga ${money(x)} · le devuelven ${money(Math.min(x * p, tope))}</b></div>`).join('')}
          <span class="small">Si no consiguen a nadie, ${n === 1 ? 'pagás' : `la persona ${n} paga`} ${money(pagos[n - 1])}: ${money(ideal)} con descuento y ${money(sobra)} sin descuento.</span></div>`;
      }
      if (n > 1) reparto += `<div class="card"><strong>Cómo dividir el pago</strong>${pagos.map((x, i) => `<div class="split small"><span>Persona ${i + 1}</span><b>paga ${money(x)} · le devuelven ${money(Math.min(x * p, tope))}</b></div>`).join('')}
        <span class="small muted">Cada uno paga con su propio medio (tarjeta, cuenta o billetera) y el comercio tiene que aceptar dividir el pago.</span></div>`;
    }
    // 3) el detalle: cuánto devuelven según lo que gastes
    const tabla = [0.5, 1, 1.5, 2].map((k) => { const g = Math.round(ideal * k); const r = Math.min(g * p, tope); return `<div class="split small ${k === 1 ? 'tp-justo' : ''}"><span>Gastando ${money(g)}${k === 1 ? ' (justo el tope)' : ''}</span><b>te devuelven ${money(r)} · ${pctTxt(r / g, 0)} real</b></div>`; }).join('');
    pintar(`${leyenda}${nota}${reparto}
      <details class="card"><summary><strong>Cuánto te devuelven según lo que gastes</strong></summary>${tabla}
        <span class="small muted">El % real es lo que te devuelven sobre lo que gastaste. Revisá si el tope es por compra, por semana o por mes, y cuándo se acredita.</span></details>`);
  },

  // ---------- ¿Cuánto ahorrar por mes? ----------
  openGoalCalc(ctx) {
    const s = ctx.state;
    const now = new Date();
    const def = `${now.getFullYear() + 1}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const venta = ((s.rates || {}).dolares || {}).bolsa?.venta || ((s.rates || {}).USD || {}).venta || 0;
    openModal('¿Cuánto ahorrar por mes?', `<form class="form" data-submit="calcGoal" autocomplete="off">
      <input type="hidden" name="modo" value="fecha">
      <div class="seg" role="radiogroup" aria-label="Qué querés calcular">
        <button type="button" role="radio" data-action="goalModo" data-v="fecha" aria-checked="true">Para una fecha</button>
        <button type="button" role="radio" data-action="goalModo" data-v="cuanto" aria-checked="false">Con lo que puedo</button>
        <button type="button" role="radio" data-action="goalModo" data-v="dolares" aria-checked="false">En dólares</button>
      </div>
      <div class="field"><label for="gc-t" data-gc-lt>¿Cuánto necesitás? (en pesos)</label><input id="gc-t" name="target" inputmode="decimal" placeholder="Ej: 2.000.000" required></div>
      <div class="field" data-gc="fecha dolares"><label for="gc-d">¿Para cuándo?</label><input id="gc-d" name="when" type="month" value="${def}"></div>
      <div class="field" data-gc="cuanto" hidden><label for="gc-m">¿Cuánto podés ahorrar por mes?</label><input id="gc-m" name="monthly" inputmode="decimal" placeholder="Ej: 150.000"></div>
      <div class="field"><label for="gc-h" data-gc-lh>¿Cuánto ya tenés? (en pesos)</label><input id="gc-h" name="have" inputmode="decimal" placeholder="Ej: 0"></div>
      <div class="field" data-gc="dolares" hidden><label for="gc-v">Precio del dólar (MEP)</label><input id="gc-v" name="venta" inputmode="decimal" value="${venta ? Math.round(venta) : ''}" placeholder="Ej: 1.200"><span class="hint">Se actualiza solo. Comprar un poco cada mes promedia el precio.</span></div>
      <label class="check" data-gc="fecha cuanto"><input type="checkbox" name="adjust" checked> <span>Ajustar el monto por inflación<br><span class="small muted">Si es algo que se compra en pesos y va a aumentar.</span></span></label>
      <div class="field" data-gc="fecha cuanto"><label for="gc-r">¿Dónde lo vas juntando?</label><select id="gc-r" name="rinde" data-change="gcRinde"><option value="nose" selected>No sé / me da igual</option>${opcionesPlata(s).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
        <span class="hint">Importa porque algunas cuentas te pagan intereses por tener la plata ahí (el % anual que ves al lado de cada una): si rinde, llegás ahorrando menos por mes. Si no sabés, te calculo sin intereses y te digo dónde rendiría más.</span></div>
      <div class="field" data-gc-otra hidden><label for="gc-o">¿Cuánto te paga por año? (%)</label><input id="gc-o" name="tnaOtra" inputmode="decimal" placeholder="Ej: 30"><span class="hint">Es la TNA que te muestra el banco o la billetera.</span></div>
      <button class="btn primary block" type="submit">Calcular</button>
    </form><div id="gc-result"></div>`);
  },
  gcRinde(ctx, el) { const f = el.closest('form'); f.querySelector('[data-gc-otra]').hidden = el.value !== 'otra' || f.modo.value === 'dolares'; },
  goalModo(ctx, el) {
    const f = el.closest('form'); const v = el.dataset.v;
    f.modo.value = v;
    f.querySelectorAll('[data-action=goalModo]').forEach((b) => b.setAttribute('aria-checked', String(b === el)));
    f.querySelectorAll('[data-gc]').forEach((n) => { n.hidden = !n.dataset.gc.split(' ').includes(v); });
    f.querySelector('[data-gc-otra]').hidden = v === 'dolares' || f.rinde.value !== 'otra';
    f.querySelector('[data-gc-lt]').textContent = v === 'dolares' ? '¿Cuántos dólares necesitás?' : '¿Cuánto necesitás? (en pesos)';
    f.querySelector('[data-gc-lh]').textContent = v === 'dolares' ? '¿Cuántos dólares ya tenés?' : '¿Cuánto ya tenés? (en pesos)';
    f.target.placeholder = v === 'dolares' ? 'Ej: 3.000' : 'Ej: 2.000.000';
    setModalBody('#gc-result', '');
  },
  calcGoal(ctx, d) {
    const target = amt(d.target); const have = amt(d.have);
    if (!target) return;
    const s = ctx.state;
    const now = new Date();
    const infl = expectedInflation(s) / 100;
    const sal = lastSalary(s);
    const r = d.modo === 'dolares' ? 0 : tnaDeModo(d, 'rinde') / 100 * 30 / 365;
    const mesesHasta = () => { const [y, m] = String(d.when || '').split('-').map(Number); return y ? Math.max(1, (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth())) : 12; };
    const fechaDe = (k) => { const x = new Date(now.getFullYear(), now.getMonth() + k, 1); return `${MONTHS_LONG[x.getMonth()]} ${x.getFullYear()}`; };
    const pctSueldo = (v) => (sal ? `<span class="text">Es el ${Math.max(1, Math.round((v / sal.amount) * 100))}% de tus ingresos.</span>` : '');
    if (d.modo === 'cuanto') {
      const P = amt(d.monthly); if (!P) return;
      let saldo = have; let k = 0;
      while (k < 600) { const meta = d.adjust ? target * Math.pow(1 + infl, k) : target; if (saldo >= meta) break; saldo = saldo * (1 + r) + P; k++; }
      if (k >= 600) { setModalBody('#gc-result', '<div class="result warn"><strong>Con ese monto no llegás</strong><span class="text">La inflación hace crecer la meta más rápido que tu ahorro. Probá con un monto mayor o poniéndolo a rendir.</span></div>'); return; }
      const sinR = (() => { let sv = have; let j = 0; while (j < 600) { const meta = d.adjust ? target * Math.pow(1 + infl, j) : target; if (sv >= meta) break; sv += P; j++; } return j; })();
      setModalBody('#gc-result', `<div class="result ok">
        <strong>Llegás en ${k} ${k === 1 ? 'mes' : 'meses'}: ${fechaDe(k)}</strong>
        <span class="text">Ahorrando ${money(P)} por mes${r ? ' y poniéndolo a rendir' : ''} juntás ${money(saldo)}${d.adjust ? ` (lo que va a costar en ese momento, con la inflación esperada)` : ''}.</span>
        ${r && sinR > k && sinR < 600 ? `<span class="text">Sin ponerlo a rendir tardarías <b>${sinR} meses</b>: el rendimiento te ahorra ${sinR - k} ${sinR - k === 1 ? 'mes' : 'meses'}.</span>` : ''}
        ${pctSueldo(P)}
      </div>`);
      return;
    }
    if (d.modo === 'dolares') {
      const venta = amt(d.venta); const months = mesesHasta();
      const usdMes = Math.max(0, (target - have) / months);
      setModalBody('#gc-result', `<div class="result ok">
        <strong>US$ ${(Math.round(usdMes * 100) / 100).toLocaleString('es-AR')} por mes durante ${months} ${months === 1 ? 'mes' : 'meses'}</strong>
        ${venta ? `<span class="text">Al precio de hoy (${money(venta)}) son <b>${money(usdMes * venta)} por mes</b>. Si el dólar sube, vas a necesitar más pesos para el mismo monto.</span>${pctSueldo(usdMes * venta)}` : '<span class="text">Cargá el precio del dólar para ver cuántos pesos son.</span>'}
        <span class="small">Los dólares quietos no rinden: podés tenerlos en una cuenta remunerada en dólares o en obligaciones negociables (mirá "Letras, bonos y acciones").</span>
      </div>`);
      return;
    }
    const months = mesesHasta();
    const future = d.adjust ? target * Math.pow(1 + infl, months) : target;
    const g = Math.pow(1 + r, months);
    const monthly = Math.max(0, r ? (future - have * g) * r / (g - 1) : (future - have) / months);
    const sinRendir = Math.max(0, (future - have) / months);
    const [y, m] = String(d.when).split('-').map(Number);
    setModalBody('#gc-result', `<div class="result ok">
      <strong>${money(monthly)} por mes durante ${months} ${months === 1 ? 'mes' : 'meses'}</strong>
      ${d.adjust ? `<span class="text">Con la inflación esperada, en ${MONTHS_LONG[m - 1]} ${y} eso costaría cerca de ${money(future)}.</span>` : ''}
      ${r && sinRendir > monthly + 1 ? `<span class="text">Poniéndolo a rendir ahorrás ${money(sinRendir - monthly)} por mes (sin rendir serían ${money(sinRendir)}).</span>` : ''}
      ${d.rinde === 'nose' ? sugerirDonde(s, future, have, months, monthly) : ''}
      ${pctSueldo(monthly)}
    </div>`);
  },

  openYield(ctx, el) {
    openModal('¿Cuánto rinde mi plata?', `<form class="form" data-submit="calcYield">
      <div class="field"><label for="y-a">Monto</label><input id="y-a" name="amount" inputmode="decimal" placeholder="Ej: 500.000" required></div>
      <div class="field-row">
        <div class="field"><label for="y-t">Tasa anual (TNA %)</label><input id="y-t" name="tna" inputmode="decimal" placeholder="La que te ofrece tu banco" required></div>
        <div class="field"><label for="y-d">Plazo (días)</label><input id="y-d" name="days" inputmode="numeric" placeholder="Ej: 30" required></div>
      </div>
      <button class="btn primary block" type="submit">Calcular</button>
    </form><div id="y-result"></div>`, { push: !!(el && el.dataset && el.dataset.push) });
  },
  calcYield(ctx, d) {
    const amount = amt(d.amount);
    const tna = parseFloat(String(d.tna).replace(',', '.')) || 0;
    const days = Math.max(1, parseInt(d.days, 10) || 30);
    if (!amount || !tna) return;
    const interest = amount * (tna / 100) * (days / 365);
    const monthlyRate = (tna / 100) * (30 / 365) * 100;
    const infl = expectedInflation(ctx.state);
    const inflPeriod = Math.pow(1 + infl / 100, days / 30) - 1;
    const real = (1 + interest / amount) / (1 + inflPeriod) - 1;
    setModalBody('#y-result', `<div class="result ${real >= 0 ? 'ok' : 'warn'}">
      <strong>Ganás ${money(interest)} en ${days} días</strong>
      <span class="text">Terminás con ${money(amount + interest)}. Equivale a ${monthlyRate.toFixed(2).replace('.', ',')}% por mes.</span>
      <span class="text">${real >= 0 ? `Le gana a la inflación esperada (${String(infl).replace('.', ',')}% mensual): ganás poder de compra.` : `No le gana a la inflación esperada (${String(infl).replace('.', ',')}% mensual): perdés algo de poder de compra.`}</span>
    </div>
    <button class="btn ghost small" data-action="openLesson" data-id="compuesto" data-push="1">Aprendé: el interés compuesto</button>`);
  },
};

