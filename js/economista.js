// El "economista": hallazgos automáticos, promos para vos, desafíos y respuestas.
// Hoy funciona con reglas. Más adelante se puede conectar a un modelo
// de IA (por ejemplo desde una función de Vercel en api/) sin cambiar las pantallas.

import { money, pct, normalize, monthKey, addMonthKey, toISO, todayISO, WEEKDAYS } from './formato.js';
import { catLabel, CHALLENGES, walletName, provinceLabel, allCategories } from './categorias.js';
import { PROMO_CATALOG } from './promosrespaldo.js';
import { livePromos, liveAge, expectedInflation, lastIpc } from './datosvivos.js';
import { budget, buyImpact, installmentsVsCash, monthExpenses, salaryStats, mainGoal, holdingsTotal, payCycle, cardSummary, goalEta } from './calculos.js';
import { agenda } from './agenda.js';
import { totalCuentas, cuentasConSaldo, saldoCuenta, deudasAbiertas, saldoDeuda, totalMeDeben, totalDebo } from './cuentas.js';
import { todosLosPresupuestos } from './presupuestos.js';
import { AYUDA_TEMAS } from './ayuda.js';
import { nombreBilletera, textoTasa } from './rendimientos.js';
import { LESSONS } from './aprender.js';

export const DISCLAIMER = 'Información educativa y general, no es asesoramiento financiero personalizado.';

// ---------- promos ----------
// Promos vigentes: las que publica el servicio de Pesitos (se actualizan solas
// todos los días). Si todavía no hay servicio, el catálogo local, solo
// durante su mes: nunca se muestra una promo vencida.
export function currentPromos(s) {
  if (s.live && Array.isArray(s.live.promos)) return { items: livePromos(s), source: 'live' };
  if (PROMO_CATALOG.month === monthKey()) return { items: PROMO_CATALOG.items, source: 'catalog' };
  return { items: [], source: 'none' };
}

export function promosForDay(s, day) {
  const mine = new Set(s.wallets || []);
  const fromCatalog = currentPromos(s).items
    .filter((p) => (mine.has(p.wallet) || (p.wallet === 'todos' && mine.size)) && (p.days || []).includes(day))
    .map((p) => ({ ...p, name: p.wallet === 'todos' ? 'Cualquier medio de pago' : walletName(p.wallet), source: 'catalog' }));
  const manual = (s.promos || []).filter((p) => p.day === day).map((p) => ({ ...p, merchant: '', source: 'manual' }));
  // primero las de tus medios de pago; las que valen con cualquier medio, después
  return [...fromCatalog, ...manual].sort((a, b) => (a.wallet === 'todos') - (b.wallet === 'todos') || (b.category === 'super') - (a.category === 'super') || b.pct - a.pct);
}
export function promosStatus(s) {
  const c = currentPromos(s);
  if (c.source === 'live') { const age = liveAge(s); const prov = s.profile && s.profile.province; return `Promos vigentes${prov ? ` en ${provinceLabel(prov)} y todo el país` : ' de todo el país'}, actualizadas automáticamente${age ? ' ' + age : ''}. Fuente: Con qué pago.`; }
  if (c.source === 'catalog') return `Promos de ${PROMO_CATALOG.label}. Se ocultan solas cuando vencen.`;
  return 'Las promos se cargan solas cuando la app está publicada con su servicio de actualización.';
}

export function insights(s) {
  const out = [];
  const mk = monthKey();
  const today = new Date().getDay();
  const tomorrow = (today + 1) % 7;

  // promos de tus medios de pago
  for (const [day, when] of [[today, 'Hoy'], [tomorrow, `Mañana (${WEEKDAYS[tomorrow]})`]]) {
    const p = promosForDay(s, day)[0];
    if (!p) continue;
    const where = p.merchant ? `en ${p.merchant}` : `en ${catLabel(p.category).toLowerCase()}`;
    out.push({ id: `promo-${day}`, tone: 'tip', title: 'Pesitos te sugiere', text: `${when} tenés ${p.pct}% ${where} con ${p.name}${p.cap ? ` (tope ${money(p.cap)})` : ''}.${p.cond ? ' ' + p.cond.replace(/\.$/, '') + '.' : ''} Si la compra grande cae ese día, ahorrás.`, cta: { label: 'Lo aproveché', action: 'promoUsed', id: String(p.cap || '') } });
    break;
  }

  // plata parada
  const idle = s.holdings.filter((h) => h.type === 'caja' && h.amount > 0).reduce((a, h) => a + h.amount, 0);
  if (idle > 0) out.push({ id: 'idle', tone: 'tip', title: 'Plata parada', text: `Tenés ${money(idle)} en caja de ahorro sin rendimiento. Quieta, pierde contra la inflación todos los meses.`, cta: { label: 'Ver opciones', action: 'showOptions' } });

  // gastos fijos que subieron
  for (const f of s.fixed) {
    if (f.lastAmount && f.amount > f.lastAmount * 1.03) {
      out.push({ id: 'fixed-' + f.id, tone: 'warn', title: `${f.name} subió ${pct(f.amount / f.lastAmount - 1, 0, false)}`, text: `Pasó de ${money(f.lastAmount)} a ${money(f.amount)}. Vale la pena comparar opciones o pedir una bonificación.` });
    }
  }

  // categorías que se dispararon contra tu promedio
  const cur = monthExpenses(s, mk).byCat;
  const prev = [1, 2, 3].map((n) => monthExpenses(s, addMonthKey(mk, -n)).byCat);
  const g = mainGoal(s);
  for (const [cat, v] of Object.entries(cur)) {
    if (cat === 'varios' || cat === 'otros') continue;
    const avg = prev.reduce((a, p) => a + (p[cat] || 0), 0) / 3;
    if (avg > 0 && v > avg * 1.3 && v - avg > 5000) {
      const extra = v - avg;
      let text = `Llevás ${money(v)} en ${catLabel(cat).toLowerCase()} este mes, un ${pct(v / avg - 1, 0, false)} más que tu promedio.`;
      if (g && g.monthly > 0) text += ` Volver a tu promedio adelanta "${g.name}" unos ${Math.round(extra / (g.monthly / 30))} días.`;
      out.push({ id: 'spike-' + cat, tone: 'warn', title: 'Ojo con esto', text });
    }
  }
  return out;
}

