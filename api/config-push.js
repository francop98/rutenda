/* Clave pública para suscribirse a los recordatorios (no es secreta). */
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({ clavePublica: process.env.VAPID_PUBLIC_KEY || '' });
};
