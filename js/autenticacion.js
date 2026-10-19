/* =========================================================
   Tripbox — cuenta de usuario
   Registro e ingreso con mail y contraseña.
   HOY: funciona localmente en este navegador (cuentas guardadas
   en localStorage, contraseña con hash SHA-256 + sal).
   DESPUÉS: se reemplaza el interior de este archivo por
   Firebase Auth (createUserWithEmailAndPassword, signIn…,
   sendPasswordResetEmail) sin tocar el resto de la app.
   ========================================================= */
window.R = window.R || {};

R.auth = (function () {
  const U = R.util;
  const { esc } = U;
  const CLAVE_USUARIOS = 'tripbox_usuarios';
  const CLAVE_SESION = 'tripbox_sesion';

  function leerUsuarios() {
    try { return JSON.parse(localStorage.getItem(CLAVE_USUARIOS)) || {}; } catch (e) { return {}; }
  }
  function guardarUsuarios(u) { localStorage.setItem(CLAVE_USUARIOS, JSON.stringify(u)); }
  function normalizarEmail(e) { return String(e || '').trim().toLowerCase(); }
  function emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

  async function hash(texto) {
    try {
      if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* sigue con el respaldo */ }
    let h = 5381;
    for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
    return 'x' + (h >>> 0).toString(16);
  }

  function usuarioActual() {
    const uid = localStorage.getItem(CLAVE_SESION);
    if (!uid) return null;
    const u = Object.values(leerUsuarios()).find(x => x.uid === uid);
    return u ? { uid: u.uid, nombre: u.nombre, apellido: u.apellido, email: u.email, nacionalidad: u.nacionalidad || 'AR', creado: u.creado } : null;
  }

  async function registrar({ nombre, apellido, email, clave, nacionalidad }) {
    email = normalizarEmail(email);
    if (!nombre || !nombre.trim()) throw new Error('Escribí tu nombre.');
    if (!emailValido(email)) throw new Error('El mail no parece válido.');
    if (!clave || clave.length < 6) throw new Error('La contraseña tiene que tener al menos 6 caracteres.');
    const usuarios = leerUsuarios();
    if (usuarios[email]) throw new Error('Ya existe una cuenta con ese mail. Probá ingresar.');
    const sal = U.id('sal');
    const u = {
      uid: U.id('usr'), nombre: nombre.trim(), apellido: (apellido || '').trim(), email, nacionalidad: nacionalidad || 'AR',
      sal, hash: await hash(sal + clave), creado: new Date().toISOString()
    };
    usuarios[email] = u;
    guardarUsuarios(usuarios);
    localStorage.setItem(CLAVE_SESION, u.uid);
    return usuarioActual();
  }

  async function ingresar(email, clave) {
    email = normalizarEmail(email);
    const u = leerUsuarios()[email];
    if (!u || u.hash !== await hash(u.sal + (clave || ''))) throw new Error('Mail o contraseña incorrectos.');
    localStorage.setItem(CLAVE_SESION, u.uid);
    return usuarioActual();
  }

  function salir() { localStorage.removeItem(CLAVE_SESION); }

  function actualizarPerfil({ nombre, apellido, nacionalidad }) {
    const actual = usuarioActual();
    if (!actual) return;
    const usuarios = leerUsuarios();
    const u = usuarios[actual.email];
    u.nombre = nombre.trim();
    u.apellido = (apellido || '').trim();
    if (nacionalidad) u.nacionalidad = nacionalidad;
    guardarUsuarios(usuarios);
  }

  async function cambiarClave(actualClave, nueva) {
    const actual = usuarioActual();
    const usuarios = leerUsuarios();
    const u = usuarios[actual.email];
    if (u.hash !== await hash(u.sal + actualClave)) throw new Error('La contraseña actual no es correcta.');
    if (!nueva || nueva.length < 6) throw new Error('La nueva contraseña tiene que tener al menos 6 caracteres.');
    u.sal = U.id('sal');
    u.hash = await hash(u.sal + nueva);
    guardarUsuarios(usuarios);
  }

  /* ---------- Pantalla de ingreso / registro ---------- */
  function renderPantalla(app, alEntrar) {
    let modo = Object.keys(leerUsuarios()).length ? 'ingresar' : 'registro';

    function pintar() {
      app.innerHTML = `
        <section class="acceso">
          <div class="acceso-arte">
            ${R.paisaje.svg(null, { transporte: 'avion', progreso: 0.65 })}
            <div class="acceso-marca">
              <span class="marca-logo grande" aria-hidden="true"></span>
              <h1>Tripbox</h1>
              <p>Tu viaje, paso a paso. Organizado, guardado y a salvo en un solo lugar.</p>
            </div>
          </div>
          <div class="acceso-tarjeta">
            <div class="segmentado acceso-tabs">
              <button type="button" data-modo="ingresar" class="${modo === 'ingresar' ? 'activo' : ''}">Ingresar</button>
              <button type="button" data-modo="registro" class="${modo === 'registro' ? 'activo' : ''}">Crear cuenta</button>
            </div>
            <form id="formAcceso" novalidate>
              ${modo === 'registro' ? `
                <h2>Creá tu cuenta</h2>
                <p class="texto-suave">Empezá a organizar tu próximo viaje.</p>
                <div class="grilla-2">
                  <label class="campo"><span>Nombre</span><input id="acNombre" autocomplete="given-name" required></label>
                  <label class="campo"><span>Apellido</span><input id="acApellido" autocomplete="family-name"></label>
                </div>` : `
                <h2>¡Hola de nuevo!</h2>
                <p class="texto-suave">Ingresá para seguir con tus viajes.</p>`}
              ${modo === 'registro' ? `<label class="campo"><span>Nacionalidad de tu documento</span><select id="acNac">${R.requisitos.NACIONALIDADES.map(([c, n]) => `<option value="${c}" ${c === 'AR' ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
              <label class="campo"><span>Mail</span><input id="acEmail" type="email" autocomplete="email" required></label>
              <label class="campo"><span>Contraseña</span><input id="acClave" type="password" autocomplete="${modo === 'registro' ? 'new-password' : 'current-password'}" required></label>
              ${modo === 'registro' ? `<label class="campo"><span>Repetí la contraseña</span><input id="acClave2" type="password" autocomplete="new-password" required></label>` : ''}
              <p class="acceso-error" id="acError" role="alert"></p>
              <button class="btn btn-primario btn-grande btn-bloque" type="submit">${modo === 'registro' ? 'Crear cuenta' : 'Ingresar'}</button>
              ${modo === 'ingresar' ? '<button type="button" class="btn btn-texto btn-bloque" data-a="olvide">¿Olvidaste tu contraseña?</button>' : ''}
            </form>
          </div>
        </section>`;

      app.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { modo = b.dataset.modo; pintar(); });
      const olvide = app.querySelector('[data-a="olvide"]');
      if (olvide) olvide.onclick = () => U.modal({
        titulo: 'Recuperar contraseña',
        cuerpo: '<p class="texto-suave">Por ahora las cuentas viven en este dispositivo, así que no se puede enviar un mail de recuperación. Cuando conectemos Tripbox con Firebase, desde acá vas a recibir el enlace para crear una contraseña nueva.</p>',
        acciones: [{ texto: 'Entendido', clase: 'btn-primario' }]
      });

      app.querySelector('#formAcceso').onsubmit = async e => {
        e.preventDefault();
        const val = id => { const x = app.querySelector('#' + id); return x ? x.value : ''; };
        const error = app.querySelector('#acError');
        const boton = app.querySelector('button[type="submit"]');
        error.textContent = '';
        boton.disabled = true;
        try {
          if (modo === 'registro') {
            if (val('acClave') !== val('acClave2')) throw new Error('Las contraseñas no coinciden.');
            await registrar({ nombre: val('acNombre'), apellido: val('acApellido'), email: val('acEmail'), clave: val('acClave'), nacionalidad: val('acNac') });
          } else {
            await ingresar(val('acEmail'), val('acClave'));
          }
          alEntrar();
        } catch (err) {
          error.textContent = err.message;
          boton.disabled = false;
        }
      };
    }
    pintar();
  }

  /* ---------- Mi cuenta ---------- */
  function abrirMiCuenta() {
    const u = usuarioActual();
    if (!u) return;
    U.modal({
      titulo: 'Mi cuenta',
      subtitulo: u.email,
      cuerpo: `
        <div class="grilla-2">
          <label class="campo"><span>Nombre</span><input id="mcNombre" value="${esc(u.nombre)}"></label>
          <label class="campo"><span>Apellido</span><input id="mcApellido" value="${esc(u.apellido)}"></label>
        </div>
        <label class="campo"><span>Nacionalidad de tu documento</span><select id="mcNac">${R.requisitos.NACIONALIDADES.map(([c, n]) => `<option value="${c}" ${c === u.nacionalidad ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <small class="ayuda">Con esto Tripbox sabe qué documentación y visas te piden en cada destino.</small></label>
        <details class="detalle-plegable">
          <summary>Cambiar contraseña</summary>
          <div class="grilla-2">
            <label class="campo"><span>Contraseña actual</span><input id="mcClave" type="password" autocomplete="current-password"></label>
            <label class="campo"><span>Nueva contraseña</span><input id="mcNueva" type="password" autocomplete="new-password"></label>
          </div>
        </details>
        ${R.app.puedeInstalar() ? '<button type="button" class="btn btn-suave btn-bloque" data-a="instalarApp">📲 Instalar Tripbox como app</button>' : ''}
        <p class="ayuda">Cuenta creada el ${U.fmtFecha(u.creado.slice(0, 10))}. Por ahora tus datos se guardan en este dispositivo.</p>`,
      alAbrir: el => { const b = el.querySelector('[data-a="instalarApp"]'); if (b) b.onclick = () => { U.cerrarModal(); R.app.instalar(); }; },
      acciones: [
        { texto: 'Cerrar sesión', clase: 'btn-texto peligro', onClick: () => { salir(); location.hash = '#inicio'; location.reload(); } },
        { texto: 'Cancelar' },
        {
          texto: 'Guardar', clase: 'btn-primario', onClick: el => {
            const nombre = el.querySelector('#mcNombre').value.trim();
            if (!nombre) { U.toast('El nombre no puede quedar vacío.'); return false; }
            actualizarPerfil({ nombre, apellido: el.querySelector('#mcApellido').value, nacionalidad: el.querySelector('#mcNac').value });
            const yo = R.db.yo();
            yo.nombre = nombre;
            R.db.guardarPersona(yo);
            const clave = el.querySelector('#mcClave').value, nueva = el.querySelector('#mcNueva').value;
            if (clave || nueva) {
              cambiarClave(clave, nueva)
                .then(() => U.toast('Datos y contraseña actualizados.'))
                .catch(err => U.toast(err.message));
            } else {
              U.toast('Datos actualizados.');
            }
            R.app.pintarUsuario();
            R.app.refrescar();
          }
        }
      ]
    });
  }

  return { usuarioActual, registrar, ingresar, salir, actualizarPerfil, renderPantalla, abrirMiCuenta };
})();
