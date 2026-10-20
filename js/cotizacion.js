/* =========================================================
   Rutenda — cotización del día
   - Pesos argentinos: DolarApi (dólar tarjeta, oficial y blue;
     euro, real, peso chileno y uruguayo).
   - Otras monedas: ExchangeRate-API (acceso abierto).
   Es una sugerencia: siempre se puede editar a mano.
   ========================================================= */
window.R = window.R || {};

R.cotizacion = (function () {
  const U = R.util;
  const CLAVE = 'tripbox_cotizaciones_v1';
  const DOLAR = { tarjeta: 'Dólar tarjeta', oficial: 'Dólar oficial', blue: 'Dólar blue' };
  const DOLARAPI = { EUR: 'eur', BRL: 'brl', CLP: 'clp', UYU: 'uyu' };

  function cache() { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; } }
  function guardar(c) { try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch (e) { /* nada */ } }
  async function json(url) { const r = await fetch(url); if (!r.ok) throw new Error('Sin respuesta'); return r.json(); }

  /**
   * Cuántas unidades de "base" vale 1 de "moneda".
   * Resuelve { valor, fuente, opciones: [{ id, nombre, valor }] } o null.
   */
  async function obtener(moneda, base) {
    if (!moneda || !base || moneda === base) return null;
    const k = `${moneda}>${base}>${U.hoyISO()}`;
    const c = cache();
    if (c[k]) return c[k];
    let r = null;
    try {
      if (base === 'ARS' && moneda === 'USD') {
        const tipos = Object.keys(DOLAR);
        const valores = await Promise.all(tipos.map(t => json(`https://dolarapi.com/v1/dolares/${t}`).catch(() => null)));
        const opciones = tipos.map((t, i) => valores[i] && valores[i].venta ? { id: t, nombre: DOLAR[t], valor: U.redondear(valores[i].venta) } : null).filter(Boolean);
        if (opciones.length) r = { valor: opciones[0].valor, fuente: 'DolarApi', opciones };
      } else if (base === 'ARS' && DOLARAPI[moneda]) {
        const d = await json(`https://dolarapi.com/v1/cotizaciones/${DOLARAPI[moneda]}`);
        if (d && d.venta) r = { valor: U.redondear(d.venta), fuente: 'DolarApi', opciones: [] };
      }
      if (!r) {
        const d = await json(`https://open.er-api.com/v6/latest/${moneda}`);
        if (d && d.rates && d.rates[base]) r = { valor: U.redondear(d.rates[base]), fuente: 'ExchangeRate-API', opciones: [] };
      }
    } catch (e) { r = null; }
    if (r) {
      const nuevo = {};
      Object.keys(c).filter(x => x.endsWith(U.hoyISO())).forEach(x => { nuevo[x] = c[x]; });
      nuevo[k] = r;
      guardar(nuevo);
    }
    return r;
  }

  /**
   * Conecta un campo de cotización: lo completa si está vacío y
   * muestra opciones (ej. dólar tarjeta / oficial / blue).
   */
  function enlazarCampo(input, ayuda, moneda, base) {
    if (!input) return;
    if (ayuda) ayuda.textContent = 'Buscando la cotización de hoy…';
    obtener(moneda, base).then(r => {
      if (!document.body.contains(input)) return;
      if (!r) { if (ayuda) ayuda.textContent = 'Sin cotización automática: cargala a mano.'; return; }
      if (!U.numero(input.value)) { input.value = r.valor; input.dispatchEvent(new Event('input', { bubbles: true })); }
      if (!ayuda) return;
      ayuda.innerHTML = r.opciones.length > 1
        ? `Hoy: ${r.opciones.map(o => `<button type="button" class="btn-texto-mini" data-cotiz="${o.valor}">${o.nombre} $${o.valor}</button>`).join(' · ')} <small>(${r.fuente})</small>`
        : `Cotización de hoy: ${r.valor} <small>(${r.fuente})</small>. Podés cambiarla.`;
      ayuda.querySelectorAll('[data-cotiz]').forEach(b => b.onclick = () => { input.value = b.dataset.cotiz; input.dispatchEvent(new Event('input', { bubbles: true })); });
    });
  }

  return { obtener, enlazarCampo };
})();
