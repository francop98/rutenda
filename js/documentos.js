/* =========================================================
   Tripbox — pestaña Documentos
   Pasajes, reservas, seguros, identidad… guardados en el
   navegador (IndexedDB) y vinculados a pasos de la guía.
   ========================================================= */
window.R = window.R || {};

R.documentos = (function () {
  const U = R.util;
  const { esc } = U;
  const LIMITE_MB = 25;

  const CATEGORIAS = [
    { id: 'pasaje', nombre: 'Pasajes', icono: '🎫', tarea: 't_segmento' },
    { id: 'reserva', nombre: 'Reservas', icono: '🏡', tarea: 'a_reserva' },
    { id: 'identidad', nombre: 'Identidad y visas', icono: '🛂', tarea: 'doc_copias' },
    { id: 'seguro', nombre: 'Seguros', icono: '🛡️', tarea: 'p_seguro' },
    { id: 'salud', nombre: 'Salud', icono: '💉', tarea: 'p_vacunas' },
    { id: 'excursion', nombre: 'Excursiones y entradas', icono: '🎟️', tarea: 'e_excursiones' },
    { id: 'otro', nombre: 'Otros', icono: '📎', tarea: '' }
  ];

  let urlsVivas = [];

  function categoria(id) { return CATEGORIAS.find(c => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1]; }
  function esImagen(d) { return /^image\//.test(d.tipoMime || ''); }
  function esPDF(d) { return d.tipoMime === 'application/pdf' || /\.pdf$/i.test(d.nombreArchivo || ''); }
  function iconoDoc(d) { return esPDF(d) ? '📄' : esImagen(d) ? '🖼️' : categoria(d.categoria).icono; }

  let viajeActual = null;
  function render(v, cont) {
    viajeActual = v.id;
    urlsVivas.forEach(u => URL.revokeObjectURL(u));
    urlsVivas = [];
    const docs = v.documentos.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const grupos = CATEGORIAS.map(c => ({ c, docs: docs.filter(d => d.categoria === c.id) })).filter(g => g.docs.length);

    cont.innerHTML = `
      <div class="bloque-cab cab-seccion">
        <div>
          <h2 class="titulo-seccion">Documentos del viaje</h2>
          <p class="texto-suave">Todo a mano, en un solo lugar. ${R.db.modo() === 'nube' ? 'Se guardan en tu cuenta y quedan disponibles sin conexión una vez abiertos.' : 'Se guardan en este dispositivo.'}</p>
        </div>
        <div class="acciones-fila">
          ${R.escaneo && R.escaneo.disponible() ? '<button class="btn btn-suave" data-a="escanear" title="Leo la reserva y completo el paso de la guía">📷 Escanear reserva</button>' : ''}
          <button class="btn btn-primario" data-a="subir">+ Subir documento</button>
        </div>
      </div>
      ${grupos.length ? grupos.map(g => `
        <div class="bloque">
          <h3 class="bloque-titulo">${g.c.icono} ${esc(g.c.nombre)} <span class="contador">${g.docs.length}</span></h3>
          <div class="grilla-docs">${g.docs.map(d => tarjetaDoc(v, d)).join('')}</div>
        </div>`).join('') : `
        <div class="vacio">
          <div class="vacio-icono">📁</div>
          <h3>Todavía no hay documentos</h3>
          <p>Subí pasajes, reservas, seguro y copias de tu documentación. Así no dependés de buscar mails el día del viaje.</p>
          <button class="btn btn-primario" data-a="subir2">Subir el primero</button>
        </div>`}`;

    cont.querySelectorAll('[data-a="subir"],[data-a="subir2"]').forEach(b => b.onclick = () => subir(v));
    const esc1 = cont.querySelector('[data-a="escanear"]');
    if (esc1) esc1.onclick = () => R.escaneo.escanearYAbrir(v);
    cont.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => abrir(v.documentos.find(d => d.id === b.dataset.abrir)));
    cont.querySelectorAll('[data-descargar]').forEach(b => b.onclick = () => descargar(v.documentos.find(d => d.id === b.dataset.descargar)));
    cont.querySelectorAll('[data-borrar]').forEach(b => b.onclick = () => borrar(v, b.dataset.borrar));

    // Miniaturas de imágenes
    cont.querySelectorAll('[data-miniatura]').forEach(async img => {
      try {
        const blob = await R.db.obtenerArchivo(img.dataset.miniatura, v.id);
        if (!blob) {
          const url = R.db.modo() === 'nube' ? await R.nube.urlArchivo(v.id, img.dataset.miniatura) : null;
          if (url) { img.src = url; img.parentElement.classList.add('con-imagen'); }
          return;
        }
        const url = URL.createObjectURL(blob);
        urlsVivas.push(url);
        img.src = url;
        img.parentElement.classList.add('con-imagen');
      } catch (e) { /* sin miniatura */ }
    });
  }

  function tarjetaDoc(v, d) {
    const tarea = d.tareaId ? R.motor.nombre(v, d.tareaId) : '';
    return `
      <div class="doc">
        <button class="doc-vista" data-abrir="${d.id}" aria-label="Abrir ${esc(d.nombre)}">
          ${esImagen(d) ? `<img alt="" data-miniatura="${d.archivoId}">` : ''}
          <span class="doc-icono">${iconoDoc(d)}</span>
        </button>
        <div class="doc-info">
          <strong title="${esc(d.nombre)}">${esc(d.nombre)}</strong>
          <small>${U.fmtTamano(d.tamano)} · ${U.fmtFecha((d.fecha || '').slice(0, 10), 'corto')}</small>
          ${tarea ? `<small class="doc-tarea">🧭 ${esc(tarea)}</small>` : ''}
          ${d.nota ? `<small class="doc-nota">${esc(d.nota)}</small>` : ''}
        </div>
        <div class="doc-acciones">
          <button class="btn-icono" data-descargar="${d.id}" title="Descargar">⬇</button>
          <button class="btn-icono" data-borrar="${d.id}" title="Eliminar">🗑</button>
        </div>
      </div>`;
  }

  /**
   * Abre el formulario para subir. opciones: { tareaId, categoria, alTerminar }
   */
  function subir(v, opciones) {
    const op = opciones || {};
    const tareas = R.motor.lista(v);
    const catInicial = op.categoria || (op.tareaId ? (tareas.find(t => t.id === op.tareaId) || {}).docCategoria : '') || 'pasaje';

    const { el } = U.modal({
      titulo: 'Subir documento',
      cuerpo: `
        <label class="zona-archivo" id="zonaArchivo">
          <input type="file" id="dArchivo" multiple accept="image/*,application/pdf,.doc,.docx,.txt">
          <span class="za-icono">⬆</span>
          <span id="dArchivoTxt">Elegí uno o varios archivos (fotos o PDF)</span>
        </label>
        <label class="campo"><span>Nombre</span><input id="dNombre" placeholder="Se completa con el nombre del archivo"></label>
        <div class="grilla-2">
          <label class="campo"><span>Categoría</span><select id="dCategoria">${CATEGORIAS.map(c => `<option value="${c.id}" ${c.id === catInicial ? 'selected' : ''}>${c.icono} ${c.nombre}</option>`).join('')}</select></label>
          <label class="campo"><span>Paso de la guía</span><select id="dTarea"><option value="">Ninguno</option>${tareas.map(t => `<option value="${t.id}" ${t.id === op.tareaId ? 'selected' : ''}>${esc(t.titulo)}</option>`).join('')}</select></label>
        </div>
        <label class="campo"><span>Nota (opcional)</span><input id="dNota" placeholder="Ej: código de reserva ABC123"></label>
        <label class="check" id="dMarcarFila"><input type="checkbox" id="dMarcar" checked> Marcar ese paso como hecho</label>`,
      acciones: [
        { texto: 'Cancelar' },
        { texto: 'Guardar', clase: 'btn-primario', onClick: el2 => { guardarSubida(v, el2, op); return false; } }
      ]
    });

    const archivo = el.querySelector('#dArchivo');
    const selCat = el.querySelector('#dCategoria');
    const selTarea = el.querySelector('#dTarea');
    const filaMarcar = el.querySelector('#dMarcarFila');
    const actualizarMarcar = () => {
      const id = selTarea.value;
      filaMarcar.style.display = id && !R.motor.resuelta(v, id) ? '' : 'none';
    };
    archivo.onchange = () => {
      const n = archivo.files.length;
      el.querySelector('#dArchivoTxt').textContent = n === 1 ? archivo.files[0].name : n > 1 ? `${n} archivos elegidos` : 'Elegí uno o varios archivos (fotos o PDF)';
      el.querySelector('#zonaArchivo').classList.toggle('con-archivo', n > 0);
      const nombre = el.querySelector('#dNombre');
      if (n === 1 && !nombre.value) nombre.value = archivo.files[0].name.replace(/\.[^.]+$/, '');
      nombre.disabled = n > 1;
      if (n > 1) nombre.value = '';
    };
    selCat.onchange = () => {
      if (op.tareaId) return;
      const base = categoria(selCat.value).tarea;
      const sugerida = base ? (tareas.find(t => t.base === base && !R.motor.resuelta(v, t.id)) || tareas.find(t => t.base === base)) : null;
      if (sugerida) selTarea.value = sugerida.id;
      else selTarea.value = '';
      actualizarMarcar();
    };
    selTarea.onchange = actualizarMarcar;
    if (!op.tareaId) selCat.onchange();
    actualizarMarcar();
  }

  async function guardarSubida(v, el, op) {
    const archivos = Array.from(el.querySelector('#dArchivo').files);
    if (!archivos.length) { U.toast('Elegí al menos un archivo.'); return; }
    const pesado = archivos.find(a => a.size > LIMITE_MB * 1048576);
    if (pesado) { U.toast(`"${pesado.name}" supera ${LIMITE_MB} MB.`); return; }

    const nombreManual = el.querySelector('#dNombre').value.trim();
    const cat = el.querySelector('#dCategoria').value;
    const tareaId = el.querySelector('#dTarea').value;
    const nota = el.querySelector('#dNota').value.trim();
    const marcar = el.querySelector('#dMarcar').checked && el.querySelector('#dMarcarFila').style.display !== 'none';
    const boton = el.querySelector('.modal-pie .btn-primario');
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      await guardarArchivos(v, archivos, { categoria: cat, tareaId, nota, nombre: archivos.length === 1 ? nombreManual : '' });
      if (marcar && tareaId) R.motor.setEstado(v, tareaId, 'hecha');
      R.db.guardarViaje(v);
      U.cerrarModal();
      U.toast(archivos.length > 1 ? `${archivos.length} documentos guardados.` : 'Documento guardado.');
      R.app.refrescar();
      if (op.alTerminar) op.alTerminar();
    } catch (e) {
      console.error(e);
      boton.disabled = false;
      boton.textContent = 'Guardar';
      U.toast('No se pudo guardar el archivo en este navegador.');
    }
  }

  /** Guarda archivos en el dispositivo y los registra en el viaje. */
  async function guardarArchivos(v, archivos, op) {
    for (const a of archivos) {
      if (a.size > LIMITE_MB * 1048576) throw new Error(`"${a.name}" supera ${LIMITE_MB} MB.`);
      const archivoId = U.id('arc');
      await R.db.guardarArchivo(archivoId, a, v.id);
      v.documentos.push({
        id: U.id('doc'),
        nombre: op.nombre || a.name.replace(/\.[^.]+$/, ''),
        nombreArchivo: a.name,
        categoria: op.categoria || 'otro',
        tareaId: op.tareaId || '',
        nota: op.nota || '',
        archivoId,
        viajeId: v.id,
        tipoMime: a.type,
        tamano: a.size,
        fecha: new Date().toISOString()
      });
    }
  }

  async function blobDe(d, v) {
    const blob = await R.db.obtenerArchivo(d.archivoId, d.viajeId || (v && v.id) || viajeActual);
    if (!blob) throw new Error('No se encontró el archivo');
    return blob;
  }

  /** Si no se pudo traer el archivo, se abre directo desde la nube. */
  async function abrirDesdeNube(d, v) {
    const id = d.viajeId || (v && v.id) || viajeActual;
    const url = R.db.modo() === 'nube' && id ? await R.nube.urlArchivo(id, d.archivoId) : null;
    if (!url) return false;
    if (!window.open(url, '_blank')) location.href = url;
    return true;
  }

  async function abrir(d, v) {
    if (!d) return;
    try {
      const url = URL.createObjectURL(await blobDe(d, v));
      const w = window.open(url, '_blank');
      if (!w) descargarURL(url, d);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (!(await abrirDesdeNube(d, v))) U.toast('Este archivo no está guardado en este dispositivo.');
    }
  }

  function descargarURL(url, d) {
    const a = document.createElement('a');
    a.href = url;
    a.download = d.nombreArchivo || d.nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function descargar(d, v) {
    if (!d) return;
    try {
      const url = URL.createObjectURL(await blobDe(d, v));
      descargarURL(url, d);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      if (!(await abrirDesdeNube(d, v))) U.toast('Este archivo no está guardado en este dispositivo.');
    }
  }

  async function borrar(v, id) {
    const d = v.documentos.find(x => x.id === id);
    if (!d) return;
    const ok = await U.confirmar(`Se va a eliminar "${d.nombre}".`, { titulo: 'Eliminar documento', textoSi: 'Eliminar', peligro: true });
    if (!ok) return;
    try { await R.db.eliminarArchivo(d.archivoId, v.id); } catch (e) { /* ya no estaba */ }
    v.documentos = v.documentos.filter(x => x.id !== id);
    R.db.guardarViaje(v);
    R.app.refrescar();
    U.toast('Documento eliminado.');
  }

  return { CATEGORIAS, render, subir, abrir, descargar, iconoDoc, guardarArchivos };
})();
