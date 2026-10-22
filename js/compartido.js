/* =========================================================
   Rutenda — lo que compartís hacia Rutenda
   En el celular (Android), desde Gmail, WhatsApp o Archivos:
   Compartir → Rutenda. El PDF, la foto o el texto llegan acá
   y elegís a qué viaje va: se lee y completa el paso, o se
   guarda en Documentos.
   ========================================================= */
window.R = window.R || {};

R.compartido = (function () {
  const U = R.util;
  const { esc } = U;
  const CACHE = 'rutenda-compartido';

  async function leer() {
    if (!('caches' in window)) return { archivos: [], texto: '' };
    const c = await caches.open(CACHE);
    const archivos = [];
    let texto = '';
    for (const req of await c.keys()) {
      const r = await c.match(req);
      if (!r) continue;
      if (/\/texto$/.test(req.url)) texto = await r.text();
      else {
        const blob = await r.blob();
        archivos.push(new File([blob], decodeURIComponent(r.headers.get('X-Nombre') || 'archivo'), { type: blob.type }));
      }
    }
    await caches.delete(CACHE);
    return { archivos, texto };
  }

  async function recibir() {
    let llegado;
    try { llegado = await leer(); } catch (e) { llegado = { archivos: [], texto: '' }; }
    const { archivos, texto } = llegado;
    if (!archivos.length && !texto.trim()) { U.toast('No llegó nada para guardar.'); return; }
    const lista = R.cargar.viajesActivos();
    if (!lista.length) { U.toast('Primero armá el viaje y después compartí la reserva.'); return; }
    let elegido = R.cargar.predeterminado(lista) || lista[0].id;
    const puedeLeer = R.escaneo.disponible();
    const { el } = U.modal({ titulo: '📥 Llegó a Rutenda', cuerpo: '<div class="compartido"></div>' });
    const caja = el.querySelector('.compartido');
    const pintar = () => {
      caja.innerHTML = `
        <ul class="compartido-lista">
          ${archivos.map(f => `<li>${/pdf/i.test(f.type) ? '📄' : '🖼️'} ${esc(f.name)} <small>${U.fmtTamano ? U.fmtTamano(f.size) : ''}</small></li>`).join('')}
          ${texto.trim() ? `<li>📝 ${esc(texto.trim().slice(0, 120))}${texto.length > 120 ? '…' : ''}</li>` : ''}
        </ul>
        <p class="cargar-pregunta">¿A qué viaje va?</p>
        <div class="cargar-viajes">${lista.map(x => `
          <button type="button" class="cargar-viaje ${x.id === elegido ? 'activo' : ''}" data-viaje="${x.id}">
            <span class="punto" style="background:${R.paisaje.fondo(x)}"></span>
            <span class="cv-texto"><strong>${esc(x.nombre || x.destino || 'Viaje')}</strong><small>${x.fechaInicio ? U.fmtFecha(x.fechaInicio, 'dia') : 'Sin fecha'}</small></span>
          </button>`).join('')}</div>
        <div class="compartido-acciones">
          ${puedeLeer ? '<button type="button" class="btn btn-primario btn-bloque" data-a="leer">✨ Leer la reserva y completar el paso</button>' : ''}
          ${archivos.length ? `<button type="button" class="btn ${puedeLeer ? 'btn-suave' : 'btn-primario'} btn-bloque" data-a="guardar">📄 Solo guardar en Documentos</button>` : ''}
        </div>`;
      caja.querySelectorAll('[data-viaje]').forEach(b => b.onclick = () => { elegido = b.dataset.viaje; pintar(); });
      const bl = caja.querySelector('[data-a="leer"]');
      if (bl) bl.onclick = async () => {
        bl.disabled = true; bl.textContent = 'Leyendo… 🔎';
        const v = R.db.viaje(elegido);
        try {
          const archivo = archivos.find(f => /pdf/i.test(f.type)) || archivos[0] || null;
          const datos = archivo ? await R.escaneo.analizar(archivo) : await R.escaneo.analizarTexto(texto);
          const id = R.escaneo.elegirPaso(v, datos);
          U.cerrarModal();
          if (id) {
            const tarea = R.motor.lista(v).find(x => x.id === id);
            R.formularios.abrir(v, id, { prellenar: R.escaneo.aFormulario(tarea.base, datos), archivo, aviso: 'Completé lo que pude leer: revisalo antes de guardar.' });
          } else if (archivos.length) {
            await R.documentos.guardarArchivos(v, archivos, { categoria: 'otro' });
            R.db.guardarViaje(v);
            U.toast('No encontré a qué paso corresponde: lo guardé en Documentos.');
            location.hash = `#viaje/${v.id}/documentos`;
          } else U.toast('No encontré datos de una reserva en ese texto.');
        } catch (e) { U.toast(e.message || 'No pude leerlo.'); bl.disabled = false; bl.textContent = '✨ Leer la reserva y completar el paso'; }
      };
      const bg = caja.querySelector('[data-a="guardar"]');
      if (bg) bg.onclick = async () => {
        const v = R.db.viaje(elegido);
        bg.disabled = true;
        try {
          await R.documentos.guardarArchivos(v, archivos, { categoria: 'otro' });
          R.db.guardarViaje(v);
          U.cerrarModal();
          U.toast(archivos.length === 1 ? 'Guardado en Documentos.' : `${archivos.length} archivos guardados en Documentos.`);
          location.hash = `#viaje/${v.id}/documentos`;
        } catch (e) { bg.disabled = false; U.toast('No pude guardarlo.'); }
      };
    };
    pintar();
  }

  return { recibir, leer };
})();
