/* =========================================================
   Rutenda — aeropuertos
   Sugiere los aeropuertos de una ciudad por cercanía
   (ej. Buenos Aires → AEP y EZE) y permite buscar por
   código, ciudad o nombre. Datos en aeropuertosdatos.js.
   ========================================================= */
window.R = window.R || {};

R.aeropuertos = (function () {
  const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  let lista = null;

  function datos() {
    if (!lista) {
      lista = (R.AEROPUERTOS_DATOS || []).map(a => ({
        iata: a[0], nombre: a[1], ciudad: a[2], pais: a[3], lat: a[4], lon: a[5], grande: !!a[6],
        clave: normal(`${a[0]} ${a[1]} ${a[2]}`)
      }));
    }
    return lista;
  }

  function distanciaKm(lat1, lon1, lat2, lon2) {
    const rad = x => x * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  /** Aeropuertos cerca de unas coordenadas (los grandes primero). */
  function cercanos(lat, lon, radioKm, pais) {
    if (lat == null || lon == null) return [];
    const radio = radioKm || 80;
    return datos()
      .map(a => Object.assign({ km: distanciaKm(lat, lon, a.lat, a.lon) }, a))
      .filter(a => a.km <= radio)
      // Primero los del mismo país (Puerto Iguazú → IGR antes que IGU), después cercanía y tamaño
      .sort((a, b) => (pais ? (a.pais !== pais) - (b.pais !== pais) : 0) || (a.km > 40) - (b.km > 40) || b.grande - a.grande || a.km - b.km)
      .slice(0, 4);
  }

  function buscar(texto, max) {
    const q = normal(texto);
    if (q.length < 2) return [];
    const exacto = datos().filter(a => normal(a.iata) === q);
    const resto = datos().filter(a => normal(a.iata) !== q && a.clave.includes(q)).sort((a, b) => b.grande - a.grande);
    return exacto.concat(resto).slice(0, max || 6);
  }

  function porCodigo(iata) { return datos().find(a => a.iata === String(iata || '').toUpperCase()) || null; }

  /**
   * Sugerencias para una ciudad escrita en un tramo: usa las coordenadas
   * del origen/destinos del viaje si coincide el nombre; si no, busca por texto.
   */
  function sugerencias(v, ciudad) {
    const n = normal(ciudad);
    if (!n) return [];
    const lugares = [v.origen || {}].concat(v.destinos || []);
    const lugar = lugares.find(l => l && l.nombre && normal(l.nombre) === n && l.lat != null);
    let r = lugar ? cercanos(lugar.lat, lugar.lon, 80, lugar.codigoPais) : [];
    if (lugar && !r.length) r = cercanos(lugar.lat, lugar.lon, 200, lugar.codigoPais).slice(0, 3);
    if (!r.length) r = datos().filter(a => normal(a.ciudad).includes(n)).sort((a, b) => b.grande - a.grande).slice(0, 4);
    return r;
  }

  return { cercanos, buscar, porCodigo, sugerencias, distanciaKm };
})();
