// =========================================================
// Pesitos — exportar a Excel (CSV) y a PDF (resumen para imprimir o guardar)
// El CSV usa ";" y coma decimal: Excel en español lo abre directo, con acentos.
// =========================================================

import { esc, money, parseISO } from './formato.js';
import { catById } from './categorias.js';
import { nombreCuenta } from './cuentas.js';

const celda = (v) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const numero = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',');
const fecha = (iso) => iso.split('-').reverse().join('/');

/** Movimientos (gastos con _k 'e' e ingresos con _k 'i') a CSV. */
export function aCSV(s, items) {
  const cab = ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Monto (ARS)', 'Moneda original', 'Monto original', 'Cuenta o tarjeta', 'Cuotas', 'Etiquetas', 'Compartido con'];
  const filas = items.map((x) => {
    const e = x._k === 'e';
    const medio = x.cardId ? `Tarjeta ${(s.cards.find((c) => c.id === x.cardId) || {}).name || ''}` : x.accountId ? nombreCuenta(s, x.accountId) : '';
    const cat = e ? (x.splits && x.splits.length > 1 ? x.splits.map((p) => `${catById(p.category).label} ${numero(p.amount)}`).join(' + ') : catById(x.category).label) : (x.type === 'sueldo' ? 'Cobro del mes' : 'Ingreso extra');
    return [fecha(x.date), e ? 'Gasto' : 'Ingreso', x.note, cat, numero(e ? -x.amount : x.amount), x.currency || 'ARS', x.currency && x.currency !== 'ARS' ? numero(x.original) : '', medio, e ? (x.installments || 1) : '', (x.tags || []).join(' '), x.shared ? x.shared.with : ''];
  });
  return '﻿' + [cab, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
}

export function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function descargarCSV(s, items, base = 'pesitos-movimientos') {
  const hoy = new Date().toISOString().slice(0, 10);
  descargar(`${base}-${hoy}.csv`, aCSV(s, items), 'text/csv;charset=utf-8');
}

/** Arma un resumen imprimible y abre el diálogo de impresión ("Guardar como PDF"). */
export function imprimirResumen(titulo, html) {
  let zona = document.getElementById('print-area');
  if (!zona) { zona = document.createElement('div'); zona.id = 'print-area'; document.body.appendChild(zona); }
  zona.innerHTML = `<div class="print-head"><b>pe$itos</b><span>${esc(titulo)}</span><span>Generado el ${new Date().toLocaleDateString('es-AR')}</span></div>${html}
    <p class="print-pie">Resumen generado por Pesitos. Tus datos son privados y solo vos podés verlos.</p>`;
  document.body.classList.add('imprimiendo');
  const fin = () => { document.body.classList.remove('imprimiendo'); zona.innerHTML = ''; window.removeEventListener('afterprint', fin); };
  window.addEventListener('afterprint', fin);
  setTimeout(() => window.print(), 50);
}

/** Tabla de movimientos para el PDF. */
export function tablaMovimientos(s, items) {
  return `<table class="print-tabla"><thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Cuenta</th><th class="num">Monto</th></tr></thead><tbody>
    ${items.map((x) => `<tr><td>${parseISO(x.date).toLocaleDateString('es-AR')}</td><td>${esc(x.note)}${(x.tags || []).length ? ` <small>${x.tags.map((t) => '#' + esc(t)).join(' ')}</small>` : ''}</td><td>${x._k === 'e' ? esc(catById(x.category).label) : 'Ingreso'}</td><td>${esc(x.cardId ? `Tarjeta ${(s.cards.find((c) => c.id === x.cardId) || {}).name || ''}` : x.accountId ? nombreCuenta(s, x.accountId) : '')}</td><td class="num">${x._k === 'e' ? '−' : '+'}${money(x.amount)}</td></tr>`).join('')}
  </tbody></table>`;
}
