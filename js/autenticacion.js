/* =========================================================
   Tripbox — cuenta de usuario
   Con Firebase configurado (js/firebaseconfig.js): cuentas
   reales con Firebase Auth (verificación de mail y recuperación
   de contraseña). Si no, funciona en modo local en este
   dispositivo (útil para probar sin conexión a la nube).
   ========================================================= */
window.R = window.R || {};

R.auth = (function () {
  const U = R.util;
  const { esc } = U;
  const CLAVE_USUARIOS = 'tripbox_usuarios';
  const CLAVE_SESION = 'tripbox_sesion';
  let actual = null;           // usuario actual { uid, nombre, apellido, email, nacionalidad, creado, verificado, local }
  let oyente = null;

  const enNube = () => !!(R.nube && R.nube.disponible());
  function normalizarEmail(e) { return String(e || '').trim().toLowerCase(); }
  function emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  function validarRegistro({ nombre, email, clave }) {
    if (!nombre || !nombre.trim()) throw new Error('Escribí tu nombre.');
    if (!emailValido(normalizarEmail(email))) throw new Error('El mail no parece válido.');
    if (!clave || clave.length < 6) throw new Error('La contraseña tiene que tener al menos 6 caracteres.');
  }

  /* ---------------------------------------------------------
     Modo local (sin Firebase)
     --------------------------------------------------------- */
  function leerUsuarios() { try { return JSON.parse(localStorage.getItem(CLAVE_USUARIOS)) || {}; } catch (e) { return {}; } }
  function guardarUsuarios(u) { localStorage.setItem(CLAVE_USUARIOS, JSON.stringify(u)); }
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
  function usuarioLocal() {
    const uid = localStorage.getItem(CLAVE_SESION);
    if (!uid) return null;
    const u = Object.values(leerUsuarios()).find(x => x.uid === uid);
    return u ? { uid: u.uid, nombre: u.nombre, apellido: u.apellido, email: u.email, nacionalidad: u.nacionalidad || 'AR', creado: u.creado, verificado: true, local: true } : null;
  }

  /* ---------------------------------------------------------
     Arranque
     --------------------------------------------------------- */
  /** Resuelve con el usuario (o null) cuando se sabe si hay sesión. */
  function iniciar() {
    if (!enNube()) { actual = usuarioLocal(); return Promise.resolve(actual); }
    const auth = R.nube.auth();
    return new Promise(resolver => {
      let primera = true;
      auth.onAuthStateChanged(async fu => {
        actual = fu ? await desdeFirebase(fu) : null;
        if (primera) { primera = false; resolver(actual); return; }
        if (oyente) oyente(actual);
      });
    });
  }
  function alCambiarUsuario(fn) { oyente = fn; }

  async function desdeFirebase(fu) {
    let perfil = {};
    try {
      const s = await R.nube.db().collection('usuarios').doc(fu.uid).get();
      perfil = s.exists ? s.data() : {};
    } catch (e) { /* sin conexión: se usa lo de Auth */ }
    const [nombre, ...resto] = (fu.displayName || '').split(' ');
    return {
      uid: fu.uid, email: fu.email, verificado: fu.emailVerified,
      nombre: perfil.nombre || nombre || (fu.email || '').split('@')[0],
      apellido: perfil.apellido != null ? perfil.apellido : resto.join(' '),
      nacionalidad: perfil.nacionalidad || 'AR',
      creado: perfil.creado || (fu.metadata && fu.metadata.creationTime ? new Date(fu.metadata.creationTime).toISOString() : new Date().toISOString())
    };
  }

  function usuarioActual() { return actual; }

  /* ---------------------------------------------------------
     Registro, ingreso, salida
     --------------------------------------------------------- */
  async function registrar(datos) {
    validarRegistro(datos);
    const email = normalizarEmail(datos.email);
    const nombre = datos.nombre.trim(), apellido = (datos.apellido || '').trim(), nacionalidad = datos.nacionalidad || 'AR';
    if (enNube()) {
      try {
        const cred = await R.nube.auth().createUserWithEmailAndPassword(email, datos.clave);
        await cred.user.updateProfile({ displayName: `${nombre} ${apellido}`.trim() });
        await R.nube.db().collection('usuarios').doc(cred.user.uid).set({ nombre, apellido, nacionalidad, email, creado: new Date().toISOString() }, { merge: true });
        try { await cred.user.sendEmailVerification(); } catch (e) { /* se puede reenviar después */ }
        actual = await desdeFirebase(cred.user);
        actual.nombre = nombre; actual.apellido = apellido; actual.nacionalidad = nacionalidad;
        return actual;
      } catch (e) { throw traducir(e); }
    }
    const usuarios = leerUsuarios();
    if (usuarios[email]) throw new Error('Ya existe una cuenta con ese mail. Probá ingresar.');
    const sal = U.id('sal');
    usuarios[email] = { uid: U.id('usr'), nombre, apellido, email, nacionalidad, sal, hash: await hash(sal + datos.clave), creado: new Date().toISOString() };
    guardarUsuarios(usuarios);
    localStorage.setItem(CLAVE_SESION, usuarios[email].uid);
    actual = usuarioLocal();
    return actual;
  }

  async function ingresar(email, clave) {
    email = normalizarEmail(email);
    if (enNube()) {
      try {
        const cred = await R.nube.auth().signInWithEmailAndPassword(email, clave || '');
        actual = await desdeFirebase(cred.user);
        return actual;
      } catch (e) { throw traducir(e); }
    }
    const u = leerUsuarios()[email];
    if (!u || u.hash !== await hash(u.sal + (clave || ''))) throw new Error('Mail o contraseña incorrectos.');
    localStorage.setItem(CLAVE_SESION, u.uid);
    actual = usuarioLocal();
    return actual;
  }

  async function salir() {
    if (enNube()) {
      try { await R.nube.enviarTodo(); } catch (e) { /* se sincroniza la próxima vez */ }
      R.nube.detener();
      await R.nube.auth().signOut();
    } else {
      localStorage.removeItem(CLAVE_SESION);
    }
    actual = null;
  }

  async function recuperarClave(email) {
    email = normalizarEmail(email);
    if (!emailValido(email)) throw new Error('Escribí el mail de tu cuenta.');
    if (!enNube()) throw new Error('La recuperación por mail funciona con la cuenta en la nube.');
    try { await R.nube.auth().sendPasswordResetEmail(email); } catch (e) { throw traducir(e); }
  }

  async function reenviarVerificacion() {
    const fu = enNube() ? R.nube.auth().currentUser : null;
    if (fu) await fu.sendEmailVerification();
  }
  async function revisarVerificacion() {
    const fu = enNube() ? R.nube.auth().currentUser : null;
    if (!fu) return true;
    await fu.reload();
    if (actual) actual.verificado = R.nube.auth().currentUser.emailVerified;
    return actual ? actual.verificado : false;
  }

  async function actualizarPerfil({ nombre, apellido, nacionalidad }) {
    if (!actual) return;
    actual.nombre = nombre.trim();
    actual.apellido = (apellido || '').trim();
    if (nacionalidad) actual.nacionalidad = nacionalidad;
    if (enNube()) {
      const fu = R.nube.auth().currentUser;
      if (fu) await fu.updateProfile({ displayName: `${actual.nombre} ${actual.apellido}`.trim() });
      await R.nube.actualizarPerfil({ nombre: actual.nombre, apellido: actual.apellido, nacionalidad: actual.nacionalidad });
      return;
    }
    const usuarios = leerUsuarios();
    const u = usuarios[actual.email];
    Object.assign(u, { nombre: actual.nombre, apellido: actual.apellido, nacionalidad: actual.nacionalidad });
    guardarUsuarios(usuarios);
  }

  async function cambiarClave(claveActual, nueva) {
    if (!nueva || nueva.length < 6) throw new Error('La nueva contraseña tiene que tener al menos 6 caracteres.');
    if (enNube()) {
      const fu = R.nube.auth().currentUser;
      try {
        const cred = firebase.auth.EmailAuthProvider.credential(fu.email, claveActual);
        await fu.reauthenticateWithCredential(cred);
        await fu.updatePassword(nueva);
      } catch (e) { throw traducir(e); }
      return;
    }
    const usuarios = leerUsuarios();
    const u = usuarios[actual.email];
    if (u.hash !== await hash(u.sal + claveActual)) throw new Error('La contraseña actual no es correcta.');
    u.sal = U.id('sal');
    u.hash = await hash(u.sal + nueva);
    guardarUsuarios(usuarios);
  }

  function traducir(e) {
    const c = (e && e.code) || '';
    const msj = {
      'auth/email-already-in-use': 'Ya existe una cuenta con ese mail. Probá ingresar.',
      'auth/invalid-email': 'El mail no parece válido.',
      'auth/weak-password': 'La contraseña tiene que tener al menos 6 caracteres.',
      'auth/user-not-found': 'Mail o contraseña incorrectos.',
      'auth/wrong-password': 'Mail o contraseña incorrectos.',
      'auth/invalid-credential': 'Mail o contraseña incorrectos.',
      'auth/invalid-login-credentials': 'Mail o contraseña incorrectos.',
      'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
      'auth/network-request-failed': 'No hay conexión. Revisá internet y probá de nuevo.',
      'auth/requires-recent-login': 'Por seguridad, volvé a ingresar y repetí el cambio.'
    }[c];
    return new Error(msj || (e && e.message) || 'Algo salió mal. Probá de nuevo.');
  }

  /* ---------------------------------------------------------
     Pantalla de ingreso / registro
     --------------------------------------------------------- */
  function renderPantalla(app, alEntrar) {
    let modo = /^#unirse\//.test(location.hash) ? 'registro' : enNube() || Object.keys(leerUsuarios()).length ? 'ingresar' : 'registro';
    const invitado = (location.hash || '').startsWith('#unirse/');

    function pintar() {
      app.innerHTML = `
        <section class="acceso">
          <div class="acceso-arte">
            ${R.paisaje.svg(null, { transporte: 'avion', progreso: 0.65 })}
            <div class="acceso-marca">
              <span class="marca-logo grande" aria-hidden="true"></span>
              <h1>Tripbox</h1>
              <p>${invitado ? 'Te invitaron a un viaje. Ingresá o creá tu cuenta para sumarte.' : 'Tu viaje, paso a paso. Organizado, guardado y a salvo en un solo lugar.'}</p>
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
                </div>
                <label class="campo"><span>Nacionalidad de tu documento</span><select id="acNac">${R.requisitos.NACIONALIDADES.map(([c, n]) => `<option value="${c}" ${c === 'AR' ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : `
                <h2>¡Hola de nuevo!</h2>
                <p class="texto-suave">Ingresá para seguir con tus viajes.</p>`}
              <label class="campo"><span>Mail</span><input id="acEmail" type="email" autocomplete="email" inputmode="email" required></label>
              <label class="campo"><span>Contraseña</span><input id="acClave" type="password" autocomplete="${modo === 'registro' ? 'new-password' : 'current-password'}" required></label>
              ${modo === 'registro' ? `<label class="campo"><span>Repetí la contraseña</span><input id="acClave2" type="password" autocomplete="new-password" required></label>` : ''}
              <p class="acceso-error" id="acError" role="alert"></p>
              <button class="btn btn-primario btn-grande btn-bloque" type="submit">${modo === 'registro' ? 'Crear cuenta' : 'Ingresar'}</button>
              ${modo === 'ingresar' ? '<button type="button" class="btn btn-texto btn-bloque" data-a="olvide">¿Olvidaste tu contraseña?</button>' : ''}
              ${!enNube() ? '<p class="ayuda acceso-local">Modo sin conexión a la nube: los datos quedan en este dispositivo.</p>' : ''}
            </form>
          </div>
        </section>`;

      app.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { modo = b.dataset.modo; pintar(); });
      const olvide = app.querySelector('[data-a="olvide"]');
      if (olvide) olvide.onclick = () => abrirRecuperar(app.querySelector('#acEmail').value);

      app.querySelector('#formAcceso').onsubmit = async e => {
        e.preventDefault();
        const val = id => { const x = app.querySelector('#' + id); return x ? x.value : ''; };
        const error = app.querySelector('#acError');
        const boton = app.querySelector('button[type="submit"]');
        error.textContent = '';
        boton.disabled = true;
        boton.textContent = modo === 'registro' ? 'Creando tu cuenta…' : 'Ingresando…';
        try {
          if (modo === 'registro') {
            if (val('acClave') !== val('acClave2')) throw new Error('Las contraseñas no coinciden.');
            await registrar({ nombre: val('acNombre'), apellido: val('acApellido'), email: val('acEmail'), clave: val('acClave'), nacionalidad: val('acNac') });
          } else {
            await ingresar(val('acEmail'), val('acClave'));
          }
          await alEntrar(actual);
        } catch (err) {
          error.textContent = err.message;
          boton.disabled = false;
          boton.textContent = modo === 'registro' ? 'Crear cuenta' : 'Ingresar';
        }
      };
    }
    pintar();
  }

  function abrirRecuperar(email) {
    if (!enNube()) {
      U.modal({ titulo: 'Recuperar contraseña', cuerpo: '<p class="texto-suave">En modo local las cuentas viven en este dispositivo, así que no se puede enviar un mail de recuperación.</p>', acciones: [{ texto: 'Entendido', clase: 'btn-primario' }] });
      return;
    }
    U.modal({
      titulo: 'Recuperar contraseña',
      subtitulo: 'Te mandamos un enlace para crear una nueva.',
      cuerpo: `<label class="campo"><span>Mail de tu cuenta</span><input id="rcEmail" type="email" value="${esc(email || '')}"></label>`,
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Enviar enlace', clase: 'btn-primario', onClick: el => {
            recuperarClave(el.querySelector('#rcEmail').value)
              .then(() => { U.cerrarModal(); U.toast('Listo: revisá tu mail (también la carpeta de spam).'); })
              .catch(err => U.toast(err.message));
            return false;
          }
        }
      ]
    });
  }

  /* ---------------------------------------------------------
     Mi cuenta
     --------------------------------------------------------- */
  function abrirMiCuenta() {
    const u = usuarioActual();
    if (!u) return;
    const push = R.recordatorios ? R.recordatorios.estadoPush() : 'no';
    U.modal({
      titulo: 'Mi cuenta',
      subtitulo: u.email,
      cuerpo: `
        ${enNube() && !u.verificado ? `<p class="aviso-suave">✉️ Todavía no confirmaste tu mail. <button type="button" class="btn-texto-mini" data-a="reenviar">Reenviar el mail</button></p>` : ''}
        <div class="grilla-2">
          <label class="campo"><span>Nombre</span><input id="mcNombre" value="${esc(u.nombre)}"></label>
          <label class="campo"><span>Apellido</span><input id="mcApellido" value="${esc(u.apellido)}"></label>
        </div>
        <label class="campo"><span>Nacionalidad de tu documento</span><select id="mcNac">${R.requisitos.NACIONALIDADES.map(([c, n]) => `<option value="${c}" ${c === u.nacionalidad ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <small class="ayuda">Con esto Tripbox sabe qué documentación y visas te piden en cada destino.</small></label>
        <div class="bloque-interno">
          <strong>🔔 Recordatorios</strong>
          <p class="texto-suave">${push === 'activo' ? 'Activados en este dispositivo.' : push === 'bloqueado' ? 'El navegador bloqueó las notificaciones: habilitalas en los ajustes del sitio.' : push === 'no' ? 'Este navegador no permite notificaciones (en iPhone, instalá la app primero).' : 'Te avisamos del check-in, lo que se acerca y el día a día del viaje.'}</p>
          ${push === 'disponible' ? '<button type="button" class="btn btn-suave btn-chico" data-a="push">Activar recordatorios</button>' : ''}
          ${push === 'activo' ? '<button type="button" class="btn btn-texto btn-chico" data-a="pushNo">Desactivar en este dispositivo</button>' : ''}
        </div>
        <details class="detalle-plegable">
          <summary>Cambiar contraseña</summary>
          <div class="grilla-2">
            <label class="campo"><span>Contraseña actual</span><input id="mcClave" type="password" autocomplete="current-password"></label>
            <label class="campo"><span>Nueva contraseña</span><input id="mcNueva" type="password" autocomplete="new-password"></label>
          </div>
        </details>
        ${R.app.puedeInstalar() ? '<button type="button" class="btn btn-suave btn-bloque" data-a="instalarApp">📲 Instalar Tripbox como app</button>' : ''}
        <p class="ayuda">Cuenta creada el ${U.fmtFecha(String(u.creado).slice(0, 10))}. ${enNube() ? 'Tus datos se guardan en la nube y se sincronizan en tus dispositivos.' : 'Modo local: tus datos se guardan en este dispositivo.'}</p>`,
      alAbrir: el => {
        const b = el.querySelector('[data-a="instalarApp"]');
        if (b) b.onclick = () => { U.cerrarModal(); R.app.instalar(); };
        const r = el.querySelector('[data-a="reenviar"]');
        if (r) r.onclick = () => reenviarVerificacion().then(() => U.toast('Te reenviamos el mail de confirmación.')).catch(() => U.toast('No se pudo reenviar. Probá en un rato.'));
        const p = el.querySelector('[data-a="push"]');
        if (p) p.onclick = () => R.recordatorios.activarPush().then(ok => { if (ok) { U.cerrarModal(); U.toast('¡Recordatorios activados! 🔔'); } });
        const pn = el.querySelector('[data-a="pushNo"]');
        if (pn) pn.onclick = () => R.recordatorios.desactivarPush().then(() => { U.cerrarModal(); U.toast('Recordatorios desactivados en este dispositivo.'); });
      },
      acciones: [
        { texto: 'Cerrar sesión', clase: 'btn-texto peligro', onClick: () => { salir().then(() => { location.hash = '#inicio'; location.reload(); }); return false; } },
        { texto: 'Cancelar' },
        {
          texto: 'Guardar', clase: 'btn-primario', onClick: el => {
            const nombre = el.querySelector('#mcNombre').value.trim();
            if (!nombre) { U.toast('El nombre no puede quedar vacío.'); return false; }
            actualizarPerfil({ nombre, apellido: el.querySelector('#mcApellido').value, nacionalidad: el.querySelector('#mcNac').value })
              .then(() => {
                R.db.guardarPersona(Object.assign(R.db.yo(), { nombre }));
                const clave = el.querySelector('#mcClave').value, nueva = el.querySelector('#mcNueva').value;
                if (clave || nueva) return cambiarClave(clave, nueva).then(() => U.toast('Datos y contraseña actualizados.'));
                U.toast('Datos actualizados.');
              })
              .catch(err => U.toast(err.message))
              .finally(() => { R.app.pintarUsuario(); R.app.refrescar(); });
          }
        }
      ]
    });
  }

  return {
    iniciar, alCambiarUsuario, usuarioActual, registrar, ingresar, salir, recuperarClave, reenviarVerificacion, revisarVerificacion,
    actualizarPerfil, cambiarClave, renderPantalla, abrirMiCuenta, enNube
  };
})();
