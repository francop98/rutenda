// =========================================================
// Pesitos — tutorial y ayuda
// Tutorial: unas pocas pantallas que se deslizan, la primera vez que entrás
// (y cuando quieras desde ? → Ayuda). Ayuda: preguntas frecuentes por tema.
// =========================================================

import { openModal, closeModal, icon, wordmark, bloquearFondo, liberarFondo } from './interfaz.js';
import { esc } from './formato.js';

const PASOS = [
  { ic: 'sprout', color: 'green', titulo: 'Hoy podés gastar', texto: 'Arriba de todo ves cuánto podés gastar hoy sin pasarte hasta el próximo cobro. Ya descuenta tus gastos fijos, tus tarjetas y lo que querés ahorrar.' },
  { ic: 'plus', color: 'lime', titulo: 'Anotá en segundos', texto: 'Escribí como hablás: "súper 48.000", "nafta 30 lucas ayer", "heladera 540.000 en 12 cuotas". La categoría la pongo yo. También podés sacarle una foto al ticket.' },
  { ic: 'calendar', color: 'amber', titulo: 'Nada se te pasa', texto: 'En Por pagar están tus vencimientos, los resúmenes de tus tarjetas y cuándo cobrás. Te aviso antes, aunque no abras la app.' },
  { ic: 'target', color: 'green', titulo: 'Ahorrá sin pensarlo', texto: 'Elegí cómo ahorrar y ponete una meta. Te digo cuánto apartar y cuándo llegás. En Mi plata ves cuánto tenés en cada cuenta, tus ahorros y cuánto rinden.' },
  { ic: 'ticket', color: 'lime', titulo: 'Descuentos para vos', texto: 'En Beneficios ves las promos de tus bancos, billeteras y tarjetas, día por día. Se actualizan solas.' },
  { ic: 'lock', color: 'green', titulo: 'Tus datos son tuyos', texto: 'Tus datos se guardan protegidos en tu cuenta y entrás con tu PIN. Si tenés dudas, tocá el signo de pregunta arriba a la derecha: ahí está tu asesor, las lecciones y la ayuda.' },
];

// ---------- tutorial ----------
export function abrirTutorial({ alTerminar } = {}) {
  let i = 0;
  let capa = document.getElementById('tutorial');
  if (!capa) { capa = document.createElement('div'); capa.id = 'tutorial'; document.body.appendChild(capa); }
  capa.className = 'tutorial';
  capa.setAttribute('role', 'dialog'); capa.setAttribute('aria-modal', 'true'); capa.setAttribute('aria-label', 'Cómo usar Pesitos');
  capa.innerHTML = `<div class="tuto-caja">
    <div class="tuto-top">${wordmark(22, 'var(--ink)')}<button class="btn ghost small" data-tuto="saltar">Saltar</button></div>
    <div class="tuto-pista">${PASOS.map((p, n) => `<section class="tuto-paso" aria-hidden="${n !== 0}">
      <span class="tuto-ic ${p.color}">${icon(p.ic, 44, 2)}</span>
      <h2>${esc(p.titulo)}</h2><p>${esc(p.texto)}</p></section>`).join('')}</div>
    <div class="tuto-pie">
      <div class="tuto-puntos">${PASOS.map((_, n) => `<button data-tuto-ir="${n}" aria-label="Paso ${n + 1}"></button>`).join('')}</div>
      <div class="btn-row"><button class="btn" data-tuto="atras">Atrás</button><button class="btn primary" data-tuto="seguir">Siguiente</button></div>
    </div></div>`;
  capa.hidden = false;
  bloquearFondo('tutorial');
  const pista = capa.querySelector('.tuto-pista');
  const ir = (n) => {
    i = Math.max(0, Math.min(PASOS.length - 1, n));
    pista.style.transform = `translateX(-${i * 100}%)`;
    capa.querySelectorAll('.tuto-paso').forEach((p, k) => p.setAttribute('aria-hidden', String(k !== i)));
    capa.querySelectorAll('.tuto-puntos button').forEach((b, k) => b.classList.toggle('on', k === i));
    capa.querySelector('[data-tuto=atras]').style.visibility = i ? 'visible' : 'hidden';
    capa.querySelector('[data-tuto=seguir]').textContent = i === PASOS.length - 1 ? '¡Empezar!' : 'Siguiente';
  };
  const cerrar = () => { capa.hidden = true; capa.innerHTML = ''; liberarFondo('tutorial'); document.removeEventListener('keydown', teclas); if (alTerminar) alTerminar(); };
  const teclas = (e) => { if (e.key === 'ArrowRight') ir(i + 1); if (e.key === 'ArrowLeft') ir(i - 1); if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', teclas);
  capa.onclick = (e) => {
    const b = e.target.closest('[data-tuto], [data-tuto-ir]');
    if (!b) return;
    if (b.dataset.tutoIr) return ir(Number(b.dataset.tutoIr));
    if (b.dataset.tuto === 'saltar') return cerrar();
    if (b.dataset.tuto === 'atras') return ir(i - 1);
    if (b.dataset.tuto === 'seguir') return i === PASOS.length - 1 ? cerrar() : ir(i + 1);
  };
  // deslizar con el dedo
  let x0 = null; let y0 = 0;
  pista.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; pista.style.transition = 'none'; }, { passive: true });
  pista.addEventListener('touchmove', (e) => {
    if (x0 === null) return;
    const dx = e.touches[0].clientX - x0;
    if (Math.abs(dx) < Math.abs(e.touches[0].clientY - y0)) return;
    pista.style.transform = `translateX(calc(-${i * 100}% + ${dx}px))`;
  }, { passive: true });
  pista.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    pista.style.transition = '';
    ir(dx < -50 ? i + 1 : dx > 50 ? i - 1 : i);
  });
  ir(0);
  setTimeout(() => capa.querySelector('[data-tuto=seguir]').focus(), 50);
}

