/* =========================================================
   Rutenda — formularios de cada paso
   Cuando marcás un paso como listo, Rutenda te pide sus datos
   paso a paso (aerolínea, horarios, código, costo, quién pagó,
   archivos…) y con eso arma solo:
   - el itinerario (eventos con origen = id del paso)
   - el gasto (movimiento con origenTarea = id del paso)
   - los documentos vinculados al paso
   Volver a guardar el formulario reemplaza lo generado antes.
   ========================================================= */
window.R = window.R || {};

R.formularios = (function () {
  const U = R.util;
  const { esc } = U;

  const MODOS = {
    avion: { nombre: 'Avión', empresa: 'Aerolínea', numero: 'N° de vuelo', concepto: 'Vuelos' },
    micro: { nombre: 'Micro', empresa: 'Empresa', numero: 'N° de servicio', concepto: 'Pasajes de micro' },
    tren: { nombre: 'Tren', empresa: 'Empresa', numero: 'N° de servicio', concepto: 'Pasajes de tren' },
    barco: { nombre: 'Barco / ferry', empresa: 'Naviera', numero: 'N° de servicio', concepto: 'Barco / ferry' },
    auto: { nombre: 'Auto', empresa: 'Vehículo', numero: 'Patente', concepto: 'Viaje en auto' },
    otro: { nombre: 'Otro', empresa: 'Empresa', numero: 'N° / referencia', concepto: 'Transporte' }
  };

  const destinosAloj = v => (v.destinos || []).filter(d => !d.soloDia);
  const unir = (...partes) => partes.filter(Boolean).join(' · ');
  const conAero = (ciudad, codigo) => `${ciudad || '¿?'}${codigo ? ` (${codigo})` : ''}`;
  const fh = (f, h) => unir(f ? U.fmtFecha(f, 'corto') : '', h || '');

  /* ---------------------------------------------------------
     Definiciones por paso (clave = id base del paso)
     --------------------------------------------------------- */
  function camposTramo(modo) {
    const m = MODOS[modo] || MODOS.avion;
    return [
      { id: 'desde', tipo: 'texto', etiqueta: 'Desde', ancho: 'medio', rerender: modo === 'avion', extra: true },
      { id: 'hasta', tipo: 'texto', etiqueta: 'Hasta', ancho: 'medio', rerender: modo === 'avion', extra: true },
      { id: 'desdeAeropuerto', tipo: 'aeropuerto', etiqueta: 'Aeropuerto de salida', ciudadDe: 'desde', ancho: 'medio', si: () => modo === 'avion' },
      { id: 'hastaAeropuerto', tipo: 'aeropuerto', etiqueta: 'Aeropuerto de llegada', ciudadDe: 'hasta', ancho: 'medio', si: () => modo === 'avion' },
      ...(modo === 'avion' ? [
        { id: 'numero', tipo: 'texto', etiqueta: m.numero, ancho: 'medio', placeholder: 'Ej: AR1672', mayusculas: true },
        { id: 'empresa', tipo: 'texto', etiqueta: m.empresa, ancho: 'medio', sugerir: 'aerolinea' }
      ] : [
        { id: 'empresa', tipo: 'texto', etiqueta: m.empresa, ancho: 'completo', sugerir: 'empresa' }
      ]),
      { id: 'fechaSalida', tipo: 'fecha', etiqueta: 'Fecha de salida', ancho: 'medio' },
      { id: 'horaSalida', tipo: 'hora', etiqueta: 'Hora de salida', ancho: 'medio' },
      { id: 'horaLlegada', tipo: 'hora', etiqueta: 'Hora de llegada', ancho: 'medio' },
      { id: 'fechaLlegada', tipo: 'fecha', etiqueta: 'Fecha de llegada', ancho: 'medio', extra: true, ayuda: 'Solo si llegás otro día.' },
      { id: 'escalas', tipo: 'segmentado', etiqueta: '¿Directo o con escalas?', opciones: ['Directo', 'Con escalas'], extra: true },
      { id: 'escalaEn', tipo: 'texto', etiqueta: 'Escala en (y cuánto dura)', placeholder: 'Ej: Santiago, 2 h', si: (d, item) => item.escalas === 'Con escalas', extra: true },
      ...(modo === 'avion' ? [] : [{ id: 'numero', tipo: 'texto', etiqueta: m.numero, ancho: 'medio', extra: true }])
    ];
  }

  const transporte = {
    modo: (v, d, ctx) => (ctx && ctx.seg ? ctx.seg.medio : v.perfil.transporte) || 'avion',
    pasos: (v, d, ctx) => {
      const modo = transporte.modo(v, d, ctx);
      return [
        { titulo: 'El pasaje', campos: [
          { id: 'codigo', tipo: 'texto', etiqueta: 'Código de reserva', ancho: 'medio', mayusculas: true, si: () => modo === 'avion' },
          { id: 'tramos', tipo: 'lista', etiquetaItem: (it, i) => it.sentido || `Tramo ${i + 1}`, textoAgregar: modo === 'avion' ? '+ Otro vuelo (si tenés escala)' : '+ Otro pasaje', nuevo: () => ({ escalas: 'Directo' }), subcampos: camposTramo(modo) },
          { id: 'equipaje', tipo: 'segmentado', etiqueta: 'Equipaje incluido', opciones: ['Solo de mano', 'Mano + bodega', 'Sin definir'], si: () => modo === 'avion', extra: true },
          { id: 'codigo', tipo: 'texto', etiqueta: 'Código de reserva o boleto', ancho: 'medio', mayusculas: true, extra: true, si: () => modo !== 'avion' },
          { id: 'asientos', tipo: 'texto', etiqueta: 'Asientos', placeholder: 'Ej: 12A y 12B', ancho: 'medio', extra: true },
          { id: 'condiciones', tipo: 'textarea', etiqueta: 'Condiciones de cambio o cancelación', placeholder: 'Ej: cambio con cargo hasta 24 h antes', extra: true }
        ] }
      ];
    },
    inicial: (v, ctx) => {
      const c = ctx || {};
      const seg = c.seg || { desde: v.origen || {}, hasta: { nombre: v.destino } };
      return {
        equipaje: 'Sin definir',
        tramos: [{
          sentido: R.recorrido.TIPOS_TRAMO[c.tipo] || 'Tramo', desde: seg.desde.nombre || '', hasta: seg.hasta.nombre || '',
          fechaSalida: (seg.sale && seg.sale.fecha) || c.fecha || '', horaSalida: (seg.sale && seg.sale.hora) || '',
          fechaLlegada: (seg.llega && seg.llega.fecha) || '', horaLlegada: (seg.llega && seg.llega.hora) || '', escalas: 'Directo'
        }]
      };
    },
    costo: { categoria: 'transporte' },
    archivos: { categoria: 'pasaje', ayuda: 'Pasajes, e-tickets o la confirmación de la compra.' },
    concepto: (v, d, ctx) => {
      const seg = ctx && ctx.seg;
      if (!seg) return 'Transporte';
      return `${(MODOS[seg.medio] || MODOS.otro).concepto} ${seg.desde.nombre} → ${seg.hasta.nombre}`;
    },
    // No genera eventos: el cronograma muestra cada traslado con sus datos
    alGuardar: (v, d, ctx) => confirmarEnCronograma(v, d, ctx),
    resumen: (d) => (d.tramos || []).map(t => unir(t.sentido, `${conAero(t.desde, t.desdeAeropuerto)} → ${conAero(t.hasta, t.hastaAeropuerto)}`, unir(t.empresa, t.numero), fh(t.fechaSalida, t.horaSalida), t.escalas === 'Con escalas' ? 'con escala' + (t.escalaEn ? ' en ' + t.escalaEn : '') : 'directo'))
      .concat(d.codigo ? [`Código: ${d.codigo}`] : []).concat(d.equipaje && d.equipaje !== 'Sin definir' ? [`Equipaje: ${d.equipaje}`] : [])
  };

  /**
   * Con el pasaje cargado, el traslado queda "confirmado" con sus fechas y horas reales.
   * Si cambia la llegada, ofrece correr lo que sigue.
   */
  function confirmarEnCronograma(v, d, ctx) {
    const id = ctx && ctx.seg && ctx.seg.id;
    const x = R.recorrido.todosLosSegmentos(v.recorrido).find(z => z.seg.id === id);
    const tramos = (d.tramos || []).filter(t => t.fechaSalida);
    if (!x || !tramos.length) return;
    const s = x.seg;
    const primero = tramos[0], ultimo = tramos[tramos.length - 1];
    const llegadaAntes = R.recorrido.fechaLlega(s);
    s.sale = { fecha: primero.fechaSalida, hora: primero.horaSalida || '' };
    s.llega = { fecha: ultimo.fechaLlegada || (tramos.length === 1 ? primero.fechaSalida : ultimo.fechaSalida) || '', hora: ultimo.horaLlegada || '' };
    s.estado = 'confirmado';
    const llegadaNueva = R.recorrido.fechaLlega(s);
    R.recorrido.recalcular(v);
    const delta = llegadaAntes && llegadaNueva ? U.diasEntre(llegadaAntes, llegadaNueva) : 0;
    const siguientes = R.recorrido.todosLosSegmentos(v.recorrido);
    const hayDespues = siguientes.slice(siguientes.findIndex(z => z.seg.id === id) + 1).some(z => z.seg.sale.fecha);
    if (delta && hayDespues) {
      setTimeout(() => {
        U.confirmar(`Con este pasaje llegás ${Math.abs(delta) === 1 ? 'un día' : Math.abs(delta) + ' días'} ${delta > 0 ? 'después' : 'antes'} de lo que tenías en el cronograma. ¿Corro también lo que sigue para mantener las noches en cada lugar?`, {
          titulo: 'Cambió la llegada', textoSi: 'Sí, correr lo que sigue', textoNo: 'No, lo acomodo yo'
        }).then(ok => {
          if (!ok) return;
          R.recorrido.desplazarDesde(v, id, delta);
          R.db.guardarViaje(v);
          R.app.refrescar();
          U.toast('Listo: corrí el resto del cronograma.');
        });
      }, 400);
    }
  }

  const DEF = {
    t_segmento: transporte,

    a_reserva: {
      pasos: () => [
        { titulo: 'El lugar', campos: [
          { id: 'nombre', tipo: 'texto', etiqueta: 'Nombre del alojamiento *', requerido: true, sugerir: 'alojamiento' },
          { id: 'direccion', tipo: 'texto', etiqueta: 'Dirección', placeholder: 'Escribí el hotel o la calle y elegí de la lista', direccion: true, ayuda: 'Así Google Maps lo ubica exacto.' },
          { id: 'checkinFecha', tipo: 'fecha', etiqueta: 'Check-in', ancho: 'medio' },
          { id: 'checkoutFecha', tipo: 'fecha', etiqueta: 'Check-out', ancho: 'medio' },
          { id: 'codigo', tipo: 'texto', etiqueta: 'Código de reserva', ancho: 'medio' },
          { id: 'tipo', tipo: 'segmentado', etiqueta: 'Tipo', opciones: ['Hotel', 'Departamento', 'Casa', 'Cabaña', 'Hostel', 'Otro'], extra: true },
          { id: 'checkinHora', tipo: 'hora', etiqueta: 'Hora de check-in', ancho: 'medio', extra: true },
          { id: 'checkoutHora', tipo: 'hora', etiqueta: 'Hora de check-out', ancho: 'medio', extra: true },
          { id: 'contacto', tipo: 'texto', etiqueta: 'Teléfono o mail de contacto', extra: true },
          { id: 'cancelacionHasta', tipo: 'fecha', etiqueta: 'Cancelación gratis hasta', ancho: 'medio', ayuda: 'Te sirve si cambian los planes.', extra: true },
          { id: 'desayuno', tipo: 'check', etiqueta: 'Incluye desayuno', extra: true }
        ] }
      ],
      inicial: (v, ctx) => {
        const d = (ctx && ctx.destino) || {};
        return { tipo: 'Hotel', checkinFecha: d.desde || v.fechaInicio || '', checkoutFecha: d.hasta || v.fechaFin || '' };
      },
      costo: { categoria: 'alojamiento' },
      archivos: { categoria: 'reserva', ayuda: 'La confirmación o el voucher de la reserva.' },
      concepto: (v, d) => `Alojamiento: ${d.nombre || ''}`.trim(),
      // El check-in y el check-out los arma el itinerario con estos datos (así no se repiten)
      itinerario: () => [],
      resumen: d => [unir(d.nombre, d.tipo), d.direccion, unir(d.checkinFecha && 'Entrada ' + fh(d.checkinFecha, d.checkinHora), d.checkoutFecha && 'Salida ' + fh(d.checkoutFecha, d.checkoutHora)),
        d.codigo && `Código: ${d.codigo}`, d.cancelacionHasta && `Cancelación gratis hasta el ${U.fmtFecha(d.cancelacionHasta, 'corto')}`, d.desayuno && 'Con desayuno'].filter(Boolean)
    },

    p_seguro: {
      pasos: () => [{ titulo: 'La cobertura', campos: [
        { id: 'compania', tipo: 'texto', etiqueta: 'Compañía *', requerido: true, ancho: 'medio', sugerir: 'seguro' },
        { id: 'poliza', tipo: 'texto', etiqueta: 'N° de voucher o póliza', ancho: 'medio' },
        { id: 'telefono', tipo: 'texto', etiqueta: 'Teléfono de emergencias', placeholder: 'Ej: +54 11 …', ayuda: 'Queda a un toque en 🆘 Emergencias.' },
        { id: 'desde', tipo: 'fecha', etiqueta: 'Cubre desde', ancho: 'medio', extra: true },
        { id: 'hasta', tipo: 'fecha', etiqueta: 'Cubre hasta', ancho: 'medio', extra: true },
        { id: 'notas', tipo: 'textarea', etiqueta: 'Qué cubre / notas', extra: true }
      ] }],
      inicial: v => ({ desde: v.fechaInicio || '', hasta: v.fechaFin || '' }),
      costo: { categoria: 'seguros' },
      archivos: { categoria: 'seguro', ayuda: 'El voucher del seguro con el teléfono de asistencia.' },
      concepto: (v, d) => `Seguro: ${d.compania || ''}`.trim(),
      resumen: d => [unir(d.compania, d.poliza), d.telefono && `Emergencias: ${d.telefono}`, d.desde && `Del ${U.fmtFecha(d.desde, 'corto')} al ${U.fmtFecha(d.hasta, 'corto')}`].filter(Boolean)
    },

    mv_auto: {
      pasos: () => [
        { titulo: 'El alquiler', campos: [
          { id: 'rentadora', tipo: 'texto', etiqueta: 'Rentadora *', requerido: true, ancho: 'medio', sugerir: 'rentadora' },
          { id: 'codigo', tipo: 'texto', etiqueta: 'Código de reserva', ancho: 'medio' },
          { id: 'vehiculo', tipo: 'texto', etiqueta: 'Categoría o modelo', ancho: 'medio', extra: true },
          { id: 'seguro', tipo: 'check', etiqueta: 'Seguro incluido', extra: true }
        ] },
        { titulo: 'Retiro y devolución', campos: [
          { id: 'retiroLugar', tipo: 'texto', etiqueta: 'Lugar de retiro', placeholder: 'Ej: aeropuerto', direccion: true },
          { id: 'retiroFecha', tipo: 'fecha', etiqueta: 'Fecha de retiro', ancho: 'medio' },
          { id: 'retiroHora', tipo: 'hora', etiqueta: 'Hora de retiro', ancho: 'medio' },
          { id: 'devolucionLugar', tipo: 'texto', etiqueta: 'Lugar de devolución', extra: true, direccion: true, ayuda: 'Si es distinto del retiro.' },
          { id: 'devolucionFecha', tipo: 'fecha', etiqueta: 'Fecha de devolución', ancho: 'medio' },
          { id: 'devolucionHora', tipo: 'hora', etiqueta: 'Hora de devolución', ancho: 'medio' }
        ] }
      ],
      inicial: v => ({ retiroFecha: v.fechaInicio || '', devolucionFecha: v.fechaFin || '' }),
      costo: { categoria: 'transporte' },
      archivos: { categoria: 'reserva', ayuda: 'La reserva del auto.' },
      concepto: (v, d) => `Alquiler de auto: ${d.rentadora || ''}`.trim(),
      itinerario: (v, d) => [
        d.retiroFecha && { fecha: d.retiroFecha, hora: d.retiroHora || '', tipo: 'traslado', titulo: `Retiro del auto · ${d.rentadora || ''}`, lugar: d.retiroLugar || '', confirmacion: d.codigo || '' },
        d.devolucionFecha && { fecha: d.devolucionFecha, hora: d.devolucionHora || '', tipo: 'traslado', titulo: `Devolución del auto · ${d.rentadora || ''}`, lugar: d.devolucionLugar || '' }
      ].filter(Boolean),
      resumen: d => [unir(d.rentadora, d.vehiculo), d.retiroFecha && `Retiro ${fh(d.retiroFecha, d.retiroHora)} ${d.retiroLugar ? 'en ' + d.retiroLugar : ''}`, d.devolucionFecha && `Devolución ${fh(d.devolucionFecha, d.devolucionHora)}`, d.codigo && `Código: ${d.codigo}`].filter(Boolean)
    },

    mv_traslado: {
      pasos: () => [{ titulo: 'Los traslados', intro: 'Por ejemplo: del aeropuerto al alojamiento y, al volver, del alojamiento al aeropuerto.', campos: [
        { id: 'traslados', tipo: 'lista', etiquetaItem: (it, i) => it.nombre || `Traslado ${i + 1}`, textoAgregar: '+ Agregar traslado', nuevo: () => ({ tipo: 'Transfer' }), subcampos: [
          { id: 'tipo', tipo: 'segmentado', etiqueta: 'Cómo', opciones: ['Transfer', 'Taxi / app', 'Transporte público', 'Me buscan'] },
          { id: 'desde', tipo: 'texto', etiqueta: 'Desde', ancho: 'medio' },
          { id: 'hasta', tipo: 'texto', etiqueta: 'Hasta', ancho: 'medio' },
          { id: 'fecha', tipo: 'fecha', etiqueta: 'Fecha', ancho: 'medio' },
          { id: 'hora', tipo: 'hora', etiqueta: 'Hora', ancho: 'medio' },
          { id: 'detalle', tipo: 'texto', etiqueta: 'Empresa o contacto' }
        ] }
      ] }],
      inicial: v => ({ traslados: [
        { nombre: 'Llegada', tipo: 'Transfer', desde: 'Aeropuerto / terminal', hasta: 'Alojamiento', fecha: v.fechaInicio || '' },
        { nombre: 'Regreso', tipo: 'Transfer', desde: 'Alojamiento', hasta: 'Aeropuerto / terminal', fecha: v.fechaFin || '' }
      ] }),
      costo: { categoria: 'transporte' },
      archivos: { categoria: 'reserva' },
      concepto: () => 'Traslados',
      itinerario: (v, d) => (d.traslados || []).filter(t => t.fecha).map(t => ({ fecha: t.fecha, hora: t.hora || '', tipo: 'traslado', titulo: `${t.tipo || 'Traslado'}: ${t.desde || '¿?'} → ${t.hasta || '¿?'}`, lugar: t.desde || '', notas: t.detalle || '' })),
      resumen: d => (d.traslados || []).map(t => unir(t.tipo, `${t.desde || '¿?'} → ${t.hasta || '¿?'}`, fh(t.fecha, t.hora)))
    },

    e_excursiones: {
      pasos: () => [{ titulo: 'Las reservas', campos: [
        { id: 'excursiones', tipo: 'lista', etiquetaItem: (it, i) => it.nombre || `Reserva ${i + 1}`, textoAgregar: '+ Agregar otra', nuevo: () => ({}), subcampos: [
          { id: 'nombre', tipo: 'texto', etiqueta: 'Excursión, entrada o actividad' },
          { id: 'fecha', tipo: 'fecha', etiqueta: 'Fecha', ancho: 'medio' },
          { id: 'hora', tipo: 'hora', etiqueta: 'Hora', ancho: 'medio' },
          { id: 'encuentro', tipo: 'texto', etiqueta: 'Punto de encuentro', ancho: 'medio' },
          { id: 'codigo', tipo: 'texto', etiqueta: 'Empresa / código', ancho: 'medio' }
        ] }
      ] }],
      inicial: () => ({ excursiones: [{}] }),
      costo: { categoria: 'actividades', etiqueta: 'Costo total de las reservas' },
      archivos: { categoria: 'excursion', ayuda: 'Entradas, vouchers o confirmaciones.' },
      concepto: () => 'Excursiones y entradas',
      itinerario: (v, d) => (d.excursiones || []).filter(x => x.nombre && x.fecha).map(x => ({ fecha: x.fecha, hora: x.hora || '', tipo: 'actividad', titulo: x.nombre, lugar: x.encuentro || '', confirmacion: x.codigo || '' })),
      resumen: d => (d.excursiones || []).filter(x => x.nombre).map(x => unir(x.nombre, fh(x.fecha, x.hora)))
    },

    e_escapada: {
      pasos: () => [{ titulo: 'La escapada', campos: [
        { id: 'como', tipo: 'texto', etiqueta: '¿Cómo vas?', placeholder: 'Ej: excursión con agencia, remis, auto propio' },
        { id: 'fecha', tipo: 'fecha', etiqueta: 'Día', ancho: 'medio' },
        { id: 'horaSalida', tipo: 'hora', etiqueta: 'Salida', ancho: 'medio' },
        { id: 'horaRegreso', tipo: 'hora', etiqueta: 'Regreso', ancho: 'medio' },
        { id: 'documentacion', tipo: 'texto', etiqueta: 'Documentación para el cruce', placeholder: 'Ej: DNI de todos' },
        { id: 'notas', tipo: 'textarea', etiqueta: 'Notas' }
      ] }],
      inicial: (v, ctx) => ({ fecha: (ctx && ctx.destino && ctx.destino.fecha) || '' }),
      costo: { categoria: 'actividades' },
      archivos: { categoria: 'excursion' },
      concepto: (v, d, ctx) => `Escapada a ${ctx && ctx.destino ? ctx.destino.nombre : ''}`.trim(),
      itinerario: (v, d, ctx) => d.fecha ? [{ fecha: d.fecha, hora: d.horaSalida || '', tipo: 'actividad', titulo: `Escapada a ${ctx && ctx.destino ? ctx.destino.nombre : ''}`, notas: unir(d.como, d.horaRegreso && 'Regreso ' + d.horaRegreso, d.documentacion) }] : [],
      resumen: d => [d.como, d.fecha && fh(d.fecha, d.horaSalida) + (d.horaRegreso ? ' a ' + d.horaRegreso : ''), d.documentacion].filter(Boolean)
    },

    c_datos: {
      pasos: () => [{ titulo: 'Internet en destino', campos: [
        { id: 'tipo', tipo: 'segmentado', etiqueta: 'Tipo', opciones: ['eSIM', 'Roaming', 'Chip local'] },
        { id: 'proveedor', tipo: 'texto', etiqueta: 'Proveedor', ancho: 'medio' },
        { id: 'plan', tipo: 'texto', etiqueta: 'Plan / datos', placeholder: 'Ej: 10 GB, 15 días', ancho: 'medio' },
        { id: 'activar', tipo: 'fecha', etiqueta: 'Activar el', ancho: 'medio' }
      ] }],
      inicial: v => ({ tipo: 'eSIM', activar: v.fechaInicio || '' }),
      costo: { categoria: 'otros' },
      concepto: (v, d) => `Internet: ${unir(d.tipo, d.proveedor)}`,
      resumen: d => [unir(d.tipo, d.proveedor, d.plan), d.activar && `Activar el ${U.fmtFecha(d.activar, 'corto')}`].filter(Boolean)
    },

    doc_visa: {
      pasos: () => [{ titulo: 'El trámite', campos: [
        { id: 'estadoVisa', tipo: 'segmentado', etiqueta: '¿Cómo está?', opciones: ['No hace falta', 'En trámite', 'Aprobada'] },
        { id: 'tipo', tipo: 'texto', etiqueta: 'Tipo de visa o permiso', ancho: 'medio', si: d => d.estadoVisa !== 'No hace falta' },
        { id: 'tramite', tipo: 'texto', etiqueta: 'N° de trámite', ancho: 'medio', si: d => d.estadoVisa !== 'No hace falta' },
        { id: 'turno', tipo: 'fecha', etiqueta: 'Turno', ancho: 'medio', si: d => d.estadoVisa === 'En trámite' },
        { id: 'vence', tipo: 'fecha', etiqueta: 'Vence', ancho: 'medio', si: d => d.estadoVisa === 'Aprobada' }
      ] }],
      inicial: () => ({ estadoVisa: 'En trámite' }),
      costo: { categoria: 'otros', si: d => d.estadoVisa !== 'No hace falta' },
      archivos: { categoria: 'identidad' },
      concepto: () => 'Visa / permiso de ingreso',
      resumen: d => [d.estadoVisa, unir(d.tipo, d.tramite), d.turno && `Turno: ${U.fmtFecha(d.turno)}`, d.vence && `Vence: ${U.fmtFecha(d.vence)}`].filter(Boolean),
      alGuardar: (v, d, ctx, id) => { if (d.estadoVisa === 'No hace falta') v.tareas[id].estado = 'no_aplica'; if (d.estadoVisa === 'En trámite') v.tareas[id].estado = 'en_curso'; }
    },

    s_mascotas: {
      pasos: () => [{ titulo: 'Quién las cuida', campos: [
        { id: 'quien', tipo: 'texto', etiqueta: 'Quién las cuida *', requerido: true, ancho: 'medio' },
        { id: 'contacto', tipo: 'texto', etiqueta: 'Contacto', ancho: 'medio' },
        { id: 'notas', tipo: 'textarea', etiqueta: 'Indicaciones (comida, veterinario…)' }
      ] }],
      costo: { categoria: 'otros' },
      concepto: () => 'Cuidado de mascotas',
      resumen: d => [unir(d.quien, d.contacto)].filter(Boolean)
    },

    x_mascota_viaja: {
      pasos: () => [{ titulo: 'Documentación de la mascota', campos: [
        { id: 'certificado', tipo: 'fecha', etiqueta: 'Certificado veterinario emitido el', ancho: 'medio' },
        { id: 'transportadora', tipo: 'check', etiqueta: 'Transportadora lista y aprobada' },
        { id: 'notas', tipo: 'textarea', etiqueta: 'Notas' }
      ] }],
      costo: { categoria: 'otros' },
      archivos: { categoria: 'salud' },
      concepto: () => 'Documentación de la mascota',
      resumen: d => [d.certificado && `Certificado del ${U.fmtFecha(d.certificado)}`, d.transportadora && 'Transportadora lista'].filter(Boolean)
    },

    x_equipo: {
      pasos: () => [{ titulo: 'Equipo y clases', campos: [
        { id: 'detalle', tipo: 'texto', etiqueta: 'Qué reservaste', placeholder: 'Ej: equipo de ski 4 días + 2 clases' },
        { id: 'lugar', tipo: 'texto', etiqueta: 'Dónde', ancho: 'medio' },
        { id: 'fecha', tipo: 'fecha', etiqueta: 'Desde', ancho: 'medio' }
      ] }],
      costo: { categoria: 'actividades' },
      archivos: { categoria: 'excursion' },
      concepto: (v, d) => d.detalle || 'Equipo y clases',
      resumen: d => [d.detalle, unir(d.lugar, d.fecha && U.fmtFecha(d.fecha, 'corto'))].filter(Boolean)
    },

    x_evento: {
      pasos: () => [{ titulo: 'El momento especial', campos: [
        { id: 'detalle', tipo: 'texto', etiqueta: 'Qué es', placeholder: 'Ej: cena de aniversario' },
        { id: 'fecha', tipo: 'fecha', etiqueta: 'Fecha', ancho: 'medio' },
        { id: 'hora', tipo: 'hora', etiqueta: 'Hora', ancho: 'medio' },
        { id: 'lugar', tipo: 'texto', etiqueta: 'Lugar' }
      ] }],
      costo: { categoria: 'actividades' },
      concepto: (v, d) => d.detalle || 'Momento especial',
      itinerario: (v, d) => d.fecha ? [{ fecha: d.fecha, hora: d.hora || '', tipo: 'actividad', titulo: d.detalle || 'Momento especial', lugar: d.lugar || '' }] : [],
      resumen: d => [d.detalle, fh(d.fecha, d.hora), d.lugar].filter(Boolean)
    },

    doc_copias: {
      pasos: () => [],
      archivos: { categoria: 'identidad', ayuda: 'Fotos o PDF de documentos, pasajes y reservas.' },
      resumen: () => []
    },

    pq_paquete: {
      pasos: () => [
        { titulo: 'El paquete', campos: [
          { id: 'agencia', tipo: 'texto', etiqueta: 'Agencia u operador *', requerido: true, ancho: 'medio' },
          { id: 'codigo', tipo: 'texto', etiqueta: 'N° de reserva / file', ancho: 'medio' },
          { id: 'contacto', tipo: 'texto', etiqueta: 'Contacto de la agencia' },
          { id: 'incluye', tipo: 'checks', etiqueta: '¿Qué incluye?', opciones: [
            { v: 'vuelos', t: 'Vuelos / pasajes' }, { v: 'alojamiento', t: 'Alojamiento' }, { v: 'traslados', t: 'Traslados' },
            { v: 'excursiones', t: 'Excursiones' }, { v: 'seguro', t: 'Seguro de viaje' }, { v: 'auto', t: 'Alquiler de auto' }] }
        ] },
        { titulo: 'Detalles', campos: [{ id: 'notas', tipo: 'textarea', etiqueta: 'Notas (régimen de comidas, condiciones, pagos pendientes…)' }] }
      ],
      inicial: v => ({ incluye: (v.perfil.paquete && v.perfil.paquete.incluye) || ['vuelos', 'alojamiento'] }),
      costo: { categoria: 'paquete', etiqueta: 'Costo total del paquete' },
      archivos: { categoria: 'reserva', ayuda: 'Vouchers y confirmación de la agencia.' },
      concepto: (v, d) => `Paquete: ${d.agencia || ''}`.trim(),
      resumen: d => [unir(d.agencia, d.codigo), (d.incluye || []).length ? 'Incluye: ' + d.incluye.join(', ') : '', d.contacto].filter(Boolean),
      alGuardar: (v, d) => {
        v.perfil.paquete = { incluye: d.incluye || [] };
        aplicarPaquete(v);
      },
      // Después del paquete, completar uno por uno los datos de lo que incluye
      despues: v => completarPaquete(v)
    }
  };

  const BASES_PAQUETE = {
    vuelos: ['t_segmento'], alojamiento: ['a_reserva'], traslados: ['mv_traslado'],
    excursiones: ['e_excursiones'], seguro: ['p_seguro'], auto: ['mv_auto']
  };

  /**
   * Marca lo que cubre el paquete. Lo que tiene datos para cargar (vuelos,
   * alojamiento, seguro…) queda "en marcha" hasta que completes sus datos;
   * lo demás queda resuelto.
   */
  function aplicarPaquete(v) {
    const incluye = (v.perfil.paquete && v.perfil.paquete.incluye) || [];
    const lista = R.motor.lista(v);
    const esVuelo = id => { const t = lista.find(x => x.id === id); return !t || !t.ctx || !t.ctx.seg || t.ctx.seg.medio === 'avion'; };
    incluye.forEach(k => (BASES_PAQUETE[k] || []).forEach(base => R.motor.idsDe(v, base).filter(id => k !== 'vuelos' || esVuelo(id)).forEach(id => {
      const previo = v.tareas[id] || {};
      if (previo.estado === 'hecha' && !previo.incluidoEnPaquete) return;
      if (previo.estado === 'hecha' && previo.datos) return;
      const t = lista.find(x => x.id === id);
      const conDatos = t && tiene(t);
      v.tareas[id] = conDatos
        ? Object.assign({}, previo, { estado: 'en_curso', incluidoEnPaquete: true, postergado: false })
        : Object.assign({}, previo, { estado: 'hecha', incluidoEnPaquete: true, fechaHecha: previo.fechaHecha || new Date().toISOString() });
    })));
  }

  /** Lo del paquete que todavía espera sus datos, en el orden del viaje. */
  function faltantesPaquete(v) {
    const orden = ['t_segmento', 'a_reserva', 'mv_traslado', 'mv_auto', 'e_excursiones', 'p_seguro'];
    return R.motor.lista(v).filter(t => {
      const x = v.tareas[t.id] || {};
      return x.incluidoEnPaquete && x.estado === 'en_curso' && !x.datos && tiene(t);
    }).sort((a, b) => orden.indexOf(a.base) - orden.indexOf(b.base));
  }

  /** Abre, uno detrás de otro, los formularios de lo que incluye el paquete. */
  function completarPaquete(v, hechos) {
    const actual = R.db.viaje(v.id) || v;
    const faltan = faltantesPaquete(actual);
    if (!faltan.length) return;
    const n = hechos || 0;
    abrir(actual, faltan[0].id, {
      cadena: { actual: n + 1, total: n + faltan.length, texto: 'Datos del paquete' },
      alTerminar: () => setTimeout(() => completarPaquete(actual, n + 1), 450)
    });
  }

  /** ¿Este paso queda cubierto por lo que incluye el paquete? */
  function incluidoEnPaquete(t, incluye) {
    return (incluye || []).some(k => (BASES_PAQUETE[k] || []).includes(t.base) && (k !== 'vuelos' || !t.ctx || !t.ctx.seg || t.ctx.seg.medio === 'avion'));
  }

  function def(t) {
    if (!t) return null;
    // El viaje en auto propio no tiene pasaje que cargar
    if ((t.base || t.id) === 't_segmento' && t.ctx && t.ctx.seg && t.ctx.seg.medio === 'auto') return null;
    return DEF[t.base || t.id];
  }
  function tiene(t) { return !!def(t); }

  /* ---------------------------------------------------------
     Lo que ya usaste antes (para sugerirlo al escribir)
     --------------------------------------------------------- */
  const CONOCIDOS = {
    seguro: ['Assist Card', 'Universal Assistance', 'Coris', 'Travel Ace', 'Assist 365', 'Intermac', 'Allianz Travel'],
    rentadora: ['Localiza', 'Hertz', 'Avis', 'Budget', 'Europcar', 'Sixt', 'Alamo', 'Enterprise']
  };
  function recordados(tipo) {
    const set = new Map();
    const sumar = x => { const t = String(x || '').trim(); if (t.length > 1 && !set.has(t.toLowerCase())) set.set(t.toLowerCase(), t); };
    (R.db.viajes() || []).forEach(v => Object.values(v.tareas || {}).forEach(t => {
      const d = t && t.datos; if (!d) return;
      if ((tipo === 'aerolinea' || tipo === 'empresa') && Array.isArray(d.tramos)) d.tramos.forEach(x => sumar(x.empresa));
      if (tipo === 'alojamiento' && d.checkinFecha !== undefined) sumar(d.nombre);
      if (tipo === 'seguro') sumar(d.compania);
      if (tipo === 'rentadora') sumar(d.rentadora);
    }));
    if (tipo === 'aerolinea' && R.lector) Object.values(R.lector.AEROLINEAS).forEach(sumar);
    (CONOCIDOS[tipo] || []).forEach(sumar);
    return U.ordenAlfa(Array.from(set.values()), x => x);
  }
  /** "AR1672" → "Aerolíneas Argentinas" */
  function aerolineaDe(numero) {
    const m = String(numero || '').toUpperCase().replace(/\s/g, '').match(/^([A-Z0-9]{2})\d{1,4}$/);
    return m && R.lector ? R.lector.AEROLINEAS[m[1]] || '' : '';
  }

  /* ---------- Ida y vuelta en la misma reserva ---------- */
  const normal = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const parecido = (a, b) => !!(a && b && (normal(a).includes(normal(b)) || normal(b).includes(normal(a))));
  function aeroDe(v, ciudad) { return R.aeropuertos ? R.aeropuertos.sugerencias(v, ciudad).map(a => a.iata) : []; }
  /** ¿Este tramo es del traslado seg? (por ciudad o por aeropuerto) */
  function tramoEs(v, tr, seg) {
    if (!seg || !seg.desde || !seg.hasta) return false;
    const desde = parecido(tr.desde, seg.desde.nombre) || (tr.desdeAeropuerto && aeroDe(v, seg.desde.nombre).includes(tr.desdeAeropuerto));
    const hasta = parecido(tr.hasta, seg.hasta.nombre) || (tr.hastaAeropuerto && aeroDe(v, seg.hasta.nombre).includes(tr.hastaAeropuerto));
    return !!(desde || hasta) && !(parecido(tr.desde, seg.hasta.nombre) && !hasta);
  }
  /** Si en la reserva vienen tramos de otro traslado (la vuelta), los carga en ese paso. Devuelve los pasos completados. */
  function repartirTramos(v, tareaId, datos, ctx) {
    if (!ctx || !ctx.seg || !Array.isArray(datos.tramos) || datos.tramos.length < 2) return [];
    const otros = R.motor.lista(v).filter(x => x.base === 't_segmento' && x.id !== tareaId && x.ctx && x.ctx.seg && x.ctx.seg.medio === ctx.seg.medio);
    const hechos = [];
    otros.forEach(o => {
      const suyos = datos.tramos.filter(tr => !tramoEs(v, tr, ctx.seg) && tramoEs(v, tr, o.ctx.seg));
      if (!suyos.length) return;
      datos.tramos = datos.tramos.filter(tr => !suyos.includes(tr));
      const previo = (v.tareas[o.id] || {}).datos;
      if (previo && (previo.tramos || []).some(x => x.numero || x.empresa) && !previo.mismaReservaQue) return;
      const d2 = { codigo: datos.codigo || '', equipaje: datos.equipaje, asientos: '', mismaReservaQue: tareaId, tramos: suyos.map(x => Object.assign({}, x, { sentido: R.recorrido.TIPOS_TRAMO[o.ctx.tipo] || 'Tramo' })), costo: { monto: '' } };
      v.tareas[o.id] = Object.assign({}, v.tareas[o.id], { estado: 'hecha', datos: d2, sinDatosOk: false });
      R.motor.setEstado(v, o.id, 'hecha');
      confirmarEnCronograma(v, d2, o.ctx);
      hechos.push(o);
    });
    return hechos;
  }
  /** El otro pasaje del ida y vuelta (mismo medio, camino inverso; o la ida ↔ la vuelta). */
  function contraparte(v, tareaId, ctx) {
    if (!ctx || !ctx.seg) return null;
    const otros = R.motor.lista(v).filter(x => x.base === 't_segmento' && x.id !== tareaId && x.ctx && x.ctx.seg && x.ctx.seg.medio === ctx.seg.medio);
    const s = ctx.seg;
    return otros.find(o => parecido(o.ctx.seg.desde.nombre, s.hasta.nombre) && parecido(o.ctx.seg.hasta.nombre, s.desde.nombre))
      || (ctx.tipo === 'ida' ? otros.find(o => o.ctx.tipo === 'vuelta') : ctx.tipo === 'vuelta' ? otros.find(o => o.ctx.tipo === 'ida') : null) || null;
  }

  /** Para el botón "Es la misma reserva que la ida": otro traslado igual ya cargado. */
  function idaCargada(v, tareaId, ctx) {
    if (!ctx || !ctx.seg) return null;
    return R.motor.lista(v).find(x => x.base === 't_segmento' && x.id !== tareaId && x.ctx && x.ctx.seg && x.ctx.seg.medio === ctx.seg.medio
      && ((v.tareas[x.id] || {}).datos || {}).codigo && !((v.tareas[x.id] || {}).datos || {}).mismaReservaQue) || null;
  }

  /* ---------------------------------------------------------
     Motor de formularios
     --------------------------------------------------------- */
  function normalizarOpciones(ops) { return (ops || []).map(o => typeof o === 'string' ? { v: o, t: o } : o); }

  function campoHTML(c, valor, item, clave) {
    const attrs = `data-campo="${c.id}"${clave != null ? ` data-lista="${clave.lista}" data-item="${clave.i}"` : ''}`;
    const ancho = c.ancho === 'medio' ? 'medio' : 'completo';
    const v = valor == null ? '' : valor;
    const ayuda = c.ayuda ? `<small class="ayuda">${esc(c.ayuda)}</small>` : '';
    switch (c.tipo) {
      case 'textarea':
        return `<label class="campo ${ancho}"><span>${esc(c.etiqueta)}</span><textarea ${attrs} rows="2" placeholder="${esc(c.placeholder || '')}">${esc(v)}</textarea>${ayuda}</label>`;
      case 'check':
        return `<label class="check ${ancho}"><input type="checkbox" ${attrs} ${v ? 'checked' : ''}> ${esc(c.etiqueta)}</label>`;
      case 'checks': {
        const sel = Array.isArray(v) ? v : [];
        return `<div class="campo ${ancho}"><span>${esc(c.etiqueta)}</span><div class="checks-grilla">${normalizarOpciones(c.opciones).map(o =>
          `<label class="chip-check ${sel.includes(o.v) ? 'activo' : ''}"><input type="checkbox" ${attrs} data-valor="${esc(o.v)}" ${sel.includes(o.v) ? 'checked' : ''}> ${esc(o.t)}</label>`).join('')}</div></div>`;
      }
      case 'segmentado':
        return `<div class="campo ${ancho}"><span>${esc(c.etiqueta)}</span><input type="hidden" ${attrs} value="${esc(v)}">
          <div class="segmentado segmentado-chico" data-seg="${c.id}">${normalizarOpciones(c.opciones).map(o =>
            `<button type="button" data-opcion="${esc(o.v)}" class="${o.v === v ? 'activo' : ''}">${esc(o.t)}</button>`).join('')}</div></div>`;
      case 'select':
        return `<label class="campo ${ancho}"><span>${esc(c.etiqueta)}</span><select ${attrs}>${normalizarOpciones(c.opciones).map(o =>
          `<option value="${esc(o.v)}" ${o.v === v ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>${ayuda}</label>`;
      default: {
        const tipo = { fecha: 'date', hora: 'time', numero: 'text' }[c.tipo] || 'text';
        const extra = (c.mayusculas ? ' autocapitalize="characters" data-mayus="1"' : '') + (c.sugerir ? ` list="dl-${c.sugerir}" autocomplete="off"` : '') + (c.direccion ? ' data-direccion="1"' : '');
        return `<label class="campo ${ancho}"><span>${esc(c.etiqueta)}</span><input type="${tipo}" ${attrs}${extra} ${c.rerender ? 'data-rerender="1"' : ''} ${c.tipo === 'numero' ? 'inputmode="decimal"' : ''} value="${esc(v)}" placeholder="${esc(c.placeholder || '')}">${ayuda}</label>`;
      }
    }
  }

  function abrir(v, tareaId, opciones) {
    const op = opciones || {};
    const t = R.motor.lista(v).find(x => x.id === tareaId);
    const d = def(t);
    if (!d) return false;
    const previo = v.tareas[tareaId] || {};
    const ctx = Object.assign({}, t.ctx || {}, { enPaquete: !!previo.incluidoEnPaquete });
    const datos = JSON.parse(JSON.stringify(previo.datos || (d.inicial ? d.inicial(v, ctx) : {})));
    if (!datos.costo) {
      const gasto = v.movimientos.find(m => m.origenTarea === tareaId);
      datos.costo = gasto
        ? { monto: gasto.monto, moneda: gasto.moneda, cotizacion: gasto.cotizacion, persona: gasto.persona, entre: gasto.division.entre.slice(),
            modo: gasto.division.modo || 'igual', reparto: Object.assign({}, gasto.division.montos || {}, gasto.division.porcentajes || {}) }
        : { monto: '', moneda: v.monedaBase, cotizacion: '', persona: R.db.yoEn(v), entre: v.participantes.slice() };
    }
    let archivosNuevos = op.archivo ? [op.archivo] : [];
    let paso = 0;
    let aviso = op.aviso || '';
    function aplicarLeido(pre) {
      if (!pre) return;
      Object.keys(pre).forEach(k => {
        if (k === 'costo') { datos.costo.monto = pre.costo.monto; if (pre.costo.moneda) datos.costo.moneda = pre.costo.moneda; }
        else datos[k] = pre[k];
      });
    }
    aplicarLeido(op.prellenar);
    // Borrador: lo que vas cargando queda guardado en el teléfono hasta que tocás Guardar
    const CLAVE_B = `rutenda_borrador_${v.id}_${tareaId}`;
    const guardarB = () => { try { localStorage.setItem(CLAVE_B, JSON.stringify({ t: Date.now(), paso, datos })); } catch (e) { /* sin lugar */ } };
    const borrarB = () => { try { localStorage.removeItem(CLAVE_B); } catch (e) { /* nada */ } };
    const datosIniciales = JSON.stringify(datos);
    let recuperado = false;
    if (!op.prellenar) {
      let b = null;
      try { b = JSON.parse(localStorage.getItem(CLAVE_B)); } catch (e) { b = null; }
      if (b && b.datos && Date.now() - b.t < 30 * 864e5 && JSON.stringify(b.datos) !== datosIniciales) {
        Object.keys(datos).forEach(k => delete datos[k]);
        Object.assign(datos, b.datos);
        paso = b.paso || 0;
        recuperado = true;
      } else if (b) borrarB();
    }
    let pintadas = 0;
    const base = t.base || t.id;
    const escaneable = ['t_segmento', 'a_reserva', 'mv_auto', 'p_seguro', 'pq_paquete'].includes(base);
    const masAbierto = new Set();
    let confirmando = !!(op.confirmar && op.prellenar && Object.keys(op.prellenar).length && d.resumen);

    function pasos() {
      const lista = d.pasos(v, datos, ctx).map(p => Object.assign({ tipo: 'campos' }, p));
      const costoEn = (v.tareas[tareaId] || {}).costoEn;
      const mostrarCosto = d.costo && !ctx.enPaquete && !datos.mismaReservaQue && !(costoEn && v.tareas[costoEn]) && (!d.costo.si || d.costo.si(datos));
      if (mostrarCosto) lista.push({ tipo: 'costo', titulo: 'Costo' });
      if (d.archivos) lista.push({ tipo: 'archivos', titulo: 'Archivos' });
      if (!lista.length) lista.push({ tipo: 'campos', titulo: 'Listo', campos: [] });
      return lista;
    }

    const { el } = U.modal({
      titulo: t.titulo,
      subtitulo: op.cadena ? `📦 ${op.cadena.texto} · ${op.cadena.actual} de ${op.cadena.total}` : `${R.guia.fase(t.fase).icono} ${R.guia.fase(t.fase).nombre}${ctx.enPaquete ? ' · incluido en el paquete' : ''}`,
      ancho: true,
      cuerpo: '<div id="formPaso"></div>'
    });
    const cont = el.querySelector('#formPaso');

    function datalists() {
      const tipos = new Set();
      pasos().forEach(p => (p.campos || []).forEach(c => { if (c.sugerir) tipos.add(c.sugerir); (c.subcampos || []).forEach(s => { if (s.sugerir) tipos.add(s.sugerir); }); }));
      return Array.from(tipos).map(k => `<datalist id="dl-${k}">${recordados(k).map(x => `<option value="${esc(x)}">`).join('')}</datalist>`).join('');
    }

    /** Lo leído, para confirmar con un toque. */
    function confirmarHTML() {
      const lineas = (d.resumen(datos, v, ctx) || []).filter(Boolean);
      const c = datos.costo;
      if (c && U.numero(c.monto) > 0) lineas.push(`Costo: ${U.fmtMoneda(U.numero(c.monto), c.moneda)}${v.participantes.length > 1 ? ` · entre ${c.entre.length}` : ''}`);
      if (archivosNuevos.length) lineas.push(`📎 ${archivosNuevos.map(f => f.name).join(', ')}`);
      return `
        <div class="confirmar-leido">
          <p class="cl-titulo">📋 ${esc(aviso || 'Esto es lo que leí')}</p>
          <ul>${lineas.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        </div>
        <div class="asistente-pie">
          <button type="button" class="btn btn-suave" data-a="revisar">✏️ Revisar o corregir</button>
          <span class="espaciador"></span>
          <button type="button" class="btn btn-primario" data-a="confirmar">✓ Está bien, guardar</button>
        </div>`;
    }

    function herramientasHTML() {
      if (!escaneable || paso !== 0) return '';
      const ida = base === 't_segmento' && !datos.mismaReservaQue ? idaCargada(v, tareaId, ctx) : null;
      return `<div class="form-herramientas">
          <details class="pegar-mail"><summary>📋 Pegar el mail de la reserva</summary>
            <textarea rows="5" data-pegar placeholder="Copiá el mail o el voucher y pegalo acá"></textarea>
            <button type="button" class="btn btn-suave btn-chico" data-a="leerPegado">Completar con esto</button>
            <small class="ayuda">Se lee en el celular, sin IA.</small>
          </details>
          <button type="button" class="btn btn-suave btn-escanear" data-a="escanear">📄 Subir el pasaje o voucher</button>
          ${ida ? `<button type="button" class="btn btn-suave btn-escanear" data-a="mismaReserva">↩️ Es la misma reserva que la ida</button>` : ''}
        </div>`;
    }

    function pintar() {
      if (confirmando) {
        cont.innerHTML = confirmarHTML();
        cont.querySelector('[data-a="revisar"]').onclick = () => { confirmando = false; aviso = 'Revisalo y corregí lo que haga falta.'; pintar(); };
        cont.querySelector('[data-a="confirmar"]').onclick = () => {
          const lista = pasos();
          for (let i = 0; i < lista.length; i++) {
            const error = validar(lista[i]);
            if (error) { confirmando = false; paso = i; pintar(); U.toast(error); return; }
          }
          guardar();
        };
        return;
      }
      const lista = pasos();
      paso = Math.min(paso, lista.length - 1);
      const p = lista[paso];
      const ultimo = paso === lista.length - 1;
      cont.innerHTML = `
        ${lista.length > 1 ? `<div class="pasos-asistente">${lista.map((x, i) =>
          `<span class="paso-a ${i === paso ? 'actual' : ''} ${i < paso ? 'listo' : ''}"><i>${i < paso ? '✓' : i + 1}</i>${esc(x.titulo)}</span>`).join('')}</div>` : ''}
        ${recuperado ? '<div class="aviso-leido aviso-borrador">💾 Seguís donde lo dejaste: recuperé lo que habías cargado. <button type="button" class="btn-texto-mini" data-a="descartarB">Empezar de nuevo</button></div>' : ''}
        ${aviso ? `<div class="aviso-leido">📋 ${esc(aviso)}</div>` : ''}
        ${datos.mismaReservaQue ? '<div class="aviso-leido">↩️ Misma reserva que la ida: el costo ya quedó cargado ahí.</div>' : ''}
        ${!datos.mismaReservaQue && (v.tareas[tareaId] || {}).costoEn && v.tareas[(v.tareas[tareaId] || {}).costoEn] ? '<div class="aviso-leido">💲 El costo de este pasaje ya está cargado junto con el otro (ida y vuelta). <button type="button" class="btn-texto-mini" data-a="costoAparte">Cargar un costo aparte</button></div>' : ''}
        ${herramientasHTML()}
        <div class="form-paso">${cuerpoPaso(p)}</div>
        ${datalists()}
        <div class="asistente-pie">
          <button type="button" class="btn btn-texto" data-a="sinDatos">${previo.datos ? 'Cancelar' : 'Marcar listo sin cargar datos'}</button>
          <span class="espaciador"></span>
          ${paso > 0 ? '<button type="button" class="btn btn-suave" data-a="atras">← Atrás</button>' : ''}
          <button type="button" class="btn btn-primario" data-a="seguir">${ultimo ? 'Guardar ✓' : 'Siguiente →'}</button>
        </div>`;
      enlazar(p);
      if (R.direcciones) R.direcciones.enlazarTodos(cont, R.direcciones.cercaDe(v, ctx.destino));
      if (pintadas++) guardarB();
      cont.oninput = () => { leer(); guardarB(); };
      const bd = cont.querySelector('[data-a="descartarB"]');
      if (bd) bd.onclick = () => {
        borrarB();
        Object.keys(datos).forEach(k => delete datos[k]);
        Object.assign(datos, JSON.parse(datosIniciales));
        recuperado = false; paso = 0; pintadas = 0;
        pintar();
      };
      const cotiz = cont.querySelector('[data-costo="cotizacion"]');
      if (cotiz) R.cotizacion.enlazarCampo(cotiz, cont.querySelector('[data-cotiz-ayuda]'), datos.costo.moneda, v.monedaBase);
    }

    function cuerpoPaso(p) {
      if (p.tipo === 'costo') return costoHTML();
      if (p.tipo === 'archivos') return archivosHTML();
      const campos = (p.campos || []).filter(c => !c.si || c.si(datos, {}));
      const pinta = c => c.tipo === 'lista' ? listaHTML(c) : campoHTML(c, datos[c.id]);
      return `${p.intro ? `<p class="texto-suave form-intro">${esc(p.intro)}</p>` : ''}
        ${!campos.length && !p.intro ? '<p class="texto-suave">Listo para guardar.</p>' : ''}
        <div class="form-grilla">${campos.filter(c => !c.extra).map(pinta).join('')}
          ${masDatos('p' + paso, campos.filter(c => c.extra), pinta, datos)}</div>`;
    }

    /** Campos opcionales plegados: se abren solos si ya tienen algo. */
    function masDatos(clave, campos, pinta, fuente) {
      if (!campos.length) return '';
      const iniciales = fuente === datos && d.inicial ? d.inicial(v, ctx) : null;
      const lleno = campos.some(c => {
        const x = fuente[c.id];
        if (c.id === 'desde' || c.id === 'hasta') return false;   // vienen del cronograma
        if (c.tipo === 'segmentado' && (c.opciones || [])[0] === x) return false;   // la opción por defecto
        if (iniciales && iniciales[c.id] === x) return false;   // lo que puso la app, no vos
        if (c.id === 'fechaLlegada' && x === fuente.fechaSalida) return false;   // llega el mismo día: nada que mostrar
        if (c.id === 'devolucionLugar' && x === fuente.retiroLugar) return false;
        return x && x !== 'Sin definir' && x !== 'Directo' && !(Array.isArray(x) && !x.length);
      });
      const abierto = masAbierto.has(clave) || lleno;
      return `<details class="mas-datos completo" data-mas="${clave}" ${abierto ? 'open' : ''}>
          <summary>Más datos <small>(opcional)</small></summary>
          <div class="form-grilla">${campos.map(pinta).join('')}</div>
        </details>`;
    }

    function listaHTML(c) {
      const items = datos[c.id] = Array.isArray(datos[c.id]) ? datos[c.id] : [];
      return `<div class="form-lista completo">
        ${items.map((it, i) => `
          <div class="form-item">
            <div class="form-item-cab"><strong>${esc(c.etiquetaItem ? c.etiquetaItem(it, i) : 'Ítem ' + (i + 1))}</strong>
              <button type="button" class="btn-icono" data-quitar="${c.id}" data-i="${i}" title="Quitar">×</button></div>
            ${(() => {
              const subs = c.subcampos.filter(s => !s.si || s.si(datos, it));
              const pinta = s => s.tipo === 'aeropuerto' ? aeropuertoHTML(s, it, { lista: c.id, i }) : campoHTML(s, it[s.id], it, { lista: c.id, i });
              return `<div class="form-grilla">${subs.filter(s => !s.extra).map(pinta).join('')}${masDatos(c.id + i, subs.filter(s => s.extra), pinta, it)}</div>`;
            })()}
          </div>`).join('')}
        <button type="button" class="btn btn-suave btn-chico" data-agregar="${c.id}">${esc(c.textoAgregar || '+ Agregar')}</button>
      </div>`;
    }

    /** Elegir aeropuerto: sugerencias según la ciudad del tramo + código manual. */
    function aeropuertoHTML(c, item, clave) {
      const sug = R.aeropuertos.sugerencias(v, item[c.ciudadDe]);
      if (!item[c.id] && sug.length === 1) item[c.id] = sug[0].iata;
      const val = item[c.id] || '';
      const elegido = val && !sug.some(a => a.iata === val) ? R.aeropuertos.porCodigo(val) : null;
      const chip = a => `<button type="button" class="chip-aero ${a.iata === val ? 'activo' : ''}" data-aero="${a.iata}" title="${esc(a.nombre)}"><strong>${a.iata}</strong><small>${esc(a.nombre.replace(/ (International )?Airport.*$/i, '').slice(0, 28))}</small></button>`;
      return `<div class="campo ${c.ancho === 'medio' ? 'medio' : 'completo'} campo-aero">
        <span>${esc(c.etiqueta)}</span>
        <input type="hidden" data-campo="${c.id}" data-lista="${clave.lista}" data-item="${clave.i}" value="${esc(val)}">
        <div class="aero-chips">${sug.map(chip).join('')}${elegido ? chip(elegido) : ''}</div>
        <input type="text" class="aero-manual" maxlength="3" placeholder="${sug.length ? 'Otro (código)' : 'Código, ej. MAD'}" data-aero-manual="${clave.lista}|${clave.i}|${c.id}">
      </div>`;
    }

    function costoHTML() {
      const c = datos.costo;
      const varios = v.participantes.length > 1;
      return `
        <p class="texto-suave form-intro">Se carga solo en Gastos${varios ? ' y se divide entre quienes elijas' : ''}. Dejalo vacío si no tuvo costo.</p>
        <div class="form-grilla">
          <label class="campo medio"><span>${esc((d.costo && d.costo.etiqueta) || 'Costo total')}</span><input data-costo="monto" inputmode="decimal" value="${esc(c.monto)}" placeholder="0"></label>
          <label class="campo medio"><span>Moneda</span><select data-costo="moneda">${U.opcionesMoneda(c.moneda)}</select></label>
          ${base === 't_segmento' && contraparte(v, tareaId, ctx) ? `<label class="check completo"><input type="checkbox" data-iyv ${c.idaYVuelta ? 'checked' : ''}> Es el precio de ida y vuelta <small class="texto-suave">(no te lo pido en el otro pasaje)</small></label>` : ''}
          ${c.moneda !== v.monedaBase ? `<label class="campo completo"><span>Cotización: 1 ${esc(c.moneda)} = ? ${esc(v.monedaBase)}</span><input data-costo="cotizacion" inputmode="decimal" value="${esc(c.cotizacion)}"><small class="ayuda" data-cotiz-ayuda></small></label>` : ''}
          ${varios ? `
            <label class="campo completo"><span>¿Quién pagó?</span><select data-costo="persona">${U.ordenAlfa(v.participantes, pid => (R.db.persona(pid) || {}).nombre).map(pid => `<option value="${pid}" ${pid === c.persona ? 'selected' : ''}>${esc((R.db.persona(pid) || {}).nombre)}</option>`).join('')}</select></label>
            <div class="campo completo"><span>¿Entre quiénes se divide?</span>
              <div class="segmentado segmentado-chico" data-seg-costo>
                ${[['igual', 'Partes iguales'], ['montos', 'Montos'], ['porcentajes', 'Porcentajes']].map(([k, t]) => `<button type="button" data-modo-costo="${k}" class="${(c.modo || 'igual') === k ? 'activo' : ''}">${t}</button>`).join('')}
              </div>
              <button type="button" class="btn-texto-mini seleccionar-todos" data-a="todosCosto">${c.entre.length === v.participantes.length ? 'Quitar a todos' : 'Seleccionar a todos'}</button>
              <div class="lista-division">${v.participantes.map(pid => `
                <label class="division-fila">
                  <input type="checkbox" data-entre="${pid}" ${c.entre.includes(pid) ? 'checked' : ''}>
                  <span>${esc((R.db.persona(pid) || {}).nombre)}</span>
                  ${(c.modo || 'igual') === 'montos' ? `<input class="division-monto" data-reparto="${pid}" inputmode="decimal" value="${esc((c.reparto || {})[pid] || '')}" placeholder="0" ${c.entre.includes(pid) ? '' : 'disabled'}>`
                    : (c.modo || 'igual') === 'porcentajes' ? `<span class="division-pct"><input class="division-monto" data-reparto="${pid}" inputmode="decimal" value="${esc((c.reparto || {})[pid] || '')}" placeholder="0" ${c.entre.includes(pid) ? '' : 'disabled'}>%</span>`
                    : `<small class="division-parte">${c.entre.includes(pid) && U.numero(c.monto) > 0 ? U.fmtMoneda(U.numero(c.monto) / c.entre.length, c.moneda) : ''}</small>`}
                </label>`).join('')}</div>
            </div>` : ''}
        </div>`;
    }

    function archivosHTML() {
      const existentes = v.documentos.filter(x => x.tareaId === tareaId);
      return `
        ${d.archivos.ayuda ? `<p class="texto-suave form-intro">${esc(d.archivos.ayuda)}</p>` : ''}
        ${existentes.length ? `<div class="docs-mini">${existentes.map(x => `<span class="doc-mini">${R.documentos.iconoDoc(x)} ${esc(x.nombre)}</span>`).join('')}</div>` : ''}
        ${U.zonaArchivos('fp', archivosNuevos, 'Elegí uno o varios archivos (opcional)')}`;
    }

    function leer() {
      cont.querySelectorAll('[data-campo]').forEach(x => {
        const id = x.dataset.campo;
        const destino = x.dataset.lista != null ? datos[x.dataset.lista][Number(x.dataset.item)] : datos;
        if (!destino) return;
        if (x.type === 'checkbox' && x.dataset.valor != null) {
          const actual = new Set(Array.isArray(destino[id]) ? destino[id] : []);
          if (x.checked) actual.add(x.dataset.valor); else actual.delete(x.dataset.valor);
          destino[id] = Array.from(actual);
        } else if (x.type === 'checkbox') {
          destino[id] = x.checked;
        } else {
          destino[id] = x.dataset.mayus ? x.value.trim().toUpperCase() : x.value.trim();
        }
      });
      cont.querySelectorAll('[data-costo]').forEach(x => { datos.costo[x.dataset.costo] = x.value.trim(); });
      const iyv = cont.querySelector('[data-iyv]');
      if (iyv) datos.costo.idaYVuelta = iyv.checked;
      const entre = cont.querySelectorAll('[data-entre]');
      if (entre.length) datos.costo.entre = Array.from(entre).filter(x => x.checked).map(x => x.dataset.entre);
      datos.costo.reparto = datos.costo.reparto || {};
      cont.querySelectorAll('[data-reparto]').forEach(x => { datos.costo.reparto[x.dataset.reparto] = x.value; });
    }

    function validar(p) {
      if (p.tipo === 'campos') {
        const falta = (p.campos || []).find(c => c.requerido && (!c.si || c.si(datos, {})) && !String(datos[c.id] || '').trim());
        if (falta) return `Completá "${falta.etiqueta.replace(' *', '')}".`;
      }
      if (p.tipo === 'costo') {
        const c = datos.costo;
        if (U.numero(c.monto) > 0) {
          if (c.moneda !== v.monedaBase && !(U.numero(c.cotizacion) > 0)) return `Cargá la cotización de ${c.moneda} a ${v.monedaBase}.`;
          if (v.participantes.length > 1 && !c.entre.length) return 'Elegí entre quiénes se divide.';
          const suma = c.entre.reduce((a, pid) => a + U.numero((c.reparto || {})[pid]), 0);
          if (c.modo === 'montos' && Math.abs(suma - U.numero(c.monto)) >= 0.01) return `Los montos por persona suman ${U.fmtMoneda(suma, c.moneda)} y el total es ${U.fmtMoneda(U.numero(c.monto), c.moneda)}.`;
          if (c.modo === 'porcentajes' && Math.abs(suma - 100) >= 0.01) return `Los porcentajes suman ${suma}%: tienen que sumar 100%.`;
        }
      }
      return null;
    }

    function enlazar(p) {
      cont.querySelector('[data-a="seguir"]').onclick = () => {
        leer();
        const error = validar(p);
        if (error) { U.toast(error); return; }
        if (paso < pasos().length - 1) { paso++; pintar(); arriba(); } else guardar();
      };
      const atras = cont.querySelector('[data-a="atras"]');
      if (atras) atras.onclick = () => { leer(); paso--; pintar(); arriba(); };
      function arriba() { const c = cont.closest('.modal-cuerpo'); if (c) c.scrollTop = 0; const m = cont.closest('.modal'); if (m) m.scrollTop = 0; }
      cont.querySelector('[data-a="sinDatos"]').onclick = () => {
        borrarB();
        if (previo.datos) { U.cerrarModal(); return; }
        R.motor.setEstado(v, tareaId, 'hecha');
        const deducidasSin = R.motor.deducidasRecientes();
        R.db.guardarViaje(v);
        U.cerrarModal();
        R.app.refrescar();
        U.toast(deducidasSin.length
          ? `Listo. También di por resuelto: ${deducidasSin.map(x => x.titulo).slice(0, 3).join(', ')}.`
          : 'Listo. Los datos los cargás cuando quieras desde "Datos para cargar".');
      };
      cont.querySelectorAll('[data-seg] [data-opcion]').forEach(b => b.onclick = () => {
        const caja = b.closest('.campo');
        caja.querySelector('input[type="hidden"]').value = b.dataset.opcion;
        leer();
        pintar();
      });
      cont.querySelectorAll('select[data-campo], input[type="checkbox"][data-campo], select[data-costo="moneda"]').forEach(x => x.onchange = () => { leer(); pintar(); });
      cont.querySelectorAll('[data-entre]').forEach(x => x.onchange = () => { leer(); pintar(); });
      cont.querySelectorAll('[data-modo-costo]').forEach(b => b.onclick = () => { leer(); datos.costo.modo = b.dataset.modoCosto; pintar(); });
      const todosCosto = cont.querySelector('[data-a="todosCosto"]');
      if (todosCosto) todosCosto.onclick = () => { leer(); datos.costo.entre = datos.costo.entre.length === v.participantes.length ? [] : v.participantes.slice(); pintar(); };
      cont.querySelectorAll('[data-agregar]').forEach(b => b.onclick = () => {
        leer();
        const c = (p.campos || []).find(x => x.id === b.dataset.agregar);
        datos[c.id].push(c.nuevo ? c.nuevo() : {});
        pintar();
      });
      cont.querySelectorAll('[data-quitar]').forEach(b => b.onclick = () => {
        leer();
        datos[b.dataset.quitar].splice(Number(b.dataset.i), 1);
        pintar();
      });
      cont.querySelectorAll('[data-aero]').forEach(b => b.onclick = () => {
        const caja = b.closest('.campo-aero');
        const hidden = caja.querySelector('input[type="hidden"]');
        hidden.value = hidden.value === b.dataset.aero ? '' : b.dataset.aero;
        leer();
        pintar();
      });
      cont.querySelectorAll('[data-aero-manual]').forEach(x => x.oninput = () => {
        const codigo = x.value.trim().toUpperCase();
        if (codigo.length !== 3) return;
        const a = R.aeropuertos.porCodigo(codigo);
        if (!a) { U.toast(`No encuentro el aeropuerto ${codigo}.`); return; }
        x.closest('.campo-aero').querySelector('input[type="hidden"]').value = a.iata;
        leer();
        pintar();
      });
      cont.querySelectorAll('[data-rerender]').forEach(x => x.onchange = () => { leer(); pintar(); });
      // Fechas vacías: el calendario arranca en la fecha anterior del formulario (la llegada en la salida, etc.)
      const fechas = Array.from(cont.querySelectorAll('input[type="date"][data-campo]'));
      fechas.forEach((el, i) => {
        const poner = () => {
          if (el.value) return;
          const prev = fechas.slice(0, i).reverse().find(x => x.value);
          const f = prev ? prev.value : (ctx.fecha || (ctx.seg && ctx.seg.sale && ctx.seg.sale.fecha) || v.fechaInicio || '');
          if (f) el.value = f;
        };
        el.addEventListener('pointerdown', poner);
        el.addEventListener('focus', poner);
      });
      U.enlazarArchivos(cont, 'fp', archivosNuevos, pintar);
      cont.querySelectorAll('[data-mas]').forEach(x => x.addEventListener('toggle', () => { if (x.open) masAbierto.add(x.dataset.mas); else masAbierto.delete(x.dataset.mas); }));
      // N° de vuelo → aerolínea
      cont.querySelectorAll('[data-campo="numero"][data-lista]').forEach(x => x.addEventListener('change', () => {
        const nombre = aerolineaDe(x.value);
        const emp = cont.querySelector(`[data-campo="empresa"][data-lista="${x.dataset.lista}"][data-item="${x.dataset.item}"]`);
        if (nombre && emp && !emp.value.trim()) emp.value = nombre;
      }));
      const bp = cont.querySelector('[data-a="leerPegado"]');
      if (bp) bp.onclick = () => {
        const texto = cont.querySelector('[data-pegar]').value;
        if (texto.trim().length < 15) { U.toast('Pegá el texto de la reserva.'); return; }
        const r = R.escaneo.leerSinIA(texto, v);
        if (!r.util) { U.toast('No encontré datos de una reserva en ese texto.'); return; }
        leer();
        aplicarLeido(R.escaneo.aFormulario(base, r));
        aviso = `Leí ${r.encontrado.join(', ')}. Revisalo antes de guardar.`;
        pintar();
      };
      const bca = cont.querySelector('[data-a="costoAparte"]');
      if (bca) bca.onclick = () => { leer(); const x = Object.assign({}, v.tareas[tareaId]); delete x.costoEn; v.tareas[tareaId] = x; pintar(); };
      const bm = cont.querySelector('[data-a="mismaReserva"]');
      if (bm) bm.onclick = () => {
        leer();
        const ida = idaCargada(v, tareaId, ctx);
        const di = (v.tareas[ida.id] || {}).datos || {};
        datos.codigo = di.codigo;
        datos.equipaje = di.equipaje || datos.equipaje;
        datos.mismaReservaQue = ida.id;
        const emp = ((di.tramos || [])[0] || {}).empresa;
        (datos.tramos || []).forEach(x => { if (!x.empresa && emp) x.empresa = emp; });
        datos.costo.monto = '';
        aviso = 'Copié el código y la empresa. Completá el número y el horario de la vuelta.';
        pintar();
      };
      const esc2 = cont.querySelector('[data-a="escanear"]');
      if (esc2) esc2.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*,application/pdf';
        input.onchange = async () => {
          const f = input.files[0];
          if (!f) return;
          leer();
          esc2.disabled = true; esc2.textContent = 'Leyendo… 🔎';
          try {
            // Primero con reglas (sin IA); la IA solo si con eso no alcanza
            let r = null;
            try { r = await R.escaneo.leerArchivoSinIA(f, v); } catch (e) { r = null; }
            if (!r && R.escaneo.disponible()) r = await R.escaneo.analizar(f, t.titulo);
            archivosNuevos.push(f);
            if (r) { aplicarLeido(R.escaneo.aFormulario(base, r)); aviso = 'Completé lo que pude leer: revisalo antes de guardar.'; }
            else aviso = 'Adjunté el archivo. No pude leer los datos solo: completalos a mano.';
          } catch (e) { U.toast(e.message || 'No se pudo leer el archivo.'); }
          pintar();
        };
        input.click();
      };
    }

    function divisionDesdeCosto(c, entre) {
      const modo = v.participantes.length > 1 ? (c.modo || 'igual') : 'igual';
      const valores = {};
      entre.forEach(pid => { valores[pid] = U.numero((c.reparto || {})[pid]); });
      return { modo, entre, montos: modo === 'montos' ? valores : {}, porcentajes: modo === 'porcentajes' ? valores : {} };
    }

    async function guardar() {
      const boton = cont.querySelector('[data-a="seguir"], [data-a="confirmar"]');
      boton.disabled = true;
      boton.textContent = 'Guardando…';
      try {
        const estabaHecha = R.motor.estado(v, tareaId) === 'hecha';
        const destrabadas = estabaHecha ? [] : R.motor.setEstado(v, tareaId, 'hecha');
        const deducidas = estabaHecha ? [] : R.motor.deducidasRecientes();
        const vueltas = base === 't_segmento' ? repartirTramos(v, tareaId, datos, ctx) : [];
        // Precio de ida y vuelta: el otro pasaje ya no pide costo
        if (base === 't_segmento') {
          const cp = contraparte(v, tareaId, ctx);
          if (cp) {
            const otro = Object.assign({}, v.tareas[cp.id] || { estado: R.motor.estado(v, cp.id) });
            if (datos.costo && datos.costo.idaYVuelta && U.numero(datos.costo.monto) > 0) otro.costoEn = tareaId;
            else if (otro.costoEn === tareaId) delete otro.costoEn;
            v.tareas[cp.id] = otro;
          }
        }
        const { costo } = datos;
        const datosPaso = Object.assign({}, datos);
        delete datosPaso.costo;
        datosPaso.costo = costo;
        v.tareas[tareaId] = Object.assign({}, v.tareas[tareaId], { estado: 'hecha', datos: datosPaso, sinDatosOk: false });

        // Itinerario generado
        const eventos = d.itinerario ? d.itinerario(v, datos, ctx) : [];
        v.itinerario = v.itinerario.filter(e => e.origen !== tareaId)
          .concat(eventos.filter(e => e && e.titulo).map(e => Object.assign({ id: U.id('evt'), origen: tareaId }, e)));

        // Gasto generado
        v.movimientos = v.movimientos.filter(m => m.origenTarea !== tareaId);
        let gastoCargado = false;
        if (d.costo && !ctx.enPaquete && pasos().some(x => x.tipo === 'costo') && U.numero(costo.monto) > 0) {
          const entre = v.participantes.length > 1 ? costo.entre : [costo.persona || v.participantes[0]];
          v.movimientos.push({
            id: U.id('mov'), tipo: 'gasto', origenTarea: tareaId,
            concepto: ((d.concepto ? d.concepto(v, datos, ctx) : t.titulo) || t.titulo) + (costo.idaYVuelta ? ' (ida y vuelta)' : ''),
            categoria: d.costo.categoria, monto: U.numero(costo.monto), moneda: costo.moneda,
            cotizacion: costo.moneda !== v.monedaBase ? U.numero(costo.cotizacion) : 1,
            fecha: U.hoyISO(), persona: v.participantes.length > 1 ? costo.persona : (costo.persona || v.participantes[0]),
            division: divisionDesdeCosto(costo, entre), creado: new Date().toISOString()
          });
          gastoCargado = true;
        }

        // Archivos
        if (archivosNuevos.length) await R.documentos.guardarArchivos(v, archivosNuevos, { categoria: d.archivos.categoria, tareaId });

        if (d.alGuardar) d.alGuardar(v, datos, ctx, tareaId);
        R.db.guardarViaje(v);
        borrarB();
        U.cerrarModal();
        R.app.refrescar();

        const partes = [];
        if (eventos.length) partes.push('itinerario');
        if (gastoCargado) partes.push('gastos');
        if (archivosNuevos.length) partes.push('documentos');
        U.toast(partes.length ? `¡Guardado! Ya está en ${partes.join(', ').replace(/, ([^,]*)$/, ' y $1')}.` : '¡Guardado!');
        if (vueltas.length) setTimeout(() => U.toast(`En la misma reserva venía ${vueltas.map(x => x.titulo).join(' y ')}: también quedó cargado. ✓`), 2600);
        else if (deducidas.length) setTimeout(() => U.toast(`También di por resuelto: ${deducidas.map(x => x.titulo).slice(0, 3).join(', ')}.`), 2600);
        else if (destrabadas.length) setTimeout(() => U.toast(`Se destrabó: ${destrabadas.map(x => x.titulo).slice(0, 2).join(', ')}`), 2600);
        if (op.alTerminar) op.alTerminar();
        else if (d.despues) setTimeout(() => d.despues(v), 450);
      } catch (e) {
        console.error(e);
        boton.disabled = false;
        boton.textContent = 'Guardar ✓';
        U.toast('No se pudo guardar. Probá de nuevo.');
      }
    }

    pintar();
    return true;
  }

  /**
   * Al marcar un pasaje como "Ya está": una sola pregunta (la empresa, o el vuelo).
   * Con eso queda completo; el código, el costo y el voucher, cuando quieras.
   */
  function preguntarEmpresa(v, tareaId) {
    const t = R.motor.lista(v).find(x => x.id === tareaId);
    if (!t || t.base !== 't_segmento' || (v.tareas[tareaId] || {}).datos) return false;
    const ctx = t.ctx || {};
    const modo = transporte.modo(v, {}, ctx);
    const m = MODOS[modo] || MODOS.otro;
    if (modo === 'auto') return false;
    const avion = modo === 'avion';
    const tipoSug = avion ? 'aerolinea' : 'empresa';
    const { el } = U.modal({
      titulo: avion ? '✈️ ¿Qué vuelo es?' : `${R.recorrido.medio(modo).icono} ¿Con qué empresa viajás?`,
      subtitulo: `${ctx.seg ? ctx.seg.desde.nombre + ' → ' + ctx.seg.hasta.nombre : t.titulo} · lo demás, cuando quieras`,
      cuerpo: `<div class="form-grilla">
          ${avion ? '<label class="campo medio"><span>N° de vuelo</span><input id="rpNumero" autocapitalize="characters" placeholder="Ej: AR1672"></label>' : ''}
          <label class="campo ${avion ? 'medio' : 'completo'}"><span>${esc(m.empresa)}</span><input id="rpEmpresa" list="dl-rp" autocomplete="off" placeholder="${avion ? 'Ej: Aerolíneas Argentinas' : 'Ej: Vía Bariloche'}"></label>
        </div>
        <datalist id="dl-rp">${recordados(tipoSug).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
        <p class="ayuda">Las fechas y horarios salen del cronograma. El código, el costo y el pasaje los sumás después si querés.</p>`,
      acciones: [{ texto: 'Después' }, { texto: 'Guardar', clase: 'btn-primario', onClick: el2 => {
        const emp = el2.querySelector('#rpEmpresa').value.trim();
        const num = el2.querySelector('#rpNumero') ? el2.querySelector('#rpNumero').value.trim().toUpperCase() : '';
        if (!emp && !num) { U.toast(`Escribí ${avion ? 'el vuelo o la aerolínea' : 'la empresa'}, o tocá "Después".`); return false; }
        const datos = transporte.inicial(v, ctx);
        (datos.tramos || []).forEach(x => { x.empresa = emp || aerolineaDe(num); if (num) x.numero = num; });
        v.tareas[tareaId] = Object.assign({}, v.tareas[tareaId], { estado: 'hecha', datos, sinDatosOk: false });
        R.db.guardarViaje(v);
        R.app.refrescar();
        U.toast('Guardado ✓');
        return true;
      } }]
    });
    const num = el.querySelector('#rpNumero'), emp = el.querySelector('#rpEmpresa');
    if (num) num.addEventListener('input', () => { const a = aerolineaDe(num.value); if (a && !emp.value.trim()) emp.value = a; });
    setTimeout(() => (num || emp).focus(), 60);
    return true;
  }

  /** Líneas de resumen de lo cargado en un paso (para el detalle). */
  function resumen(v, t) {
    const d = def(t);
    const datos = (v.tareas[t.id] || {}).datos;
    if (!d || !datos || !d.resumen) return [];
    const lineas = d.resumen(datos, v, t.ctx || {}) || [];
    const c = datos.costo;
    if (c && U.numero(c.monto) > 0) lineas.push(`Costo: ${U.fmtMoneda(U.numero(c.monto), c.moneda)}${v.participantes.length > 1 && c.persona ? ` · pagó ${(R.db.persona(c.persona) || {}).nombre}` : ''}`);
    return lineas.filter(Boolean);
  }

  return { tiene, abrir, resumen, aplicarPaquete, incluidoEnPaquete, completarPaquete, faltantesPaquete, recordados, aerolineaDe, repartirTramos, preguntarEmpresa, MODOS };
})();