// ---------- desafíos ----------
export const allChallenges = (s) => [...CHALLENGES, ...(s.customChallenges || [])];

export function challengeStatus(s) {
  if (!s.challenge) return null;
  const def = allChallenges(s).find((c) => c.id === s.challenge.id);
  if (!def) return null;
  const start = s.challenge.start;
  const day = Math.floor((new Date() - new Date(start + 'T00:00:00')) / 86400000) + 1;
  const since = s.expenses.filter((e) => !e.pending && e.date >= start);
  const from = new Date(start + 'T00:00:00'); from.setDate(from.getDate() - 60);
  const before = s.expenses.filter((e) => !e.pending && e.date >= toISO(from) && e.date < start);
  const elapsed = Math.min(day, def.days);
  let broken = false; let estimate = 0; let detail = '';
  if (def.type === 'noSmall') {
    const small = (e) => e.amount < def.amount && e.installments <= 1;
    broken = since.some(small);
    estimate = Math.round((before.filter(small).reduce((a, e) => a + e.amount, 0) / 60) * elapsed);
    detail = `Ningún gasto menor a ${money(def.amount)}.`;
  } else if (def.type === 'capCat') {
    const spent = since.filter((e) => e.category === def.category).reduce((a, e) => a + e.amount, 0);
    broken = spent > def.amount;
    const usual = (before.filter((e) => e.category === def.category).reduce((a, e) => a + e.amount, 0) / 60) * elapsed;
    estimate = Math.max(0, Math.round(usual - spent));
    detail = `Llevás ${money(spent)} de ${money(def.amount)} en ${catLabel(def.category).toLowerCase()}.`;
  } else {
    broken = since.some((e) => e.category === def.category);
    estimate = Math.round((before.filter((e) => e.category === def.category).reduce((a, e) => a + e.amount, 0) / 60) * elapsed);
    detail = `Nada en ${catLabel(def.category).toLowerCase()}.`;
  }
  return { def, day: elapsed, done: day > def.days && !broken, broken, estimate, detail, pct: Math.min(1, day / def.days) };
}

// ---------- preguntas ----------
function amountIn(text) {
  const m = normalize(text).match(/(\d[\d.,]*)\s*(lucas?|mil|k|palos?|millon(?:es)?)?/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/\./g, '').replace(',', '.')) || 0;
  if (m[2]) n *= /palo|millon/.test(m[2]) ? 1e6 : 1e3;
  return Math.round(n);
}