// ---------- ayuda ----------
export const AYUDA_TEMAS = [
  { titulo: 'Primeros pasos', ic: 'sprout', preguntas: [
    ['¿Qué es "Hoy podés gastar"?', 'Es lo que podés gastar hoy para llegar bien al próximo cobro. Toma lo que cobrás, le resta tus gastos fijos, lo que tenés que pagar de tarjetas y lo que elegiste ahorrar, y lo reparte entre los días que faltan. Si un día gastás menos, al día siguiente tenés un poco más.'],
    ['¿Qué tengo que cargar sí o sí?', 'Con lo que cobrás por mes ya funciona. Después, cuanto más cargues (gastos fijos, tarjetas, gastos del día), más preciso es. Lo demás te lo voy preguntando de a poco.'],
    ['¿Por qué "Hoy podés gastar" no es todo lo que me queda?', 'Porque te muestro lo que podés gastar por día para llegar bien al cobro: tu ritmo normal del mes. Si un día gastás de más, los que siguen bajan. Si gastás de menos, lo que no gastaste se reparte: una parte se suma a tus próximos días y otra te sugiero pasarla a tu meta (por defecto, mitad y mitad). Lo cambiás tocando "Cómo se reparte" en Inicio.'],
    ['¿Lo que no gasto un día se acumula?', 'Sí, según cómo lo elijas en Inicio → "Cómo se reparte": todo para gastar después, mitad y mitad, 25% y 75%, o todo a ahorro. Lo que va a ahorro lo pasás a tu meta con un toque.'],
    ['¿Qué son los avisos de Inicio?', 'En Inicio te muestro lo más importante del momento (por ejemplo, un pago que vence). El resto queda en la campanita de arriba: el número rojo te dice cuántos avisos nuevos hay. Las sugerencias que no te sirvan las podés ocultar.'],
    ['¿Puedo probar sin cargar mis datos?', 'Sí: desde Menú → Copia de seguridad podés cargar datos de ejemplo y después borrarlos.'],
  ] },
  { titulo: 'Cargar gastos e ingresos', ic: 'plus', preguntas: [
    ['¿Cómo anoto un gasto rápido?', 'En Inicio escribí el gasto y el monto: "súper 48.000". Entiende "lucas", "palos", "ayer", "el lunes", fechas como "15/10" y cuotas: "zapatillas 120.000 en 6 cuotas visa".'],
    ['¿Y un ingreso?', 'Tocá "Ingreso" arriba del campo y escribí, por ejemplo, "venta 85.000".'],
    ['¿Cómo elijo la categoría, la cuenta o la fecha?', 'Tocá la categoría en la fila de abajo del campo. Para la cuenta o la tarjeta y la fecha, abrí "Con qué pagaste y fecha". Si no tocás nada, lo elijo yo.'],
    ['¿Puedo cargar un gasto en dólares?', 'Sí: "cena 30 usd". Lo paso a pesos con la cotización del día. Desde el gasto detallado podés cambiar la cotización.'],
    ['¿Para qué sirve importar movimientos?', 'Para no cargar uno por uno: subís el resumen de la tarjeta (PDF) o el Excel que descargás de tu banco o billetera y traigo todos los gastos juntos. Está en Movimientos (flecha hacia arriba) y en cada tarjeta.'],
    ['¿Para qué sirven las etiquetas?', 'Agregá #algo al texto ("hotel 200.000 #vacaciones") y después buscás o ves estadísticas de todo lo que tenga esa etiqueta.'],
    ['¿Y si lo pagamos entre varios?', 'Abrí el gasto, marcá "Lo compartí" y elegí entre cuántos. Cuento solo tu parte y te anoto lo que te deben.'],
    ['¿Puedo cargar desde un ticket o un resumen?', 'Sí. Con el botón del comprobante al lado del campo podés sacarle foto al ticket, pegar el texto de un comprobante o importar el resumen de la tarjeta (PDF) o el Excel de tu banco.'],
    ['Borré algo sin querer', 'Justo después de borrar aparece "Deshacer" abajo. Tocalo y vuelve.'],
  ] },
  { titulo: 'Tarjetas, pagos y cuentas', ic: 'calendar', preguntas: [
    ['¿Cómo cargo mi tarjeta de crédito?', 'Andá a Por pagar → Tarjetas → + Tarjeta y poné el próximo cierre y vencimiento (están en tu último resumen). Cada mes te pido las fechas del resumen siguiente. Las compras con esa tarjeta van solas al resumen que corresponde, con sus cuotas.'],
    ['¿Qué es el stop debit?', 'Es pedirle al banco que no debite un pago que tenés en débito automático, solo por ese vencimiento. Se pide desde el home banking o la app del banco (suele estar en "Débitos automáticos" → "Stop debit"), normalmente hasta el día hábil anterior al vencimiento. Sirve para pagarlo vos desde otra cuenta o para frenar un débito con el importe mal. El vencimiento sigue corriendo: hay que pagarlo igual. En Pesitos lo marcás tocando el pago en Por pagar → "Este mes no se debita": ese mes queda pendiente hasta que toques "Pagué" y el siguiente vuelve al débito automático. Si ya te lo debitaron, existe la reversión: la pedís al banco dentro de los 30 días.'],
    ['¿Dónde anoto algo que tengo que hacer más adelante?', 'En Por pagar → + Agregar → Un recordatorio. Por ejemplo: "Llamar al banco para que sigan bonificando el mantenimiento", con la fecha y una nota. Te aviso ese día y lo ves en la agenda.'],
    ['¿Qué es Por pagar?', 'Todos tus vencimientos juntos: gastos fijos, resúmenes de tarjetas y pagos programados. Tocá "Pagué" cuando lo pagues.'],
    ['¿Cómo veo cuánta plata tengo en cada cuenta?', 'En Mi plata → Cuentas cargá cuánto tenés hoy en cada cuenta. Después se actualiza solo con cada gasto, ingreso, pago y transferencia. Si la cuenta rinde (Mercado Pago, Ualá), también le sumo los intereses de cada día.'],
    ['¿Cómo pongo un tope a una categoría?', 'En Estadísticas, tocá la categoría (por ejemplo, Delivery) y poné cuánto querés gastar como máximo por mes. Te aviso cuando llegás al 80% y al 100%.'],
  ] },
  { titulo: 'Ahorro y metas', ic: 'target', preguntas: [
    ['¿Cómo abro el menú?', 'Tocá ☰ arriba a la izquierda, o deslizá el dedo hacia la derecha desde la mitad izquierda de la pantalla. No empieces justo en el borde: ahí el celular usa el gesto de "atrás".'],
    ['¿Cómo funciona la forma de ahorrar?', 'Elegís una (apartar un % al cobrar, un monto fijo, lo que sobre o redondear cada gasto) y te recuerdo hacerlo. La cambiás en Mi plata → Ahorros → Cómo ahorro.'],
    ['¿Cómo cargo lo que tengo ahorrado?', 'En Mi plata → Ahorros → Agregar dónde ahorrás. Puede ser en pesos, dólares, cripto u oro (en gramos). Lo paso a pesos con la cotización del día y, si rinde, sumo los intereses solo.'],
    ['¿Cómo creo una meta?', 'En Mi plata → Metas. Poné cuánto necesitás y te digo cuánto apartar por mes y cuándo llegás.'],
  ] },
  { titulo: 'Promos y beneficios', ic: 'ticket', preguntas: [
    ['¿De dónde salen las promos?', 'De una fuente pública que se actualiza todos los días. Te muestro solo las de tus medios de pago y tu zona.'],
    ['No veo promos', 'Revisá que hayas elegido tus bancos, billeteras y tarjetas (Menú → Mis medios de pago) y tu provincia (Menú → tocá tu nombre → Mis datos).'],
    ['¿Puedo filtrar?', 'Sí: en Beneficios elegí un medio de pago y un rubro.'],
  ] },
  { titulo: 'Cuenta, seguridad y privacidad', ic: 'lock', preguntas: [
    ['¿Quién puede ver mis datos?', 'Solo vos, desde tu cuenta. Viajan cifrados, se guardan cifrados en los servidores de Google (Firebase) y las reglas de la base no dejan que nadie más los lea desde la app. No se venden ni se comparten.'],
    ['¿Para qué es el PIN de seguridad?', 'Te lo pido cada vez que iniciás sesión, en cualquier dispositivo. Si querés que también te lo pida al abrir la app, lo activás en Menú → PIN de seguridad y huella. En el celular podés usar tu huella o tu cara en lugar del PIN.'],
    ['Me olvidé el PIN', 'En la pantalla del PIN tocá "Olvidé mi PIN": cerrás sesión, volvés a entrar con tu mail y contraseña (o con Google) y creás uno nuevo. Tus datos no se pierden.'],
    ['¿Y la clave de Pesitos y el código de recuperación?', 'Ya no existen. Si los tenías, te pido la clave una última vez para pasar tus datos al formato nuevo y después no la necesitás más.'],
    ['¿Puedo entrar con la huella?', 'Sí: Menú → PIN de seguridad y huella. En ese celular te pide la huella o la cara en lugar del PIN.'],
    ['¿Cómo instalo la app?', 'Menú → Instalar Pesitos como app. En iPhone: en Safari tocá Compartir → Agregar a inicio.'],
    ['¿Cómo activo los avisos?', 'Menú → Avisos en el celular → Activar. En iPhone, primero instalá la app.'],
    ['¿Cómo descargo o borro mis datos?', 'Descargar: Menú → Copia de seguridad. Borrar todo: Menú → tocá tu nombre (arriba) → Eliminar mi cuenta.'],
  ] },
];

