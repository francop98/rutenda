/* =========================================================
   Rutenda — recordatorios
   Solo lo que pediste: un pendiente con fecha y "Avisame ese
   día al celular". Nada automático.
   - En el inicio de la app aparece ese día.
   - En modo nube se guarda en tu perfil y el servidor lo manda
     como notificación a la mañana de ese día.
   ========================================================= */
window.R = window.R || {};

R.recordatorios = (function () {
  const U = R.util;
  const esc = s => U.esc(s);
  let suscripto = null;   // null: no sabemos todavía
  let firmaEnviada = '';

  /* ---------------------------------------------------------
     Qué avisar: los pendientes que pediste
     --------------------------------------------------------- */
  function delViaje(v) {
    const hoy = U.hoyISO();
    if (v.ejemplo) return [];
    const nombre = R.viajes ? R.viajes.nombreDe(v) : (v.nombre || 'tu viaje');
    return (v.pendientes || []).filter(p => p.aviso && p.fecha && !p.hecho && p.fecha >= hoy).map(p => ({
      id: `${v.id}_pend_${p.id}_${p.fecha}`, viajeId: v.id, fecha: p.fecha,
      titulo: `✅ ${p.texto}`, cuerpo: `Pendiente de ${nombre}`, url: `#viaje/${v.id}/pendientes`
    }));
  }

  function todos() {
    return R.db.viajes().flatMap(v => { try { return delViaje(v); } catch (e) { return []; } })
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  /* ---------------------------------------------------------
     En la app: avisos de hoy
     --------------------------------------------------------- */
  function descartados() { try { return JSON.parse(localStorage.getItem('rutenda_avisos_vistos') || '{}'); } catch (e) { return {}; } }
  function avisosHTML() {
    const hoy = U.hoyISO();
    const vistos = descartados();
    const lista = todos().filter(a => a.fecha === hoy && !vistos[a.id]);
    if (!lista.length) return '';
    return `<section class="avisos-hoy">${lista.slice(0, 4).map(a => `
      <div class="aviso-hoy">
        <a href="${a.url}"><strong>${esc(a.titulo)}</strong><small>${esc(a.cuerpo)}</small></a>
        <button class="btn-icono" data-aviso-visto="${esc(a.id)}" aria-label="Listo">×</button>
      </div>`).join('')}</section>`;
  }
  function enlazarAvisos(cont) {
    cont.querySelectorAll('[data-aviso-visto]').forEach(b => b.onclick = () => {
      const vistos = descartados();
      Object.keys(vistos).forEach(k => { if (!k.includes(U.hoyISO())) delete vistos[k]; });
      vistos[b.dataset.avisoVisto] = 1;
      try { localStorage.setItem('rutenda_avisos_vistos', JSON.stringify(vistos)); } catch (e) { /* nada */ }
      b.closest('.aviso-hoy').remove();
    });
  }

  /* ---------------------------------------------------------
     En el servidor: guardar la agenda (solo si cambió)
     --------------------------------------------------------- */
  let espera = null;
  function actualizar() {
    if (R.db.modo() !== 'nube') return;
    clearTimeout(espera);
    espera = setTimeout(() => {
      const agenda = todos().filter(a => a.fecha <= U.sumarDias(U.hoyISO(), 60)).slice(0, 80);
      const firma = JSON.stringify(agenda);
      if (firma === firmaEnviada) return;
      firmaEnviada = firma;
      R.nube.actualizarPerfil({
        recordatorios: agenda,
        zonaHoraria: (Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires'),
        recordatoriosActualizados: new Date().toISOString()
      }).catch(() => { firmaEnviada = ''; });
    }, 1500);
  }

  /* ---------------------------------------------------------
     Notificaciones push
     --------------------------------------------------------- */
  function soportado() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function claveLocal() { return 'rutenda_push_' + (R.db.uid() || ''); }

  /** 'no' | 'bloqueado' | 'activo' | 'disponible' */
  function estadoPush() {
    if (R.db.modo() !== 'nube' || !soportado()) return 'no';
    if (Notification.permission === 'denied') return 'bloqueado';
    let marcado = false;
    try { marcado = !!localStorage.getItem(claveLocal()); } catch (e) { /* nada */ }
    if (suscripto === false) marcado = false;
    return Notification.permission === 'granted' && marcado ? 'activo' : 'disponible';
  }

  function aUint8(base64) {
    const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
    const crudo = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(crudo, c => c.charCodeAt(0));
  }

  async function activarPush() {
    try {
      if (!soportado()) { U.toast('Este navegador no permite notificaciones. En iPhone, primero instalá la app.'); return false; }
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') { U.toast('Sin permiso no podemos avisarte. Podés habilitarlo en los ajustes del sitio.'); return false; }
      const cfg = await fetch('/api/config-push').then(r => r.ok ? r.json() : null).catch(() => null);
      if (!cfg || !cfg.clavePublica) { U.toast('Los recordatorios todavía no están configurados en el servidor.'); return false; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aUint8(cfg.clavePublica) });
      await R.nube.guardarSuscripcion(sub);
      try { localStorage.setItem(claveLocal(), '1'); } catch (e) { /* nada */ }
      suscripto = true;
      firmaEnviada = '';
      actualizar();
      return true;
    } catch (e) {
      console.error(e);
      U.toast('No se pudieron activar los recordatorios.');
      return false;
    }
  }

  async function desactivarPush() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await R.nube.borrarSuscripcion(sub).catch(() => {});
        await sub.unsubscribe();
      }
    } catch (e) { /* nada */ }
    try { localStorage.removeItem(claveLocal()); } catch (e) { /* nada */ }
    suscripto = false;
  }

  /** Revisa en segundo plano si este dispositivo sigue suscripto. */
  function revisar() {
    if (!soportado() || R.db.modo() !== 'nube') return;
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => {
      suscripto = !!sub && Notification.permission === 'granted';
      if (sub && suscripto) R.nube.guardarSuscripcion(sub).catch(() => {});
    }).catch(() => {});
  }

  return { delViaje, todos, avisosHTML, enlazarAvisos, actualizar, estadoPush, activarPush, desactivarPush, revisar };
})();