// ---------- conceptos de economía (respuestas generales, educativas) ----------
const GLOSARIO = [
  [/\btna\b|tasa nominal/, 'La TNA (tasa nominal anual) es la tasa "de lista": la que te dicen en el banco. Para saber cuánto ganás en un mes, dividila por 12 (aprox.). Ejemplo: 36% TNA ≈ 3% por mes.'],
  [/\btea\b|tasa efectiva/, 'La TEA (tasa efectiva anual) es lo que ganás o pagás en un año contando el interés compuesto (intereses sobre intereses). Siempre es un poco más alta que la TNA.'],
  [/\bcft\b|costo financiero/, 'El CFT (costo financiero total) es lo que realmente te cuesta un crédito o unas cuotas: incluye intereses, impuestos y comisiones. Es el número para comparar entre opciones.'],
  [/\buva\b/, 'El UVA es una unidad que sube con la inflación. Un plazo fijo UVA (mínimo 90 días) te protege de la inflación: te devuelven tu plata actualizada más un interés chico.'],
  [/cedear/, 'Los CEDEARs son certificados que representan acciones de empresas de afuera (Apple, Coca-Cola…) y se compran en pesos en la bolsa argentina. Siguen al precio de la acción y al dólar. Suben y bajan: son para plazos largos.'],
  [/\bbono|obligacion negociable|\bon\b/, 'Un bono es un préstamo que le hacés al Estado o a una empresa a cambio de intereses. Hay en pesos y en dólares; el riesgo depende de quién lo emite.'],
  [/\bfci\b|money market|fondo comun/, 'Un FCI (fondo común de inversión) junta la plata de muchas personas y la invierte. Los "money market" son los más tranquilos: rinden todos los días y la tenés disponible cuando querés. Es lo que usan Mercado Pago o Ualá.'],
  [/\bmep\b|dolar bolsa/, 'El dólar MEP (o "bolsa") se compra legalmente a través de un banco o broker, comprando y vendiendo un bono. Es la forma legal de comprar dólares a precio de mercado.'],
  [/\bccl\b|contado con liqui/, 'El contado con liqui (CCL) es parecido al MEP, pero los dólares quedan en una cuenta del exterior. Lo usan más las empresas.'],
  [/blue|paralelo/, 'El dólar blue es el que se compra en el mercado informal (cuevas, arbolitos). No es legal, pero se usa como referencia. Para comprar legalmente al precio de mercado está el MEP.'],
  [/riesgo pais/, 'El riesgo país mide cuánto más interés le piden a Argentina para prestarle plata, comparado con Estados Unidos. Más alto = más desconfianza. Influye en los bonos y en el crédito.'],
  [/interes compuesto/, 'Interés compuesto es ganar intereses sobre los intereses. Si dejás la plata rindiendo, cada mes ganás sobre lo que ya ganaste. Por eso conviene empezar a ahorrar temprano.'],
  [/devaluacion/, 'La devaluación es cuando el peso pierde valor frente al dólar: el dólar sube. Suele empujar los precios para arriba (inflación).'],
  [/pago minimo|minimo de la tarjeta/, 'Pagar el mínimo de la tarjeta evita la mora, pero lo que no pagás genera intereses muy altos (de los más caros que hay). Si podés, pagá el total; si no, pagá lo más que puedas.'],
  [/refinanci/, 'Refinanciar es pasar una deuda a cuotas nuevas. Alivia el mes, pero casi siempre con intereses altos. Antes, mirá el CFT y si podés achicar otros gastos.'],
  [/aguinaldo|sac\b/, 'El aguinaldo (SAC) es medio sueldo extra: se paga en dos partes, hasta el 30 de junio y el 18 de diciembre. Cada una es la mitad del mejor sueldo del semestre.'],
  [/50.?30.?20/, 'La regla 50/30/20: 50% de lo que cobrás para necesidades (alquiler, comida, servicios), 30% para gustos y al menos 20% para ahorrar o pagar deudas. Es una guía, no una ley.'],
  [/fondo de emergencia|imprevisto/, 'El fondo de emergencia es plata para imprevistos (quedarte sin trabajo, un arreglo). Lo ideal: de 3 a 6 meses de tus gastos fijos, en algo que puedas sacar rápido.'],
  [/cripto|bitcoin|usdt|stablecoin/, 'Las criptomonedas como bitcoin suben y bajan mucho: son de alto riesgo. Las "stablecoins" (USDT, USDC) siguen al dólar y algunas billeteras pagan intereses por tenerlas. No pongas ahí plata que vas a necesitar pronto.'],
  [/caucion/, 'La caución es prestar plata a muy corto plazo (de 1 a 30 días) en la bolsa, con garantía. Paga parecido o un poco más que un plazo fijo y se hace desde un broker.'],
  [/lecap|letra/, 'Las LECAP son letras del Tesoro en pesos a tasa fija y plazo corto. Se compran desde un broker. Pagan una tasa conocida al comprarlas.'],
  [/inflacion/, 'La inflación es la suba general de precios. Si tu plata no rinde al menos lo mismo que la inflación, pierde poder de compra.'],
  [/presupuesto/, 'Hacer un presupuesto es decidir de antemano cuánto vas a gastar en cada cosa. En Pesitos lo hace "Hoy podés gastar" por vos, y podés ponerle topes a categorías en Estadísticas.'],
];

// busca en la ayuda de la app y en las lecciones la respuesta que más se parece a la pregunta
const VACIAS = new Set(['como', 'para', 'que', 'cual', 'cuanto', 'cuando', 'donde', 'tengo', 'puedo', 'esta', 'este', 'esto', 'una', 'uno', 'los', 'las', 'del', 'con', 'por', 'mis', 'mi', 'hay', 'hace', 'hago', 'sirve', 'quiero', 'saber', 'pesitos', 'app']);
// raíz simple: "importo", "importar" e "importación" cuentan como la misma palabra
const palabras = (x) => normalize(x).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !VACIAS.has(w)).map((w) => (w.length > 5 ? w.slice(0, 5) : w.replace(/(es|s)$/, '')));
function buscarEnAyuda(q) {
  const qs = palabras(q);
  if (!qs.length) return null;
  const cand = [];
  for (const t of AYUDA_TEMAS) for (const [preg, resp] of t.preguntas) cand.push({ titulo: preg, texto: resp });
  for (const l of LESSONS) cand.push({ titulo: l.title, texto: l.body.join(' ') });
  let mejor = null; let max = 0;
  for (const c of cand) {
    const tw = new Set(palabras(c.titulo)); const bw = new Set(palabras(c.texto));
    const p = qs.reduce((a, w) => a + (tw.has(w) ? 2 : bw.has(w) ? 1 : 0), 0);
    if (p > max) { max = p; mejor = c; }
  }
  return max >= 2 ? `${mejor.texto}${mejor.titulo ? `\n\n(De la ayuda: "${mejor.titulo}")` : ''}` : null;
}

