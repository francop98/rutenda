/* =========================================================
   Rutenda — "Qué hacer si…"
   Guías cortas para cuando algo sale mal en el viaje.
   Están dentro de la app: se ven también sin señal.
   Pensadas para viajeros argentinos; ante la duda, siempre
   manda lo que diga tu seguro, la empresa o el consulado.
   ========================================================= */
window.R = window.R || {};

R.queHacerSi = (function () {
  const U = R.util;
  const { esc } = U;

  const GUIAS = [
    { id: 'documento', icono: '📘', titulo: 'Perdí el pasaporte o el DNI', pasos: [
      'En el exterior: hacé la denuncia en la policía y pedí una copia.',
      'Contactá al consulado argentino {consulado}: te pueden dar un documento de viaje provisorio para volver. Llevá la denuncia, una foto y, si tenés, la copia del pasaporte (guardala en Documentos).',
      'Si vuelás en pocos días, avisale a la aerolínea.',
      'Dentro de Argentina: para vuelos de cabotaje en general se acepta el DNI digital de la app Mi Argentina. Igual, confirmalo con la aerolínea antes de ir al aeropuerto.'
    ] },
    { id: 'vuelo', icono: '✈️', titulo: 'Me cancelaron o demoraron el vuelo', pasos: [
      'Pedí en el mostrador o en la app de la aerolínea tus opciones: reprogramar sin costo o que te devuelvan la plata.',
      'Si la demora es larga, la aerolínea tiene que darte asistencia: comida, comunicación y, si hace falta pasar la noche, alojamiento. Pedila y guardá los tickets de lo que gastes.',
      'Avisá al alojamiento y a los traslados que tenías reservados.',
      'Vuelos desde o hacia la Unión Europea: según el Reglamento 261/2004 puede corresponderte una compensación de 250 a 600 €.',
      'Si en Argentina no te dan respuesta, podés reclamar en Defensa del Consumidor.'
    ] },
    { id: 'valija', icono: '🧳', titulo: 'Mi valija no llegó o llegó rota', pasos: [
      'No salgas del aeropuerto: hacé el reclamo en el mostrador de equipajes. Te dan un número de reclamo (PIR): sacale una foto.',
      'En vuelos internacionales, por daño reclamá por escrito dentro de los 7 días; por demora, dentro de los 21 días desde que te la entregan.',
      'Guardá los tickets de lo básico que compres (ropa, higiene): se lo podés reclamar a la aerolínea y a tu seguro {seguro}.',
      'Revisá si tu seguro de viaje o tu tarjeta cubren el equipaje.'
    ] },
    { id: 'robo', icono: '💳', titulo: 'Me robaron (celular, billetera o tarjetas)', pasos: [
      'Bloqueá las tarjetas desde la app del banco o llamando a su número de emergencias.',
      'Celular: pedile a tu compañía que bloquee la línea y el equipo (IMEI). Desde otro dispositivo, cambiá las claves del mail y del banco.',
      'Hacé la denuncia en la policía: la piden el seguro y el banco.',
      'Tus reservas y documentos siguen en Rutenda: entrá con tu cuenta desde cualquier celular o compu.'
    ] },
    { id: 'salud', icono: '🤒', titulo: 'Me enfermé o tuve un accidente', pasos: [
      'Si es grave, llamá a emergencias (están arriba, en 🆘 Emergencias).',
      'Si no es urgente, llamá primero a la asistencia de tu seguro {seguro}: te dicen a dónde ir y, en general, cubren sin que pagues. Si vas por tu cuenta, a veces solo te reintegran.',
      'Guardá informes, recetas y tickets: los vas a necesitar para el reintegro.'
    ] },
    { id: 'alojamiento', icono: '🏨', titulo: 'El alojamiento no tiene mi reserva', pasos: [
      'Mostrá la confirmación con el código (está en Documentos y en el Itinerario).',
      'Si reservaste por una plataforma (Booking, Airbnb, etc.), contactalos desde su app: tienen que ayudarte a conseguir otra opción.',
      'Si lo que encontrás no es lo que reservaste, sacá fotos y avisá a la plataforma antes de quedarte.'
    ] },
    { id: 'conexion', icono: '🚌', titulo: 'Perdí el micro, el tren o una conexión', pasos: [
      'Andá enseguida a la empresa: muchas veces te pasan al siguiente, gratis si fue culpa de ellos o pagando una diferencia.',
      'Si los dos tramos estaban en la misma reserva, la empresa te tiene que reubicar sin costo.',
      'Avisá al alojamiento si vas a llegar más tarde.'
    ] }
  ];

  function datosSeguro(v) { return ((v.tareas || {}).p_seguro || {}).datos || {}; }

  function texto(paso, v) {
    const seg = datosSeguro(v);
    const cons = (v.emergencias || {}).consulado;
    return esc(paso)
      .replace('{seguro}', seg.telefono ? `(<a href="tel:${esc(String(seg.telefono).replace(/[^+\d]/g, ''))}">📞 ${esc(seg.telefono)}</a>)` : '')
      .replace('{consulado}', cons ? `(<a href="tel:${esc(String(cons).replace(/[^+\d]/g, ''))}">📞 ${esc(cons)}</a>)` : '')
      .replace(/\s+\./g, '.').replace(/\s{2,}/g, ' ');
  }

  /** Bloque para la pestaña Documentos. */
  function html(v) {
    return `
      <details class="bloque plegable que-hacer-si" data-que-hacer-si>
        <summary><div><h3 class="bloque-titulo">🧭 Qué hacer si…</h3><small>Si algo sale mal. Se ve también sin señal.</small></div></summary>
        <div class="plegable-cuerpo">
          ${GUIAS.map(g => `
            <details class="qhs-guia" data-guia="${g.id}">
              <summary><span>${g.icono}</span>${esc(g.titulo)}</summary>
              <ol>${g.pasos.map(p => `<li>${texto(p, v)}</li>`).join('')}</ol>
            </details>`).join('')}
          <p class="ayuda">Es una guía general. Ante la duda, manda lo que digan tu seguro, la empresa o el consulado.</p>
        </div>
      </details>`;
  }

  let abierto = false;
  function enlazar(cont) {
    const d = cont.querySelector('[data-que-hacer-si]');
    if (!d) return;
    if (abierto) d.open = true;
    d.addEventListener('toggle', () => { abierto = d.open; });
  }
  /** Abre Documentos con la guía desplegada. */
  function ir(v) {
    abierto = true;
    location.hash = `#viaje/${v.id}/documentos`;
    setTimeout(() => { const d = document.querySelector('[data-que-hacer-si]'); if (d) { d.open = true; d.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }, 200);
  }

  return { GUIAS, html, enlazar, ir };
})();
