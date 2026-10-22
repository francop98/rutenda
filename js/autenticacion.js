/* =========================================================
   Rutenda — cuenta de usuario
   Con Firebase configurado (js/firebaseconfig.js): cuentas
   reales con Firebase Auth (verificación de mail y recuperación
   de contraseña). Si no, funciona en modo local en este
   dispositivo (útil para probar sin conexión a la nube).
   ========================================================= */
window.R = window.R || {};

R.auth = (function () {
  const U = R.util;
  const { esc } = U;
  const CLAVE_USUARIOS = 'rutenda_usuarios';
  const CLAVE_SESION = 'rutenda_sesion';
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
    return u ? { uid: u.uid, nombre: u.nombre, apellido: u.apellido, email: u.email, nacionalidad: u.nacionalidad || 'AR', alias: u.alias || '', creado: u.creado, verificado: true, local: true } : null;
  }

  /* ---------------------------------------------------------
     Arranque
     --------------------------------------------------------- */
  /** Resuelve con el usuario (o null) cuando se sabe si hay sesión. */
  function iniciar() {
    if (!enNube()) { actual = usuarioLocal(); return Promise.resolve(actual); }
    const auth = R.nube.auth();
    // Vuelta de "Ingresar con Google" por redirección
    let volvioDeGoogle = false;
    try { volvioDeGoogle = sessionStorage.getItem('rutenda_google') === '1'; sessionStorage.removeItem('rutenda_google'); } catch (e) { /* nada */ }
    if (volvioDeGoogle) auth.getRedirectResult().then(r => { if (r && r.user) perfilGoogle(r.user); }).catch(e => { errorPendiente = traducir(e).message; });
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
  let errorPendiente = '';
  // Ingresar con Google: se activa cuando esté habilitado en Firebase (Authentication → Google)
  const GOOGLE_ACTIVO = false;

  async function desdeFirebase(fu) {
    let perfil = {};
    try {
      const s = await R.nube.db().collection('usuarios').doc(fu.uid).get();
      perfil = s.exists ? s.data() : {};
    } catch (e) { /* sin conexión: se usa lo de Auth */ }
    const [nombre, ...resto] = (fu.displayName || '').split(' ');
    return {
      uid: fu.uid, email: fu.email, verificado: fu.emailVerified,
      conClave: (fu.providerData || []).some(p => p && p.providerId === 'password'),
      conGoogle: (fu.providerData || []).some(p => p && p.providerId === 'google.com'),
      nombre: perfil.nombre || nombre || (fu.email || '').split('@')[0],
      apellido: perfil.apellido != null ? perfil.apellido : resto.join(' '),
      nacionalidad: perfil.nacionalidad || 'AR',
      alias: perfil.alias || '',
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

  /* ---------- Recordarme ---------- */
  const CLAVE_RECORDAR = 'rutenda_recordar';
  function recordado() {
    try { const r = JSON.parse(localStorage.getItem(CLAVE_RECORDAR) || 'null'); return r || { si: true, email: '' }; } catch (e) { return { si: true, email: '' }; }
  }
  /** Guarda (o no) el mail y define si la sesión sigue abierta al cerrar el navegador. */
  async function recordarme(si, email) {
    try { localStorage.setItem(CLAVE_RECORDAR, JSON.stringify({ si, email: si ? normalizarEmail(email || '') : '' })); } catch (e) { /* sin almacenamiento */ }
    if (enNube()) {
      try {
        const P = firebase.auth.Auth && firebase.auth.Auth.Persistence;
        if (P) await R.nube.auth().setPersistence(si ? P.LOCAL : P.SESSION);
      } catch (e) { /* el navegador no lo permite: queda la sesión normal */ }
    }
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

  /* ---------- Ingresar con Google ---------- */
  /** Asegura que exista el perfil en la nube (la primera vez que entrás con Google). */
  async function perfilGoogle(fu) {
    const ref = R.nube.db().collection('usuarios').doc(fu.uid);
    try {
      const s = await ref.get();
      if (!s.exists) {
        const [nombre, ...resto] = (fu.displayName || '').split(' ');
        await ref.set({ nombre: nombre || (fu.email || '').split('@')[0], apellido: resto.join(' '), nacionalidad: 'AR', email: normalizarEmail(fu.email), creado: new Date().toISOString() }, { merge: true });
      }
    } catch (e) { /* se completa la próxima vez */ }
  }
  async function ingresarConGoogle() {
    if (!enNube()) throw new Error('Para entrar con Google, Rutenda tiene que estar conectado a la nube.');
    const proveedor = new firebase.auth.GoogleAuthProvider();
    proveedor.setCustomParameters({ prompt: 'select_account' });
    try {
      const cred = await R.nube.auth().signInWithPopup(proveedor);
      await perfilGoogle(cred.user);
      actual = await desdeFirebase(cred.user);
      return actual;
    } catch (e) {
      // Si el navegador no deja abrir la ventanita (por ejemplo, la app instalada), se va y vuelve
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e && e.code)) {
        try { sessionStorage.setItem('rutenda_google', '1'); } catch (x) { /* nada */ }
        await R.nube.auth().signInWithRedirect(proveedor);
        return null;
      }
      throw traducir(e);
    }
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

  async function actualizarPerfil({ nombre, apellido, nacionalidad, alias }) {
    if (!actual) return;
    actual.nombre = nombre.trim();
    actual.apellido = (apellido || '').trim();
    if (nacionalidad) actual.nacionalidad = nacionalidad;
    if (alias != null) actual.alias = String(alias).trim().slice(0, 60);
    if (enNube()) {
      const fu = R.nube.auth().currentUser;
      if (fu) await fu.updateProfile({ displayName: `${actual.nombre} ${actual.apellido}`.trim() });
      await R.nube.actualizarPerfil({ nombre: actual.nombre, apellido: actual.apellido, nacionalidad: actual.nacionalidad, alias: actual.alias || '' });
      return;
    }
    const usuarios = leerUsuarios();
    const u = usuarios[actual.email];
    Object.assign(u, { nombre: actual.nombre, apellido: actual.apellido, nacionalidad: actual.nacionalidad, alias: actual.alias || '' });
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
      'auth/requires-recent-login': 'Por seguridad, volvé a ingresar y repetí el cambio.',
      'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.',
      'auth/cancelled-popup-request': 'Cerraste la ventana de Google antes de terminar.',
      'auth/operation-not-allowed': 'El ingreso con Google todavía no está habilitado.',
      'auth/unauthorized-domain': 'Este sitio todavía no está autorizado para entrar con Google.',
      'auth/account-exists-with-different-credential': 'Ya tenés una cuenta con ese mail: ingresá con tu contraseña.'
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
              <h1>Rutenda</h1>
              <p>${invitado ? 'Te invitaron a un viaje. Ingresá o creá tu cuenta para sumarte.' : 'Tu viaje, paso a paso. Organizado, guardado y a salvo en un solo lugar.'}</p>
            </div>
          </div>
          <div class="acceso-tarjeta">
            <div class="segmentado acceso-tabs">
              <button type="button" data-modo="ingresar" class="${modo === 'ingresar' ? 'activo' : ''}">Ingresar</button>
              <button type="button" data-modo="registro" class="${modo === 'registro' ? 'activo' : ''}">Crear cuenta</button>
            </div>
            ${enNube() && GOOGLE_ACTIVO ? `
              <button type="button" class="btn btn-google btn-grande btn-bloque" data-a="google">
                <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
                Continuar con Google
              </button>
              <p class="acceso-o"><span>o con tu mail</span></p>` : ''}
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
              <label class="campo"><span>Mail</span><input id="acEmail" type="email" autocomplete="email" inputmode="email" value="${esc(recordado().email)}" required></label>
              ${U.campoClave('acClave', 'Contraseña', modo === 'registro' ? 'new-password' : 'current-password')}
              ${modo === 'registro' ? U.campoClave('acClave2', 'Repetí la contraseña', 'new-password') : ''}
              <label class="check recordarme"><input type="checkbox" id="acRecordar" ${recordado().si ? 'checked' : ''}> Recordarme en este dispositivo</label>
              <p class="acceso-error" id="acError" role="alert"></p>
              <button class="btn btn-primario btn-grande btn-bloque" type="submit">${modo === 'registro' ? 'Crear cuenta' : 'Ingresar'}</button>
              ${modo === 'ingresar' ? '<button type="button" class="btn btn-texto btn-bloque" data-a="olvide">¿Olvidaste tu contraseña?</button>' : ''}
              ${!enNube() ? '<p class="ayuda acceso-local">Modo sin conexión a la nube: los datos quedan en este dispositivo.</p>' : ''}
            </form>
          </div>
        </section>`;

      app.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { modo = b.dataset.modo; pintar(); });
      const bG = app.querySelector('[data-a="google"]');
      if (errorPendiente) { app.querySelector('#acError').textContent = errorPendiente; errorPendiente = ''; }
      if (bG) bG.onclick = async () => {
        const error = app.querySelector('#acError');
        error.textContent = '';
        bG.disabled = true;
        try {
          await recordarme(app.querySelector('#acRecordar').checked, recordado().email);
          const u = await ingresarConGoogle();
          if (u) await alEntrar(u);
        } catch (err) {
          error.textContent = err.message;
          bG.disabled = false;
        }
      };
      U.enlazarClaves(app);
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
          const recordar = app.querySelector('#acRecordar').checked;
          await recordarme(recordar, val('acEmail'));
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
          <small class="ayuda">Con esto Rutenda sabe qué documentación y visas te piden en cada destino.</small></label>
        <label class="campo"><span>Alias o CBU para cobrar <small>(opcional)</small></span><input id="mcAlias" value="${esc(u.alias || '')}" placeholder="Ej: mi.alias.mp" autocomplete="off">
          <small class="ayuda">Va en el mensaje cuando le pedís a alguien que te pague su parte.</small></label>
        <div class="bloque-interno">
          <strong>🔔 Recordatorios</strong>
          <p class="texto-suave">${push === 'activo' ? 'Activados en este dispositivo.' : push === 'bloqueado' ? 'El navegador bloqueó las notificaciones: habilitalas en los ajustes del sitio.' : push === 'no' ? 'Este navegador no permite notificaciones (en iPhone, instalá la app primero).' : 'Te avisamos del check-in, lo que se acerca y el día a día del viaje.'}</p>
          ${push === 'disponible' ? '<button type="button" class="btn btn-suave btn-chico" data-a="push">Activar recordatorios</button>' : ''}
          ${push === 'activo' ? '<button type="button" class="btn btn-texto btn-chico" data-a="pushNo">Desactivar en este dispositivo</button>' : ''}
        </div>
        ${u.conClave === false ? `<p class="ayuda">${u.conGoogle ? '🔐 Entrás con tu cuenta de Google.' : ''}</p>` : `<details class="detalle-plegable">
          <summary>Cambiar contraseña</summary>
          <div class="grilla-2">
            ${U.campoClave('mcClave', 'Contraseña actual', 'current-password')}
            ${U.campoClave('mcNueva', 'Nueva contraseña', 'new-password')}
          </div>
        </details>`}
        ${R.app.puedeInstalar() ? '<button type="button" class="btn btn-suave btn-bloque" data-a="instalarApp">📲 Instalar Rutenda como app</button>' : ''}
        <button type="button" class="btn btn-texto btn-bloque" data-a="verTour">🧭 Ver el tour de la app</button>
        <p class="ayuda version-app">Rutenda · versión ${R.VERSION}</p>
        <p class="ayuda">Cuenta creada el ${U.fmtFecha(String(u.creado).slice(0, 10))}. ${enNube() ? 'Tus datos se guardan en la nube y se sincronizan en tus dispositivos.' : 'Modo local: tus datos se guardan en este dispositivo.'}</p>`,
      alAbrir: el => {
        const bTour = el.querySelector('[data-a="verTour"]');
        if (bTour) bTour.onclick = () => { U.cerrarModal(); R.tour.iniciar(); };
        U.enlazarClaves(el);
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
            actualizarPerfil({ nombre, apellido: el.querySelector('#mcApellido').value, nacionalidad: el.querySelector('#mcNac').value, alias: el.querySelector('#mcAlias').value })
              .then(() => {
                R.db.guardarPersona(Object.assign(R.db.yo(), { nombre }));
                const vc = id => { const x = el.querySelector(id); return x ? x.value : ''; };
                const clave = vc('#mcClave'), nueva = vc('#mcNueva');
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