// ---------- consultas: entiende palabras clave y responde con tus números ----------
// Cada tema tiene palabras que lo disparan. Gana el tema con más coincidencias;
// a igualdad, el que está antes en la lista. Si nada coincide, sugiere preguntas.
const DONDE = [
  [/letras del tesoro|lecap|invert|inversion|\bbonos?\b|acciones|cedear|caucion|obligaciones? negociables|dolar mep/, 'En Herramientas → "Letras, bonos y acciones" tenés cada inversión explicada (riesgo, plazo, dónde se compra) y las tasas de las letras del Tesoro de hoy. Para comparar billeteras y plazos fijos: Herramientas → ¿Dónde rinde más?'],
  [/tope/, 'Para saber cuánto gastar y llegar justo al tope de un reintegro, usá Herramientas → "Descuento con tope". En "Cuotas o contado" también podés sumar el reintegro.'],
  [/cashback|reintegro|me devuelv|devoluci/, 'Los reintegros se calculan solos cuando anotás una compra con un medio que tiene promo. Los ves en Menú ☰ → Reintegros y cashback: lo que te van a devolver, cuándo, y cuando confirmás que llegó se suma a tu saldo. Ahí también cargás el cashback de tu billetera y elegís cuándo te devuelve cada una.'],
  [/recordatorio|recordar|acordarme|descuento por|pedir descuento/, 'En Por pagar tocá la campanita (arriba) para crear un recordatorio: mover plata antes de un débito, llamar para pedir un descuento, etc. Para un descuento por unos meses (por ejemplo, el celular), editá el gasto fijo o el pago y abrí "Descuento por un tiempo": te aviso antes de que termine.'],
  [/con que (pago|conviene)|donde conviene pagar|que tarjeta uso|que billetera uso/, 'En Herramientas → "¿Con qué conviene pagar?" te muestro, para tus servicios y compras de siempre, qué banco o billetera te devuelve más (las tuyas y las que no tenés).'],
  [/proyecto|obra|remodelacion/, 'Los proyectos están en Mi plata → Metas, junto a tus metas: son ahorro para algo puntual (o solo los gastos de algo). Creás uno con su tipo (obra, viaje, evento, emprendimiento…), presupuesto y fecha objetivo, y al cargar cada gasto elegís el proyecto.'],
  [/tema|oscuro|modo noche|letra/, 'El tema (Auto, Claro u Oscuro) y el tamaño de letra están en Menú ☰ → La app.'],
  [/aviso|notificacion/, 'Los avisos en el celular están en Menú ☰ → La app → Avisos en el celular.'],
  [/instal/, 'Para instalar Pesitos: Menú ☰ → La app → Instalar Pesitos como app. En iPhone: en Safari tocá Compartir → Agregar a inicio.'],
  [/import|resumen|excel/, 'Para importar el resumen de la tarjeta (PDF) o el Excel del banco: en Movimientos tocá la flecha hacia arriba (arriba a la derecha), o en Por pagar → Tarjetas → Importar.'],
  [/categori/, 'Las categorías se crean, ordenan u ocultan desde la carga rápida de Inicio: tocá "Más" al final de la fila de categorías.'],
  [/medio|banco|billetera/, 'Tus bancos, billeteras y tarjetas se eligen en Menú ☰ → Mis medios de pago.'],
  [/deuda|prest/, 'Las deudas y préstamos tienen su pantalla: tocá el botón "Deudas y préstamos" en Movimientos (o Menú ☰ → Deudas y préstamos). Si tenés alguna abierta, también la ves en Inicio, en "Tu día".'],
  [/sueldo|ingresos|cobro/, 'Tus ingresos están en Mi plata → Ingresos: ahí cargás lo que cobrás y ves si le ganás a la inflación.'],
  [/estadistic|grafic|en que (gasto|gaste)/, 'Las estadísticas están en Movimientos → Estadísticas (o tocando el resumen del mes).'],
  [/tarjeta/, 'Tus tarjetas están en Por pagar → Tarjetas: ahí ves cada resumen, las cuotas y cuánto tenés comprometido.'],
  [/meta|objetivo/, 'Las metas están en Mi plata → Metas.'],
  [/saldo|cuenta/, 'El saldo de cada cuenta está en Mi plata → Cuentas.'],
  [/ahorro|inversion/, 'Tus ahorros están en Mi plata → Ahorros, y tu forma de ahorrar en Mi plata → Ahorros → Cómo ahorro.'],
  [/promo|beneficio|descuento/, 'Las promos están en Inicio → "Tu día" → Promo de hoy, o en Beneficios.'],
  [/fijo|alquiler|servicio/, 'Los gastos fijos están en Por pagar → Fijos.'],
  [/pin|huella|contrasena|clave/, 'El PIN y la huella están en Menú ☰ → PIN de seguridad y huella. La contraseña, tocando tu nombre arriba del menú.'],
  [/copia|backup|exportar|excel|pdf/, 'Para descargar tus datos: Menú ☰ → Copia de seguridad. Para un Excel o PDF del mes: Movimientos → Estadísticas.'],
  [/tope|presupuesto|limite/, 'Los topes por categoría están en Movimientos → Estadísticas: tocá una categoría.'],
  [/herramienta|calcul|conversor/, 'Las herramientas están en la barra de abajo: ¿Me lo compro?, Cuotas o contado, ¿Dónde rinde más?, Plazo fijo o dólar y más.'],
];

