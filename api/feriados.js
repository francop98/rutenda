/* =========================================================
   Feriados de Argentina de un año (datos públicos y gratuitos).
   Fuente principal: ArgentinaDatos (incluye los puentes turísticos).
   Si no responde: Nager.Date.
   GET /api/feriados?anio=2026 → [{ fecha, nombre, tipo }]
   Vercel guarda la respuesta un día para no consultar cada vez.
   ========================================================= */
async function json(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Rutenda/1.0 (organizador de viajes)' } });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

async function feriados(anio) {
  const a = await json(`https://api.argentinadatos.com/v1/feriados/${anio}`);
  if (Array.isArray(a) && a.length) {
    return a.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.fecha)).map(x => ({ fecha: x.fecha, nombre: String(x.nombre || 'Feriado').slice(0, 90), tipo: String(x.tipo || '') }));
  }
  const b = await json(`https://date.nager.at/api/v3/PublicHolidays/${anio}/AR`);
  if (Array.isArray(b) && b.length) {
    return b.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date)).map(x => ({ fecha: x.date, nombre: String(x.localName || x.name || 'Feriado').slice(0, 90), tipo: 'feriado' }));
  }
  return [];
}

module.exports = async (req, res) => {
  const anio = parseInt((req.query && req.query.anio) || '', 10);
  if (!(anio >= 2020 && anio <= 2100)) return res.status(400).json({ error: 'Año inválido.' });
  const lista = await feriados(anio);
  if (!lista.length) return res.status(502).json({ error: 'No pude traer los feriados ahora.' });
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json(lista.sort((x, y) => x.fecha.localeCompare(y.fecha)));
};

module.exports.feriados = feriados;
