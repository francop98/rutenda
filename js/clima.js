/* =========================================================
   Tripbox — clima del destino
   Open-Meteo (gratis, sin clave):
   - Si faltan 15 días o menos: pronóstico real.
   - Si falta más: cómo estuvo el clima esas mismas fechas el
     año pasado (sirve de referencia para armar la valija).
   Se guarda en caché un día para no repetir consultas.
   ========================================================= */
window.R = window.R || {};

R.clima = (function () {
  const U = R.util;
  const CLAVE = 'tripbox_clima_v1';
  const pendientes = {};

  const CODIGOS = [
    [0, '☀️', 'Despejado'], [2, '🌤️', 'Algo nublado'], [3, '☁️', 'Nublado'], [48, '🌫️', 'Niebla'],
    [57, '🌦️', 'Llovizna'], [67, '🌧️', 'Lluvia'], [77, '🌨️', 'Nieve'], [82, '🌧️', 'Chaparrones'],
    [86, '🌨️', 'Nevadas'], [99, '⛈️', 'Tormentas']
  ];
  function icono(codigo, lluvia) {
    if (codigo == null) return lluvia > 2 ? '🌧️' : lluvia > 0.3 ? '🌦️' : '🌤️';
    const c = CODIGOS.find(x => codigo <= x[0]) || CODIGOS[CODIGOS.length - 1];
    return c[1];
  }
  function descripcion(codigo) {
    if (codigo == null) return '';
    return (CODIGOS.find(x => codigo <= x[0]) || CODIGOS[CODIGOS.length - 1])[2];
  }

  function leerCache() { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; } }
  function guardarCache(c) { try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch (e) { /* sin espacio */ } }

  /** Devuelve lo que haya en caché (o null) sin pedir nada. */
  function enCache(lat, lon, desde, hasta) {
    const c = leerCache()[clave(lat, lon, desde, hasta)];
    return c && c.dia === U.hoyISO() ? c.datos : null;
  }
  function clave(lat, lon, desde, hasta) { return `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)},${desde},${hasta}`; }

  /**
   * Clima para un lugar y rango de fechas.
   * Resuelve { tipo: 'pronostico' | 'referencia', dias: [{ fecha, max, min, lluvia, codigo }] } o null.
   */
  async function obtener(lat, lon, desde, hasta) {
    if (lat == null || lon == null || !desde) return null;
    hasta = hasta || desde;
    const k = clave(lat, lon, desde, hasta);
    const cache = enCache(lat, lon, desde, hasta);
    if (cache) return cache;
    if (pendientes[k]) return pendientes[k];
    pendientes[k] = (async () => {
      try {
        const hoy = U.hoyISO();
        const faltan = U.diasEntre(hoy, desde);
        let datos;
        if (faltan >= 0 && U.diasEntre(hoy, hasta) <= 15) {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=auto&start_date=${desde}&end_date=${hasta}`;
          datos = convertir(await (await fetch(url)).json(), 'pronostico', 0);
        } else {
          // Mismas fechas del año pasado como referencia
          const a = U.sumarDias(desde, -364), b = U.sumarDias(hasta, -364);
          const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=auto&start_date=${a}&end_date=${b}`;
          datos = convertir(await (await fetch(url)).json(), 'referencia', 364);
        }
        if (datos && datos.dias.length) {
          const c = leerCache();
          c[k] = { dia: U.hoyISO(), datos };
          // No acumular demasiadas consultas viejas
          Object.keys(c).filter(x => c[x].dia !== U.hoyISO()).forEach(x => delete c[x]);
          guardarCache(c);
        }
        return datos;
      } catch (e) {
        return null;
      } finally {
        delete pendientes[k];
      }
    })();
    return pendientes[k];
  }

  function convertir(json, tipo, corrimiento) {
    const d = json && json.daily;
    if (!d || !d.time) return null;
    return {
      tipo,
      dias: d.time.map((f, i) => ({
        fecha: corrimiento ? U.sumarDias(f, corrimiento) : f,
        max: redondo(d.temperature_2m_max[i]), min: redondo(d.temperature_2m_min[i]),
        lluvia: d.precipitation_sum ? d.precipitation_sum[i] || 0 : 0,
        codigo: d.weather_code ? d.weather_code[i] : null
      }))
    };
  }
  const redondo = x => (x == null ? null : Math.round(x));

  /** Resumen de una estadía: { max, min, diasLluvia, tipo }. */
  function resumen(datos) {
    if (!datos || !datos.dias.length) return null;
    const maxs = datos.dias.map(d => d.max).filter(x => x != null), mins = datos.dias.map(d => d.min).filter(x => x != null);
    return {
      tipo: datos.tipo,
      max: maxs.length ? Math.max(...maxs) : null,
      min: mins.length ? Math.min(...mins) : null,
      diasLluvia: datos.dias.filter(d => d.lluvia >= 1).length,
      dias: datos.dias.length
    };
  }

  return { obtener, enCache, resumen, icono, descripcion };
})();