const TEMAS = [
  { id: 'donde', k: [/^(donde|como (encuentro|veo|llego))|donde (esta|estan|veo|encuentro|cargo|pongo el|agrego)/], r: (q) => { if (/donde (pongo|invierto|meto|guardo|conviene|rinde)/.test(q)) return null; const d = DONDE.find(([re]) => re.test(q)); return d ? d[1] : null; } },
  { id: 'saludo', k: [/^(hola|buenas|buen dia|buenas tardes|buenas noches)\b/, /^gracias|^genial|^perfecto/], r: (q) => (/gracias|genial|perfecto/.test(q) ? '¡De nada! Si querés, preguntame otra cosa.' : '¡Hola! Preguntame lo que quieras de tu plata: cuánto podés gastar hoy, qué vence, cuánto gastaste en algo, si te conviene una compra o dónde rinde más tu plata.') },
  { id: 'cuotas', k: [/cuota/, /contado/] },
  { id: 'compra', k: [/me lo compro|me compro|comprarme|puedo comprar|conviene comprar|me alcanza para/] },
  { id: 'hoy', k: [/cuanto (puedo|me queda)|puedo gastar|me queda|hoy puedo|diario|por dia/] },
  { id: 'gaste', k: [/gaste|gasto|gastos|gastado|en que se (me )?fue/] },
  { id: 'vence', k: [/vence|vencimiento|tengo que pagar|por pagar|proximo pago|pagos/] },
  { id: 'tarjeta', k: [/tarjeta|resumen|visa|master|cierre/] },
  { id: 'deudas', k: [/deuda|debo|me deben|preste|prestamo|presto/] },
  { id: 'saldo', k: [/saldo|cuanto tengo|plata tengo|en mis cuentas|en la cuenta/] },
  { id: 'cobro', k: [/cuando cobro|cobro|dia de pago|me pagan/] },
  { id: 'metas', k: [/meta|objetivo|llego a/] },
  { id: 'promos', k: [/promo|descuento|reintegro|beneficio/] },
  { id: 'dolar', k: [/dolar|cotizacion|blue|mep|euro|real\b|bitcoin|cripto/] },
  { id: 'rinde', k: [/rinde|tasa|interes|plazo fijo|billetera|mercado pago|uala|fci|money market/] },
  { id: 'sueldo', k: [/sueldo|ingreso|aumento|salario|le gane|poder de compra/] },
  { id: 'inflacion', k: [/inflacion|ipc|indec|precios/] },
  { id: 'extra', k: [/aguinaldo|bono|ingreso extra|me sobro/] },
  { id: 'invertir', k: [/donde (pongo|invierto|ahorro|meto|guardo)|invertir|inversion/] },
  { id: 'ahorro', k: [/ahorr/] },
  { id: 'topes', k: [/tope|presupuesto|limite/] },
  { id: 'proyectos', k: [/proyecto/] },
];

const fecha = (iso) => { const d = new Date(iso + 'T00:00:00'); return `${d.getDate()}/${d.getMonth() + 1}`; };
const dineroEn = (q) => amountIn(q.replace(/(\d{1,2})\s*cuotas?/, '').replace(/(\d{1,2})\s*%/, ''));

