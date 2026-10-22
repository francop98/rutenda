/* =========================================================
   Rutenda — "Preguntale a Rutenda"
   Un chat corto que conoce tu viaje: itinerario, gastos,
   valija, documentos y lo que falta. La IA solo se usa cuando
   enviás una pregunta (nunca sola).
   ========================================================= */
window.R = window.R || {};

R.preguntar = (function () {
  const U = R.util;
  const { esc } = U;
  const C = () => R.recorrido;
  const charlas = {};   // { viajeId: [{ rol: 'yo'|'rutenda', texto }] } (solo mientras la app está abierta)

  const SUGERENCIAS_VIAJANDO = ['¿Qué hago hoy?', '¿Cuánto llevo gastado?', '¿Qué hay mañana?', '¿Quién le debe a quién?'];
  const SUGERENCIAS = ['¿Qué me falta resolver?', '¿Qué llevo en la valija?', '¿Cuánto llevo gastado?', '¿Qué conviene hacer primero?'];

  const nombre = pid => ((R.db.persona(pid) || {}).nombre) || 'Viajero';
  const plata = (v, n) => U.fmtMoneda(n, v.monedaBase);

  /** Resumen del viaje en texto (lo que la IA puede saber). */
  function contexto(v) {
    const L = [];
    const hoy = U.hoyISO();
    L.push(`Hoy es ${U.fmtFecha(hoy, 'largo')} (${hoy}).`);
    L.push(`Viaje: ${v.nombre || (v.destinos || []).map(d => d.nombre).join(' → ') || v.destino || 'sin nombre'}. Estado: ${R.viajes.estadoViaje(v)}.`);
    L.push(`Fechas: ${v.fechaInicio || 'sin definir'} a ${v.fechaFin || 'sin definir'}. Sale de: ${(v.origen || {}).nombre || 'sin definir'}.`);
    L.push(`Viajeros: ${(v.participantes || []).map(nombre).join(', ') || 'solo'}. Quien pregunta: ${nombre(R.db.yoEn(v))}.`);
    const est = C().estadias(v);
    if (est.length) L.push('Destinos: ' + est.map(e => `${e.nombre}${e.lugar && e.lugar.pais ? ' (' + e.lugar.pais + ')' : ''}${e.desde ? ` del ${e.desde} al ${e.hasta || '?'}, ${e.noches != null ? e.noches + ' noches' : ''}` : ''}`).join('; ') + '.');
    // Itinerario día por día
    const dias = R.itinerario.diasDelViaje(v);
    if (dias.length) {
      L.push('\nITINERARIO:');
      dias.forEach(f => {
        const d = R.itinerario.diaDe(v, f);
        const items = d.items.map(i => `${i.hora || 's/h'} ${i.titulo}${i.sub ? ' (' + i.sub + ')' : ''}`).join('; ');
        L.push(`Día ${d.numero} ${f}${d.lugarNombre ? ' en ' + d.lugarNombre : ''}: ${items || 'libre'}${d.dormis ? '. Duerme: ' + d.dormis.texto + (d.dormis.direccion ? ', ' + d.dormis.direccion : '') : ''}.`);
      });
    }
    // Lo que falta en la guía
    const pend = R.motor.proximos(v, 12);
    if (pend.length) L.push('\nPENDIENTES DE LA GUÍA (en orden): ' + pend.slice(0, 12).map(t => t.titulo + (t.fechaLimite ? ` (antes del ${t.fechaLimite})` : '')).join('; ') + '.');
    // Qué hacer
    if (R.ideas) {
      const planes = R.ideas.todos(v).filter(p => p.estado !== 'descarto');
      if (planes.length) L.push('QUÉ HACER: ' + planes.slice(0, 30).map(p => `${p.titulo}${p.estado === 'va' ? ' [va' + (p.fecha ? ' el ' + p.fecha : '') + ']' : ' [por decidir]'}`).join('; ') + '.');
    }
    // Gastos
    const t = R.gastos.totales(v);
    if ((v.movimientos || []).length) {
      L.push(`\nGASTOS (moneda ${v.monedaBase}): gastado ${plata(v, t.gastado)}, ingresos/reintegros ${plata(v, t.ingresado)}, neto ${plata(v, t.neto)}.`);
      const cats = Object.entries(t.porCategoria || {}).filter(([, n]) => n).map(([id, n]) => `${(R.gastos.categorias().find(c => c.id === id) || { nombre: id }).nombre}: ${plata(v, n)}`);
      if (cats.length) L.push('Por categoría: ' + cats.join('; ') + '.');
      if ((v.participantes || []).length > 1) {
        const s = R.gastos.saldos(v);
        const tr = R.gastos.transferencias(s);
        L.push('Cuentas: ' + (tr.length ? tr.map(x => `${nombre(x.de)} le debe ${plata(v, x.monto)} a ${nombre(x.para)}`).join('; ') : 'están a mano') + '.');
      }
      L.push('Últimos movimientos: ' + v.movimientos.slice(-12).map(m => `${m.fecha} ${m.tipo} ${m.concepto || m.categoria} ${m.monto} ${m.moneda}`).join('; ') + '.');
      if (v.presupuesto) L.push(`Presupuesto: ${plata(v, v.presupuesto)}.`);
    } else L.push('\nGASTOS: no hay nada cargado.');
    // Valija (la de quien pregunta)
    const val = R.valija.valijaDe(v);
    if (val.items.length) {
      const falta = val.items.filter(i => !i.hecho).map(i => i.texto);
      L.push(`\nVALIJA: ${val.items.length} cosas, ${val.items.length - falta.length} guardadas. Falta guardar: ${falta.slice(0, 40).join(', ') || 'nada'}.`);
    } else L.push('\nVALIJA: vacía.');
    // Documentos
    if ((v.documentos || []).length) L.push('DOCUMENTOS GUARDADOS: ' + v.documentos.slice(0, 30).map(d => d.nombre).join(', ') + '.');
    // Requisitos y pasaporte
    const pas = R.requisitos.pasaporte ? R.requisitos.pasaporte(v) : null;
    if (pas) L.push('PASAPORTE: ' + pas.texto);
    const req = R.requisitos.analizar(v);
    if (req.porPais && req.porPais.length) L.push('REQUISITOS: ' + req.porPais.map(p => `${p.pais}: ${p.nota}`).join(' ') );
    // Costumbres guardadas
    Object.values(v.costumbres || {}).forEach(c => { if (c && c.datos && c.datos.resumen) L.push('COSTUMBRES: ' + c.datos.resumen); });
    return L.join('\n').slice(0, 14000);
  }

  async function preguntar(v, pregunta) {
    if (R.db.modo() !== 'nube' || !R.nube.auth().currentUser) throw new Error('Necesitás entrar con tu cuenta en la nube.');
    if (navigator.onLine === false) throw new Error('Sin conexión: probá cuando tengas señal.');
    const token = await R.nube.auth().currentUser.getIdToken();
    const r = await fetch('/api/preguntar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ pregunta, contexto: contexto(v), historial: (charlas[v.id] || []).slice(-6) })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No pude responder ahora.');
    return d.respuesta;
  }

  /** Texto de la IA con un formato mínimo (negritas y listas), siempre escapado. */
  function formato(t) {
    return esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .split(/\n+/).map(l => /^\s*[-•*]\s+/.test(l) ? `<li>${l.replace(/^\s*[-•*]\s+/, '')}</li>` : `<p>${l}</p>`).join('')
      .replace(/(<li>.*?<\/li>)+/g, m => `<ul>${m}</ul>`);
  }

  function abrir(v) {
    const lista = charlas[v.id] = charlas[v.id] || [];
    const sug = R.viajes.estadoViaje(v) === 'en_curso' ? SUGERENCIAS_VIAJANDO : SUGERENCIAS;
    const { el } = U.modal({
      titulo: '✨ Preguntale a Rutenda',
      subtitulo: 'Sabe lo que cargaste en este viaje. Usa IA solo cuando enviás.',
      ancho: true,
      cuerpo: `
        <div class="chat" aria-live="polite"></div>
        <div class="chat-sugerencias">${sug.map(x => `<button type="button" class="chip-op" data-sug="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        <form class="chat-form" data-form="preguntar">
          <input id="chatPregunta" placeholder="Escribí tu pregunta" maxlength="500" autocomplete="off">
          <button type="submit" class="btn btn-primario" aria-label="Enviar">Enviar</button>
        </form>`
    });
    const chat = el.querySelector('.chat');
    const pintar = (pensando) => {
      chat.innerHTML = (lista.length ? lista.map(m => `<div class="msg msg-${m.rol}">${m.rol === 'yo' ? esc(m.texto) : formato(m.texto)}</div>`).join('')
        : '<p class="chat-vacio">Preguntá lo que quieras sobre el viaje: horarios, gastos, qué te falta, qué llevar…</p>')
        + (pensando ? '<div class="msg msg-rutenda msg-pensando"><span></span><span></span><span></span></div>' : '');
      chat.scrollTop = chat.scrollHeight;
    };
    pintar();
    const form = el.querySelector('[data-form="preguntar"]');
    const input = el.querySelector('#chatPregunta');
    const enviar = async texto => {
      const p = (texto || '').trim();
      if (!p) return;
      input.value = '';
      lista.push({ rol: 'yo', texto: p });
      pintar(true);
      form.querySelector('button').disabled = true;
      try {
        const resp = await preguntar(v, p);
        lista.push({ rol: 'rutenda', texto: resp });
      } catch (e) {
        lista.push({ rol: 'rutenda', texto: '😕 ' + (e.message || 'No pude responder ahora.') });
      }
      form.querySelector('button').disabled = false;
      if (chat.isConnected) { pintar(); input.focus(); }
    };
    form.onsubmit = e => { e.preventDefault(); enviar(input.value); };
    el.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => enviar(b.dataset.sug));
  }

  return { abrir, contexto, formato };
})();