export function ayudaHtml() {
  return `<button class="card tuto-cta" data-action="verTutorial">
      <span class="tuto-ic sm green">${icon('play', 22, 2)}</span>
      <span class="grow"><b>Ver el tutorial</b><span class="small muted">Lo principal de Pesitos en 1 minuto</span></span>${icon('chevron', 16)}
    </button>
    <div class="field"><label for="ay-q" class="sr-only">Buscar en la ayuda</label><input id="ay-q" placeholder="Buscar: tarjeta, dólares, huella…" data-input="ayudaBuscar" autocomplete="off"></div>
    <div id="ay-lista">${listaAyuda('')}</div>
    <div class="card"><span class="small">¿No encontraste lo que buscabas? Escribinos a <a href="mailto:pesitosapp@gmail.com">pesitosapp@gmail.com</a>.</span></div>`;
}

function listaAyuda(q) {
  const n = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const qq = n(q.trim());
  const bloques = AYUDA_TEMAS.map((t) => {
    const ps = qq ? t.preguntas.filter(([p, r]) => n(p + ' ' + r).includes(qq)) : t.preguntas;
    if (!ps.length) return '';
    return `<div class="ay-tema"><div class="ay-tema-t">${icon(t.ic, 18)} ${esc(t.titulo)}</div>
      ${ps.map(([p, r]) => `<details class="ay-p" ${qq ? 'open' : ''}><summary>${esc(p)}</summary><p>${esc(r)}</p></details>`).join('')}</div>`;
  }).join('');
  return bloques || '<p class="empty">No encontré nada con eso. Probá con otra palabra.</p>';
}

export const ayudaActions = {
  openAyuda() { openModal('Ayuda', ayudaHtml()); },
  ayudaBuscar(ctx, el) { const l = document.getElementById('ay-lista'); if (l) l.innerHTML = listaAyuda(el.value); },
  verTutorial(ctx) { closeModal(); abrirTutorial({ alTerminar: () => marcarVisto(ctx) }); },
};

export function marcarVisto(ctx) {
  if (!ctx.state.tutorialVisto) ctx.update((s) => { s.tutorialVisto = true; });
}

/** La primera vez que entrás (ya con la bienvenida hecha), mostrar el tutorial. */
let programado = false;
export function tutorialPendiente(ctx) {
  const s = ctx.state;
  if (programado || !s.ready || s.demo || s.tutorialVisto) return;
  programado = true;
  setTimeout(() => {
    programado = false;
    if (ctx.state.tutorialVisto || document.body.classList.contains('bloqueado') || (document.getElementById('tutorial') && !document.getElementById('tutorial').hidden)) return;
    abrirTutorial({ alTerminar: () => marcarVisto(ctx) });
  }, 500);
}