function responder(id, q, s, b) {
  switch (id) {
    case 'cuotas': {
      const n = Number((q.match(/(\d{1,2})\s*cuotas?/) || [])[1]) || 12;
      const disc = Number((q.match(/(\d{1,2})\s*%/) || [])[1]) || 0;
      const price = dineroEn(q) || 100000;
      const infl = expectedInflation(s);
      const r = installmentsVsCash(price, n, disc, infl);
      return `Con una inflación esperada de ${String(infl).replace('.', ',')}% mensual, ${n} cuotas sin interés de ${money(price)} equivalen hoy a ${money(r.pv)}.${disc ? ` De contado, con ${disc}% de descuento, pagás ${money(r.cash)}.` : ` De contado pagás ${money(r.cash)}.`}\n\n${r.better === 'cuotas' ? `Convienen las cuotas: ganás unos ${money(r.diff)} en valor real.` : `Conviene el contado: ahorrás unos ${money(r.diff)}.`}\n\nSi las cuotas tienen interés, usá Herramientas → Cuotas o contado: te digo cuánto interés te cobran y qué pasa si la inflación cambia.`;
    }
    case 'compra': {
      const amount = dineroEn(q);
      if (!amount) return 'Decime el monto, por ejemplo: "¿Me compro unas zapatillas de $90.000?". Para un análisis completo, usá Herramientas → ¿Me lo compro?';
      const r = buyImpact(s, amount);
      return `${r.title}. ${r.text}${r.extra ? '\n\n' + r.extra : ''}\n\nAntes de decidir: ¿lo necesitás o lo querés? Si es un gusto grande, esperá 48 horas.`;
    }
    case 'hoy':
      if (b.noIncome) return 'Cargá lo que cobrás y te digo cuánto podés gastar por día.';
      return `Hoy podés gastar ${money(Math.max(0, b.todayLeft))}${b.todayLeft < 0 ? ` (hoy ya te pasaste ${money(-b.todayLeft)})` : ''}. Hasta el cobro (${b.cycle.daysLeft} días) te quedan ${money(Math.max(0, b.free))} libres, ya descontando fijos y ahorro.`;
    case 'gaste': {
      const mk = /mes pasado|anterior/.test(q) ? addMonthKey(monthKey(), -1) : monthKey();
      const e = monthExpenses(s, mk);
      const cat = allCategories().find((c) => q.includes(normalize(c.label)) || (c.short && q.includes(normalize(c.short))));
      const cuando = mk === monthKey() ? 'este mes' : 'el mes pasado';
      if (cat) return `En ${cat.label.toLowerCase()} gastaste ${money(e.byCat[cat.id] || 0)} ${cuando}${e.total ? ` (el ${Math.round(((e.byCat[cat.id] || 0) / e.total) * 100)}% de tus gastos variables)` : ''}.`;
      const top = Object.entries(e.byCat).sort((a, x) => x[1] - a[1]).slice(0, 3);
      return `${cuando[0].toUpperCase() + cuando.slice(1)} gastaste ${money(e.total)} en gastos variables${top.length ? `. Lo que más: ${top.map(([c, v]) => `${catLabel(c).toLowerCase()} ${money(v)}`).join(', ')}` : ''}.\n\nEl detalle está en Movimientos → Estadísticas.`;
    }
    case 'vence': {
      const semana = /semana/.test(q); const hoy = /\bhoy\b/.test(q);
      const prox = agenda(s, 31).filter((i) => !i.paid && i.days >= -7 && (!semana || i.days <= 7) && (!hoy || i.days <= 0)).slice(0, 6);
      if (!prox.length) return `No tenés pagos pendientes ${hoy ? 'para hoy' : semana ? 'esta semana' : 'en los próximos 30 días'}. 🎉`;
      return `Lo próximo que tenés que pagar:\n${prox.map((i) => `• ${i.name}: ${i.amount ? `${i.estimated ? '≈ ' : ''}${money(i.amount)}` : 'a confirmar'} (${i.days < 0 ? `venció el ${fecha(i.due)}` : i.days === 0 ? 'vence hoy' : `vence el ${fecha(i.due)}`})`).join('\n')}\n\nTodo está en Por pagar.`;
    }
    case 'tarjeta': {
      if (!(s.cards || []).length) return 'Todavía no cargaste tarjetas. Hacelo en Por pagar → Tarjetas y te digo cuánto viene en cada resumen.';
      return s.cards.map((c) => { const x = cardSummary(s, c); return `• ${c.name}: este resumen ${money(x.next)}; en total tenés comprometidos ${money(x.committed)}${c.limit ? ` (${Math.round(x.used * 100)}% del límite)` : ''}.`; }).join('\n') + '\n\nEl detalle está en Por pagar → Tarjetas.';
    }
    case 'deudas': {
      const ab = deudasAbiertas(s);
      if (!ab.length) return 'No tenés deudas ni préstamos abiertos. Si le prestás plata a alguien, anotalo en Movimientos → Deudas y préstamos.';
      return `${totalMeDeben(s) ? `Te deben ${money(totalMeDeben(s))}. ` : ''}${totalDebo(s) ? `Debés ${money(totalDebo(s))}.` : ''}\n${ab.slice(0, 5).map((d) => `• ${d.tipo === 'meDeben' ? `${d.persona} te debe` : `Le debés a ${d.persona}`} ${money(saldoDeuda(d))}${d.vence ? ` (vence el ${fecha(d.vence)})` : ''}`).join('\n')}`;
    }
    case 'saldo': {
      const con = cuentasConSaldo(s);
      if (!con.length) return 'Todavía no cargaste el saldo de tus cuentas. Hacelo en Mi plata → Cuentas: después se actualiza solo con cada gasto e ingreso.';
      return `En tus cuentas tenés ${money(totalCuentas(s))}:\n${con.map((c) => `• ${c.name}: ${money(saldoCuenta(s, c.id))}`).join('\n')}${holdingsTotal(s) ? `\n\nY ahorrado: ${money(holdingsTotal(s))}.` : ''}`;
    }
    case 'cobro': {
      const c = payCycle(s);
      return `Tu próximo cobro es el ${fecha(c.nextISO)}: faltan ${c.daysLeft} día${c.daysLeft === 1 ? '' : 's'}.${b.noIncome ? '' : ` Hasta ese día te quedan ${money(Math.max(0, b.free))} libres.`}`;
    }
    case 'metas': {
      if (!s.goals.length) return 'Todavía no tenés metas. Creá una en Mi plata → Metas: te digo cuánto apartar y cuándo llegás.';
      return s.goals.map((g) => `• ${g.name}: ${g.target ? `${money(g.saved)} de ${money(g.target)} (${Math.round((g.saved / g.target) * 100)}%)` : `${money(g.saved)} juntados`}. ${goalEta(g).text}.`).join('\n');
    }
    case 'promos': {
      if (!(s.wallets || []).length) return 'Cargá tus bancos, billeteras y tarjetas en Menú → Mis medios de pago y te digo qué descuentos tenés cada día.';
      const soloHoy = /hoy/.test(q);
      const lines = [];
      for (let i = 0; i < (soloHoy ? 1 : 7); i++) {
        const day = (new Date().getDay() + i) % 7;
        const ps = promosForDay(s, day).slice(0, soloHoy ? 5 : 2);
        if (ps.length) lines.push(`• ${i === 0 ? 'Hoy' : WEEKDAYS[day][0].toUpperCase() + WEEKDAYS[day].slice(1)}: ${ps.map((p) => `${p.pct}% ${p.merchant || catLabel(p.category).toLowerCase()} (${p.name})`).join(', ')}`);
      }
      return lines.length ? `${soloHoy ? 'Tus promos de hoy' : 'Tus promos de la semana'}:\n${lines.join('\n')}` : 'No encontré promos para tus medios de pago. Podés sumar las tuyas en Beneficios → Promos que cargaste.';
    }
    case 'dolar': {
      const r = s.rates || {}; const d = r.dolares || {};
      const fila = (n, x) => (x && x.venta ? `• ${n}: ${money(x.compra)} / ${money(x.venta)}` : null);
      const lines = [fila('Blue', d.blue || r.USD), fila('Oficial', d.oficial), fila('MEP', d.bolsa), fila('Tarjeta', d.tarjeta)].filter(Boolean);
      if (/euro/.test(q) && r.EUR) lines.push(`• Euro: ${money(r.EUR.venta)}`);
      if (/real\b/.test(q) && r.BRL) lines.push(`• Real: ${money(r.BRL.venta)}`);
      return lines.length ? `Cotizaciones (compra / venta):\n${lines.join('\n')}\n\nSe actualizan solas cada 5 minutos.` : 'Todavía no pude traer las cotizaciones. Se cargan solas apenas haya conexión.';
    }
    case 'rinde': {
      const t = (s.rendimientos && s.rendimientos.tasas) || {}; const pf = (s.rendimientos && s.rendimientos.plazoFijo) || {};
      const bill = Object.entries(t).sort((a, x) => x[1].tna - a[1].tna).slice(0, 3);
      const pfs = Object.entries(pf).sort((a, x) => x[1] - a[1]).slice(0, 2);
      if (!bill.length && !pfs.length) return 'Todavía no pude traer las tasas. Se cargan solas apenas haya conexión.';
      return `Hoy rinde más:\n${bill.map(([id, x]) => `• ${nombreBilletera(id)}: ${textoTasa(x, money)}`).join('\n')}${pfs.length ? `\n${pfs.map(([n, v]) => `• Plazo fijo ${n.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())}: ${String(v).replace('.', ',')}% anual`).join('\n')}` : ''}\n\nLa comparación completa está en Herramientas → ¿Dónde rinde más?`;
    }
    case 'sueldo': {
      const st = salaryStats(s);
      if (!st) return 'Todavía no cargaste tus cobros. Andá a Mi plata → Ingresos y cargá los últimos meses.';
      let t = `En los últimos ${st.span} meses lo que cobrás subió ${pct(st.nomGrowth)} y la inflación fue ${pct(st.inflation)}: en términos reales ${st.realGrowth >= 0 ? 'ganaste' : 'perdiste'} ${pct(Math.abs(st.realGrowth), 1, false)}.`;
      if (st.toRecover > 0) t += `\n\nPara volver a tu mejor mes necesitarías un aumento de ${pct(st.toRecover, 0, false)}. Es un buen número para llevar a una negociación.`;
      return t;
    }
    case 'inflacion': {
      const l = lastIpc(s);
      return `${l ? `La última inflación del INDEC fue ${String(l.value).replace('.', ',')}% (${fecha(l.mk + '-01').slice(2)}). ` : ''}La que uso para tus cálculos es ${String(expectedInflation(s)).replace('.', ',')}% por mes: el promedio de los últimos 3 meses.`;
    }
    case 'extra': {
      const emergency = s.goals.find((g) => /emergencia/i.test(g.name));
      const lines = ['Una forma ordenada de usar un ingreso extra:'];
      if (emergency && emergency.target && emergency.saved < emergency.target) lines.push(`• Primero completá tu fondo de emergencia (te faltan ${money(emergency.target - emergency.saved)}).`);
      else lines.push('• Si no tenés fondo de emergencia, arrancá por ahí: de 3 a 6 meses de gastos fijos.');
      lines.push('• Lo que sigue, a tus metas según el plazo de cada una.', '• Y reservá un 10% a 20% para darte un gusto sin culpa.');
      return lines.join('\n');
    }
    case 'invertir': return OPTIONS_TEXT;
    case 'ahorro': return `Tenés ${money(holdingsTotal(s))} ahorrados. Este ciclo tus reglas apartan ${money(b.saving)}.${s.goals.length ? ` Tu meta principal: ${mainGoal(s) ? mainGoal(s).name : s.goals[0].name}.` : ''}`;
    case 'topes': {
      const ts = todosLosPresupuestos(s);
      if (!ts.length) return 'No tenés topes por categoría. Ponelos en Movimientos → Estadísticas, tocando una categoría.';
      return ts.map((p) => `• ${catLabel(p.cat)}: ${money(p.gastado)} de ${money(p.limite)}${p.pct >= 1 ? ' (te pasaste)' : ''}`).join('\n');
    }
    case 'proyectos': {
      const ps = s.proyectos || [];
      if (!ps.length) return 'No tenés proyectos. Crealos desde Mi plata → Metas: le ponés un presupuesto y una fecha, ahorrás para eso y le vas sumando los gastos.';
      return ps.map((p) => { const g = s.expenses.filter((e) => e.proyectoId === p.id).reduce((a, e) => a + e.amount, 0); return `• ${p.nombre}: ${money(g)} gastados${p.presupuesto ? ` de ${money(p.presupuesto)} (${Math.round((g / p.presupuesto) * 100)}%)` : ''}${p.cerrado ? ' · terminado' : ''}`; }).join('\n');
    }
    default: return null;
  }
}

