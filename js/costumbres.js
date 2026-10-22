/* =========================================================
   Rutenda — "Cómo es allá"
   Por cada destino: la diferencia horaria con tu casa (sin IA)
   y, si la pedís, las costumbres del lugar: a qué hora se come,
   comidas típicas, hábitos, propinas, frases útiles y datos
   prácticos. La IA solo se usa cuando tocás el botón y el
   resultado queda guardado en el viaje (sirve sin señal).
   v.costumbres[destId] = { datos, fuentes, creado }
   ========================================================= */
window.R = window.R || {};

R.costumbres = (function () {
  const U = R.util;
  const { esc } = U;
  const C = () => R.recorrido;
  const memoria = {};      // para quien no organiza (no se guarda en el viaje)
  const cargando = new Set();

  function destinos(v) {
    const vistos = new Set();
    return (v.destinos || []).filter(d => {
      if (!d.nombre) return false;
      const k = (d.nombre + '|' + (d.pais || '')).toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }
  function guardado(v, d) { return ((v.costumbres || {})[d.id]) || memoria[d.id] || null; }

  /** Línea de la hora: "Misma hora que en casa" o "Allá son 5 h más que en Bahía Blanca". */
  function horaHTML(v, d) {
    const fecha = d.fecha || v.fechaInicio || U.hoyISO();
    const dif = C().difConCasa(v, d, fecha);
    if (dif == null) return '';
    const casa = (v.origen && v.origen.nombre) || 'tu casa';
    if (!dif) return `<p class="cost-hora">🕒 Misma hora que en ${esc(casa)}.</p>`;
    const jet = Math.abs(dif) >= 4
      ? ` <small>Tip: desde el primer día, comé y dormí en el horario de allá y tomá sol a la mañana: el cuerpo se acomoda más rápido.</small>` : '';
    return `<p class="cost-hora">🕒 Allá son <strong>${C().fmtDif(dif)}</strong> que en ${esc(casa)}${C().horaEn(d.zona) ? ` (ahora: ${C().horaEn(d.zona)})` : ''}.${jet}</p>`;
  }

  function seccion(icono, titulo, cuerpo) { return cuerpo ? `<div class="cost-sec"><h5>${icono} ${titulo}</h5>${cuerpo}</div>` : ''; }

  function datosHTML(r) {
    const c = r.datos || {};
    const h = c.horarios || {};
    const horarios = [['☕', 'Desayuno', h.desayuno], ['🍝', 'Almuerzo', h.almuerzo], ['🍷', 'Cena', h.cena]].filter(x => x[2]);
    const practico = [['💵', 'Pagos', c.pagos], ['🙌', 'Propina', c.propina], ['🚰', 'Agua', c.agua], ['🔌', 'Enchufe', c.enchufe], ['🗣️', 'Idioma', c.idioma]].filter(x => x[2]);
    return `
      ${c.resumen ? `<p class="cost-resumen">${esc(c.resumen)}</p>` : ''}
      ${seccion('🕐', 'A qué hora se come', horarios.length || h.nota ? `
        ${horarios.length ? `<div class="cost-horarios">${horarios.map(([i, n, x]) => `<span><small>${i} ${n}</small><strong>${esc(x)}</strong></span>`).join('')}</div>` : ''}
        ${h.nota ? `<p class="texto-suave">${esc(h.nota)}</p>` : ''}` : '')}
      ${seccion('🍽️', 'Comidas típicas', (c.comidas || []).length ? `<ul class="cost-lista">${c.comidas.map(x => `<li><strong>${esc(x.nombre)}</strong>${x.descripcion ? ` · ${esc(x.descripcion)}` : ''}</li>`).join('')}</ul>` : '')}
      ${seccion('🤝', 'Costumbres', (c.costumbres || []).length ? `<ul class="cost-lista">${c.costumbres.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '')}
      ${seccion('💬', 'Frases útiles', (c.frases || []).length ? `<div class="cost-frases">${c.frases.map(x => `<div><small>${esc(x.es)}</small><strong>${esc(x.local)}</strong>${x.pronunciacion ? `<i>${esc(x.pronunciacion)}</i>` : ''}</div>`).join('')}</div>` : '')}
      ${seccion('💡', 'Para tener en cuenta', practico.length ? `<ul class="cost-lista cost-practico">${practico.map(([i, n, x]) => `<li><span>${i}</span><div><strong>${n}:</strong> ${esc(x)}</div></li>`).join('')}</ul>` : '')}
      ${seccion('⚠️', 'Mejor evitar', (c.evitar || []).length ? `<ul class="cost-lista">${c.evitar.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '')}
      <p class="cost-fuente">Orientativo, armado con IA${(r.fuentes || []).length ? ' a partir de ' + r.fuentes.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.nombre)}</a>`).join(' y ') : ''}.</p>`;
  }

  function destinoHTML(v, d, varios) {
    const r = guardado(v, d);
    const enCurso = cargando.has(d.id);
    return `
      <div class="cost-dest" data-cost-dest="${d.id}">
        ${varios ? `<h4>${R.lugares.bandera(d.codigoPais) || '📍'} ${esc(d.nombre)}</h4>` : ''}
        ${horaHTML(v, d)}
        ${r ? datosHTML(r) : `
          <button type="button" class="btn btn-suave btn-chico" data-costumbres="${d.id}" ${enCurso ? 'disabled' : ''}>${enCurso ? 'Buscando…' : `✨ Ver cómo es ${esc(d.nombre)}`}</button>
          <small class="texto-tenue cost-ayuda">Horarios de comida, platos típicos, costumbres y frases. Usa una consulta de IA, solo cuando lo tocás.</small>`}
      </div>`;
  }

  /** Contenido del plegable "Cómo es allá" de la guía. */
  function html(v) {
    const ds = destinos(v);
    if (!ds.length) return '';
    return `<div class="costumbres">${ds.map(d => destinoHTML(v, d, ds.length > 1)).join('')}</div>`;
  }

  async function pedir(v, d) {
    if (R.db.modo() !== 'nube' || !R.nube || !R.nube.auth().currentUser) throw new Error('Necesitás entrar con tu cuenta en la nube.');
    const token = await R.nube.auth().currentUser.getIdToken();
    const r = await fetch('/api/costumbres-destino', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ destino: { nombre: d.nombre, region: d.region, pais: d.pais } })
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || 'No pude traerlo ahora.');
    return datos;
  }

  function enlazar(cont, v) {
    cont.querySelectorAll('[data-costumbres]').forEach(b => b.onclick = async () => {
      const d = destinos(v).find(x => x.id === b.dataset.costumbres);
      if (!d) return;
      cargando.add(d.id);
      repintar(cont, v, d);
      try {
        const r = await pedir(v, d);
        const guardar = { datos: r.datos, fuentes: r.fuentes || [], creado: r.creado || new Date().toISOString() };
        if (R.db.puedeOrganizar(v)) {
          v.costumbres = Object.assign({}, v.costumbres, { [d.id]: guardar });
          R.db.guardarViaje(v);
        } else memoria[d.id] = guardar;
      } catch (e) {
        U.toast(e.message);
      } finally {
        cargando.delete(d.id);
        repintar(cont, v, d);
      }
    });
  }
  function repintar(cont, v, d) {
    const caja = cont.querySelector(`[data-cost-dest="${d.id}"]`);
    if (!caja) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = destinoHTML(v, d, destinos(v).length > 1);
    caja.replaceWith(tmp.firstElementChild);
    enlazar(cont, v);
  }

  return { html, enlazar, horaHTML, destinos };
})();
