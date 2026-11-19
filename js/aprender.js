// "Aprendé en 1 minuto": lecciones cortas que aparecen donde tienen sentido.
// Son conceptos estables (no dependen de cifras que cambian).

import { esc } from './formato.js';
import { sprout } from './interfaz.js';

export const LESSONS = [
  { id: 'fijos', where: ['movimientos'], title: 'Gastos fijos y variables',
    body: ['Los gastos fijos se repiten todos los meses por un monto parecido: alquiler, expensas, servicios, prepaga, cuotas, suscripciones.',
      'Los variables cambian según lo que hagas: supermercado, salidas, nafta, delivery.',
      'Conviene conocer bien los fijos porque son la base: lo que queda después de pagarlos es lo que realmente podés decidir cómo usar.'] },
  { id: 'real', where: ['sueldo'], title: '¿Qué es el ingreso real?',
    body: ['El ingreso nominal es el número que cobrás. El ingreso real es lo que ese número puede comprar.',
      'Si te aumentan 30% pero los precios suben 40%, cobrás más pesos pero comprás menos cosas: tu ingreso real bajó.',
      'Por eso Pesitos ajusta tus ingresos por la inflación del INDEC: así ves si de verdad estás creciendo.'] },
  { id: 'inflacion', where: ['ahorro', 'sueldo'], title: 'Por qué la plata quieta pierde',
    body: ['Con inflación, los precios suben todos los meses. La plata que no rinde nada compra cada vez menos.',
      'Por ejemplo, con 2% de inflación mensual, $100.000 guardados sin rendimiento compran en un año lo que hoy cuesta unos $79.000.',
      'Por eso es importante que lo que ahorrás esté en algo que rinda, aunque sea para el corto plazo.'],
    tool: { label: 'Calcular cuánto rinde mi plata', route: 'herramientas' } },
  { id: 'modos', where: ['inicio', 'asesor'], title: 'Formas de ahorrar: ¿cuál me conviene?',
    body: ['Apartar un % apenas cobrás ("págate primero") es la más efectiva: ahorrás antes de tener la tentación de gastar. Un 10% a 20% es un buen comienzo.',
      'Un monto fijo por mes sirve si tus ingresos son estables y querés algo simple.',
      'Ahorrar lo que sobra a fin de mes es la más fácil de empezar, pero suele sobrar poco: funciona mejor si ya tenés tus gastos ordenados.',
      'Redondear cada gasto ahorra de a poquito sin que lo notes. Es un buen complemento de las otras.'] },
  { id: 'emergencia', where: ['ahorro', 'inicio'], title: 'El fondo de emergencia',
    body: ['Es una reserva para imprevistos: quedarte sin trabajo, un arreglo del auto, un problema de salud.',
      'Lo recomendable es juntar entre 3 y 6 meses de tus gastos fijos, en algo de lo que puedas disponer rápido (una cuenta remunerada, por ejemplo).',
      'Tenerlo evita endeudarte con la tarjeta cuando aparece algo inesperado.'] },
  { id: '503020', where: ['asesor'], title: 'La regla 50/30/20',
    body: ['Es una guía simple para repartir lo que cobrás: 50% para necesidades (vivienda, comida, servicios), 30% para gustos y 20% para ahorro.',
      'No es una ley: es un punto de partida. Si los fijos se llevan más del 50%, empezá por ahorrar menos y subilo de a poco.'] },
  { id: 'cuotas', where: ['herramientas', 'tarjetas'], title: 'Cuotas sin interés vs. contado',
    body: ['Con inflación, pagar en cuotas sin interés suele convenir: las últimas cuotas valen menos, porque los precios (y tus ingresos) suben.',
      'Pero si pagando de contado te hacen un buen descuento, puede convenir más. Para saberlo hay que comparar el "valor de hoy" de las cuotas con el precio de contado.',
      'Ojo con las cuotas "fijas" que tienen interés: ahí mirá el CFT (costo financiero total).'],
    tool: { label: 'Comparar cuotas o contado', route: 'herramientas' } },
  { id: 'cft', where: ['tarjetas', 'herramientas'], title: 'TNA, TEA y CFT',
    body: ['La TNA (tasa nominal anual) es la tasa "de lista". La TEA (efectiva anual) incluye el efecto de que los intereses generan más intereses.',
      'El CFT (costo financiero total) es lo que realmente pagás por un préstamo o una compra financiada: suma intereses, impuestos y gastos.',
      'Para comparar préstamos o cuotas con interés, mirá siempre el CFT.'] },
  { id: 'minimo', where: ['tarjetas'], title: 'El pago mínimo de la tarjeta',
    body: ['Pagar el mínimo evita la mora, pero el resto del saldo genera intereses muy altos, que se suman al mes siguiente.',
      'Si podés, pagá el total del resumen. Si no, pagá lo más que puedas y frená compras nuevas con esa tarjeta hasta ponerte al día.',
      'Fecha de cierre: hasta ahí entran las compras en el resumen. Fecha de vencimiento: hasta ahí tenés para pagarlo.'] },
  { id: 'uva', where: ['ahorro'], title: 'Plazo fijo tradicional vs. UVA',
    body: ['El plazo fijo tradicional te paga una tasa fija que conocés de antemano.',
      'El plazo fijo UVA se ajusta por inflación (más un pequeño interés), pero exige dejar la plata más tiempo (generalmente 90 días o más).',
      'Si creés que la inflación va a ser más alta que la tasa del tradicional, el UVA te protege mejor.'] },
  { id: 'hormiga', where: ['movimientos', 'inicio'], title: 'Gastos hormiga',
    body: ['Son gastos chicos y frecuentes que no se notan: un café, una gaseosa, un envío, una app.',
      'Uno solo no pesa, pero juntos pueden sumar una parte importante del mes.',
      'No se trata de eliminarlos todos, sino de saber cuánto suman y decidir cuáles valen la pena.'] },
  { id: 'compuesto', where: ['ahorro', 'herramientas'], title: 'El interés compuesto',
    body: ['Cuando los intereses que ganás se reinvierten, empiezan a generar intereses propios. Eso es el interés compuesto.',
      'Por eso empezar a ahorrar temprano importa más que ahorrar mucho: el tiempo multiplica.',
      'Truco rápido (regla del 72): dividí 72 por la tasa anual y sabés en cuántos años se duplica la plata.'],
    tool: { label: 'Calcular cuánto rinde mi plata', route: 'herramientas' } },
  { id: 'dolar', where: ['ahorro'], title: 'Ahorrar en dólares',
    body: ['El dólar protege contra la devaluación del peso, pero también sube y baja: no conviene comprar todo de golpe esperando el "mejor momento".',
      'Una estrategia común es comprar de a poco y de forma regular (por ejemplo, una parte de cada cobro).',
      'Tené en cuenta la diferencia entre precio de compra y de venta: si comprás y vendés seguido, perdés en cada operación.'] },
  { id: 'pagos', where: ['pagos'], title: 'Tu agenda de pagos',
    body: ['Saber qué tenés que pagar antes del próximo cobro evita los dos errores más caros: pagar tarde (recargos e intereses) y gastar una plata que ya estaba comprometida.',
      'Un hábito simple: el día que cobrás, separá lo que vence hasta el próximo cobro. Lo que queda es lo que realmente podés usar.',
      'Para pagos grandes que no son mensuales (seguro anual, patente, matrícula), conviene ir juntando de a poco cada mes: así no te desarman el mes en que vencen.'] },
  { id: 'resumen', where: ['inicio'], title: 'El hábito del resumen semanal',
    body: ['Cada lunes Pesitos arma solo el resumen de la semana anterior: cuánto gastaste, en qué y cómo te fue contra tu promedio.',
      'Mirarlo un minuto por semana alcanza para detectar a tiempo si algo se está yendo de las manos, sin tener que revisar cada gasto.'] },
];

export function lessonFor(s, place) {
  const seen = s.lessonsSeen || {};
  return LESSONS.find((l) => l.where.includes(place) && !seen[l.id]) || null;
}

export function lessonCard(s, place) {
  const l = lessonFor(s, place);
  if (!l) return '';
  return `<button class="card learn" data-action="openLesson" data-id="${l.id}" style="border:none;text-align:left">
    <span class="tip-head"><span class="badge">${sprout(17)}</span><strong>Aprendé en 1 minuto</strong></span>
    <span class="text" style="font-weight:700">${esc(l.title)}</span>
  </button>`;
}