export function answer(question, s) {
  const q = normalize(question).replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const b = budget(s);
  const puntaje = TEMAS.map((t, i) => ({ t, i, n: t.k.reduce((a, re) => a + (re.test(q) ? 1 : 0), 0) })).filter((x) => x.n).sort((a, x) => x.n - a.n || a.i - x.i);
  // "¿qué es…?" / "¿qué significa…?": primero el concepto
  const concepto = /^(que (es|son|significa|quiere decir)|explica|como funciona|conviene|es bueno|sirve)/.test(q) ? GLOSARIO.find(([re]) => re.test(q)) : null;
  if (concepto) return concepto[1];
  // "¿cómo hago X en la app?": la ayuda primero
  if (/^(como|donde|con que) (cargo|importo|instalo|activo|desactivo|cambio|borro|elimino|agrego|uso|hago|pongo|exporto|descargo|comparto|saco|veo|creo|anoto|marco|recupero|calculo|invierto|compro|pago|conviene|registro)/.test(q)) {
    const d = DONDE.find(([re]) => re.test(q)); if (d && /tema|oscuro|letra|import|resumen|instal|aviso|categori|medio|banco|billetera|tope|reintegro|cashback|recordatorio|descuento|conviene|invert|bono|accion|cedear|lecap/.test(q)) return d[1];
    const a = buscarEnAyuda(q); if (a) return a;
  }
  for (const { t } of puntaje) {
    const r = t.r ? t.r(q) : responder(t.id, q, s, b);
    if (r) return r;
  }
  const g = GLOSARIO.find(([re]) => re.test(q));
  if (g) return g[1];
  const a = buscarEnAyuda(q);
  if (a) return a;
  const d = /como|donde|cambio|activo|instalo|importo|cargo/.test(q) && DONDE.find(([re]) => re.test(q));
  if (d) return d[1];
  return 'No te entendí del todo. Podés preguntarme, por ejemplo:\n• "¿Cuánto puedo gastar hoy?"\n• "¿Cuánto gasté en súper este mes?"\n• "¿Qué vence esta semana?"\n• "¿Cuánto tengo en mis cuentas?"\n• "¿Me compro algo de $80.000?"\n• "¿Dónde rinde más mi plata?"\n• "¿A cuánto está el dólar?"\n• "¿Dónde están mis deudas?"';
}

export const OPTIONS_TEXT = `Depende de cuándo vas a necesitar la plata:

• Menos de 3 meses o fondo de emergencia: cuenta remunerada o fondo money market. Rinden algo y la tenés disponible cuando quieras.

• De 3 a 12 meses: plazo fijo tradicional o fondos de renta fija de corto plazo. Si podés dejarla 90 días o más, mirá también el plazo fijo UVA, que sigue a la inflación.

• Más de un año: dólares, CEDEARs, bonos, oro o cripto. Pueden rendir más, pero suben y bajan; no pongas ahí plata que vas a necesitar pronto.

Compará tasas y comisiones en tu banco o billetera antes de decidir.`;

export { todayISO };
