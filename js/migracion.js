/* =========================================================
   Rutenda — pasar los datos del dispositivo a la cuenta
   Si antes usaste Rutenda sin la nube, la primera vez que
   ingresás con tu cuenta te ofrece subir esos viajes (con sus
   archivos) para tenerlos en todos tus dispositivos.
   ========================================================= */
window.R = window.R || {};

R.migracion = (function () {
  const U = R.util;

  function claveHecho() { return 'rutenda_migrado_' + R.db.uid(); }

  /** Viajes guardados en este dispositivo en modo local (de cualquier cuenta local). */
  function encontrar() {
    const r = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(R.db.PREFIJO)) continue;
        const datos = JSON.parse(localStorage.getItem(k) || 'null');
        if (datos && Array.isArray(datos.viajes) && datos.viajes.length) r.push({ clave: k, uidLocal: k.slice(R.db.PREFIJO.length), datos });
      }
    } catch (e) { /* sin acceso */ }
    return r;
  }

  function ofrecer() {
    if (R.db.modo() !== 'nube') return;
    try { if (localStorage.getItem(claveHecho())) return; } catch (e) { return; }
    const grupos = encontrar();
    const total = grupos.reduce((a, g) => a + g.datos.viajes.length, 0);
    if (!total) return;
    setTimeout(() => {
      U.modal({
        titulo: 'Tus viajes de este dispositivo',
        subtitulo: `Encontramos ${U.plural(total, 'viaje guardado', 'viajes guardados')} acá desde antes de conectar tu cuenta.`,
        cuerpo: `<p class="texto-suave">¿Los pasamos a tu cuenta? Así quedan en la nube, con sus documentos, y los ves en todos tus dispositivos.</p>
          <ul class="lista-resumen">${grupos.flatMap(g => g.datos.viajes).slice(0, 8).map(v => `<li>${U.esc(v.nombre || v.destino || 'Viaje')}</li>`).join('')}</ul>`,
        acciones: [
          { texto: 'No, gracias', onClick: () => { marcar(); } },
          { texto: 'Pasarlos a mi cuenta', clase: 'btn-primario', onClick: el => { migrar(grupos, el); return false; } }
        ]
      });
    }, 600);
  }

  function marcar() { try { localStorage.setItem(claveHecho(), new Date().toISOString()); } catch (e) { /* nada */ } }

  async function migrar(grupos, el) {
    const boton = el.querySelector('.modal-pie .btn-primario');
    boton.disabled = true;
    boton.textContent = 'Pasando…';
    const nuevoYo = 'u_' + R.db.uid();
    let n = 0;
    try {
      for (const g of grupos) {
        for (const original of g.datos.viajes) {
          const v = JSON.parse(JSON.stringify(original));
          if (R.db.viaje(v.id)) continue;
          // Vos en el dispositivo → vos en la cuenta
          R.db.reemplazarId(v, 'u_' + g.uidLocal, nuevoYo);
          R.db.reemplazarId(v, 'yo', nuevoYo);
          Object.values(v.personas || {}).forEach(p => { if (p.id === nuevoYo) p.uid = R.db.uid(); else if (p.uid === g.uidLocal || p.uid === 'local') delete p.uid; });
          v.owner = R.db.uid(); v.miembros = [R.db.uid()]; v.roles = { [R.db.uid()]: 'organizador' };
          delete v.invitacion;
          R.db.guardarViaje(v);
          for (const d of v.documentos || []) {
            try {
              const blob = await R.db.archivoLocal.obtener(d.archivoId);
              if (blob) await R.nube.subirArchivo(v.id, d.archivoId, blob);
            } catch (e) { /* ese archivo queda solo en el dispositivo */ }
          }
          n++;
        }
        (g.datos.listasValija || []).forEach(l => { if (!R.db.listasValija().some(x => x.id === l.id)) R.db.guardarListaValija(l); });
      }
      await R.nube.enviarTodo();
      marcar();
      U.cerrarModal();
      U.toast(`Listo: ${U.plural(n, 'viaje pasó', 'viajes pasaron')} a tu cuenta. ☁️`);
      R.app.refrescar();
    } catch (e) {
      console.error(e);
      boton.disabled = false;
      boton.textContent = 'Reintentar';
      U.toast('No se pudo terminar. Revisá la conexión y reintentá.');
    }
  }

  return { ofrecer, encontrar };
})();
