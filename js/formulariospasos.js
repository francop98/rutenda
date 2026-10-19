/* =========================================================
   Tripbox — formularios de cada paso
   Cuando marcás un paso como listo, Tripbox te pide sus datos
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
    auto: { nombre: 'Auto', empresa: 'Vehículo', numero: 'Patente', concepto: 'Traslado en auto' }
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
      { id: 'desde', tipo: 'texto', etiqueta: 'Desde', ancho: 'medio', rerender: modo === 'avion' },
      { id: 'hasta', tipo: 'texto', etiqueta: 'Hasta', ancho: 'medio', rerender: modo === 'avion' },
      { id: 'desdeAeropuerto', tipo: 'aeropuerto', etiqueta: 'Aeropuerto de salida', ciudadDe: 'desde', ancho: 'medio', si: () => modo === 'avion' },
      { id: 'hastaAeropuerto', tipo: 'aeropuerto', etiqueta: 'Aeropuerto de llegada', ciudadDe: 'hasta', ancho: 'medio', si: () => modo === 'avion' },
      { id: 'empresa', tipo: 'texto', etiqueta: m.empresa, ancho: 'medio' },
      { id: 'numero', tipo: 'texto', etiqueta: m.numero, ancho: 'medio' },
      { id: 'fechaSalida', tipo: 'fecha', etiqueta: 'Fecha de salida', ancho: 'medio' },
      { id: 'horaSalida', tipo: 'hora', etiqueta: 'Hora de salida', ancho: 'medio' },
      { id: 'fechaLlegada', tipo: 'fecha', etiqueta: 'Fecha de llegada', ancho: 'medio' },
      { id: 'horaLlegada', tipo: 'hora', etiqueta: 'Hora de llegada', ancho: 'medio' },
      { id: 'escalas', tipo: 'segmentado', etiqueta: '¿Directo o con escalas?', opciones: ['Directo', 'Con escalas'] },
      { id: 'escalaEn', tipo: 'texto', etiqueta: 'Escala en (y cuánto dura)', placeholder: 'Ej: Santiago, 2 h', si: (d, item) => item.escalas === 'Con escalas' }
    ];
  }

  const transporte = {
    modo: (v, d, ctx) => ctx && ctx.hasta ? (d.modo || 'avion') : (v.perfil.transporte || 'avion'),
    pasos: (v, d, ctx) => {
      const modo = transporte.modo(v, d, ctx);
      const primero = ctx && ctx.hasta ? [{ id: 'modo', tipo: 'segmentado', etiqueta: '¿Cómo vas?', opciones: Object.keys(MODOS).map(k => ({ v: k, t: MODOS[k].nombre })) }] : [];
      return [
        { titulo: 'Los tramos', intro: 'Cargá cada tramo. Si es combinado, agregá un tramo por cada vuelo o servicio.', campos: primero.concat([
          { id: 'tramos', tipo: 'lista', etiquetaItem: it => it.sentido || 'Tramo', textoAgregar: '+ Agregar otro tramo', nuevo: () => ({ sentido: 'Tramo', escalas: 'Directo' }), subcampos: camposTramo(modo) }
        ]) },
        { titulo: 'La reserva', campos: [
          { id: 'codigo', tipo: 'texto', etiqueta: 'Código de reserva', ancho: 'medio' },
          { id: 'equipaje', tipo: 'segmentado', etiqueta: 'Equipaje incluido', opciones: ['Solo de mano', 'Mano + bodega', 'Sin definir'], si: () => modo === 'avion' },
          { id: 'asientos', tipo: 'texto', etiqueta: 'Asientos', placeholder: 'Ej: 12A y 12B', ancho: 'medio' },
          { id: 'condiciones', tipo: 'textarea', etiqueta: 'Condiciones de cambio o cancelación', placeholder: 'Ej: cambio con cargo hasta 24 h antes' }
        ] }
      ];
    },
    inicial: (v, ctx) => {
      if (ctx && ctx.hasta) {
        return { modo: 'avion', tramos: [{ sentido: 'Tramo', desde: ctx.desde.nombre, hasta: ctx.hasta.nombre, fechaSalida: ctx.hasta.desde || '', escalas: 'Directo' }] };
      }
      const lista = destinosAloj(v);
      const primero = lista[0] || { nombre: v.destino }, ultimo = lista[lista.length - 1] || primero;
      const origen = (v.origen && v.origen.nombre) || '';
      return {
        equipaje: 'Sin definir',
        tramos: [
          { sentido: 'Ida', desde: origen, hasta: primero.nombre, fechaSalida: v.fechaInicio || '', escalas: 'Directo' },
          { sentido: 'Vuelta', desde: ultimo.nombre, hasta: origen, fechaSalida: v.fechaFin || '', escalas: 'Directo' }
        ]
      };
    },
    costo: { categoria: 'transporte' },
    archivos: { categoria: 'pasaje', ayuda: 'Pasajes, e-tickets o la confirmación de la compra.' },
    concepto: (v, d, ctx) => ctx && ctx.hasta ? `Traslado ${ctx.desde.nombre} → ${ctx.hasta.nombre}` : (MODOS[v.perfil.transporte] || MODOS.avion).concepto,
    itinerario: (v, d, ctx) => (d.tramos || []).filter(t => t.fechaSalida).map(t => ({
      fecha: t.fechaSalida, hora: t.horaSalida || '', tipo: 'vuelo',
      titulo: `${conAero(t.desde, t.desdeAeropuerto)} → ${conAero(t.hasta, t.hastaAeropuerto)}`,
      lugar: t.desde || '', confirmacion: d.codigo || '',
      notas: unir(unir(t.empresa, t.numero), t.horaLlegada ? `Llega ${t.fechaLlegada && t.fechaLlegada !== t.fechaSalida ? U.fmtFecha(t.fechaLlegada, 'corto') + ' ' : ''}${t.horaLlegada}` : '', t.escalas === 'Con escalas' ? `Escala: ${t.escalaEn || 'sí'}` : 'Directo')
    })),
    resumen: (d) => (d.tramos || []).map(t => unir(t.sentido, `${conAero(t.desde, t.desdeAeropuerto)} → ${conAero(t.hasta, t.hastaAeropuerto)}`, unir(t.empresa, t.numero), fh(t.fechaSalida, t.horaSalida), t.escalas === 'Con escalas' ? 'con escala' + (t.escalaEn ? ' en ' + t.escalaEn : '') : 'directo'))
      .concat(d.codigo ? [`Código: ${d.codigo}`] : []).concat(d.equipaje && d.equipaje !== 'Sin definir' ? [`Equipaje: ${d.equipaje}`] : [])
  };

  const DEF = {
    t_principal: transporte,
    t_tramo: transporte,

    a_reserva: {
      pasos: () => [
        { titulo: 'El lugar', campos: [
          { id: 'nombre', tipo: 'texto', etiqueta: 'Nombre del alojamiento *', requerido: true },
          { id: 'tipo', tipo: 'segmentado', etiqueta: 'Tipo', opciones: ['Hotel', 'Departamento', 'Casa', 'Cabaña', 'Hostel', 'Otro'] },
          { id: 'direccion', tipo: 'texto', etiqueta: 'Dirección' },
          { id: 'contacto', tipo: 'texto', etiqueta: 'Teléfono o mail de contacto' }
        ] },
        { titulo: 'La estadía', campos: [
          { id: 'checkinFecha', tipo: 'fecha', etiqueta: 'Check-in', ancho: 'medio' },
          { id: 'checkinHora', tipo: 'hora', etiqueta: 'Hora de check-in', ancho: 'medio' },
          { id: 'checkoutFecha', tipo: 'fecha', etiqueta: 'Check-out', ancho: 'medio' },
          { id: 'checkoutHora', tipo: 'hora', etiqueta: 'Hora de check-out', ancho: 'medio' },
          { id: 'codigo', tipo: 'texto', etiqueta: 'Código de reserva', ancho: 'medio' },
          { id: 'cancelacionHasta', tipo: 'fecha', etiqueta: 'Cancelación gratis hasta', ancho: 'medio', ayuda: 'Te sirve si cambian los planes.' },
          { id: 'desayuno', tipo: 'check', etiqueta: 'Incluye desayuno' }
        ] }
      ],
      inicial: (v, ctx) => {
        const d = (ctx && ctx.destino) || {};
        return { tipo: 'Hotel', checkinFecha: d.desde || v.fechaInicio || '', checkinHora: '14:00', checkoutFecha: d.hasta || v.fechaFin || '', checkoutHora: '10:00' };
      },
      costo: { categoria: 'alojamiento' },
      archivos: { categoria: 'reserva', ayuda: 'La confirmación o el voucher de la reserva.' },
      concepto: (v, d) => `Alojamiento: ${d.nombre || ''}`.trim(),
      itinerario: (v, d) => [
        d.checkinFecha && { fecha: d.checkinFecha, hora: d.checkinHora || '', tipo: 'alojamiento', titulo: `Check-in · ${d.nombre || 'alojamiento'}`, lugar: d.direccion || '', confirmacion: d.codigo || '', notas: d.contacto || '' },
        d.checkoutFecha && { fecha: d.checkoutFecha, hora: d.checkoutHora || '', tipo: 'alojamiento', titulo: `Check-out · ${d.nombre || 'alojamiento'}`, lugar: d.direccion || '', confirmacion: '', notas: '' }
      ].filter(Boolean),
      resumen: d => [unir(d.nombre, d.tipo), d.direccion, unir(d.checkinFecha && 'Entrada ' + fh(d.checkinFecha, d.checkinHora), d.checkoutFecha && 'Salida ' + fh(d.checkoutFecha, d.checkoutHora)),
        d.codigo && `Código: ${d.codigo}`, d.cancelacionHasta && `Cancelación gratis hasta el ${U.fmtFecha(d.cancelacionHasta, 'corto')}`, d.desayuno && 'Con desayuno'].filter(Boolean)
    },

    p_seguro: {
      pasos: () => [{ titulo: 'La cobertura', campos: [
        { id: 'compania', tipo: 'texto', etiqueta: 'Compañía *', requerido: true, ancho: 'medio' },
        { id: 'poliza', tipo: 'texto', etiqueta: 'N° de voucher o póliza', ancho: 'medio' },
        { id: 'telefono', tipo: 'texto', etiqueta: 'Teléfono de emergencias', placeholder: 'Ej: +54 11 …' },
        { id: 'desde', tipo: 'fecha', etiqueta: 'Cubre desde', ancho: 'medio' },
        { id: 'hasta', tipo: 'fecha', etiqueta: 'Cubre hasta', ancho: 'medio' },
        { id: 'notas', tipo: 'textarea', etiqueta: 'Qué cubre / notas' }
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
          { id: 'rentadora', tipo: 'texto', etiqueta: 'Rentadora *', requerido: true, ancho: 'medio' },
          { id: 'vehiculo', tipo: 'texto', etiqueta: 'Categoría o modelo', ancho: 'medio' },
          { id: 'codigo', tipo: 'texto', etiqueta: 'Código de reserva', ancho: 'medio' },
          { id: 'seguro', tipo: 'check', etiqueta: 'Seguro incluido' }
        ] },
        { titulo: 'Retiro y devolución', campos: [
          { id: 'retiroLugar', tipo: 'texto', etiqueta: 'Lugar de retiro' },
          { id: 'retiroFecha', tipo: 'fecha', etiqueta: 'Fecha de retiro', ancho: 'medio' },
          { id: 'retiroHora', tipo: 'hora', etiqueta: 'Hora de retiro', ancho: 'medio' },
          { id: 'devolucionLugar', tipo: 'texto', etiqueta: 'Lugar de devolución' },
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
      }
    }
  };

  const BASES_PAQUETE = {
    vuelos: ['t_principal', 't_tramo'], alojamiento: ['a_reserva'], traslados: ['mv_traslado'],
    excursiones: ['e_excursiones'], seguro: ['p_seguro'], auto: ['mv_auto']
  };

  /** Marca como resuelto (incluido en el paquete) lo que el paquete cubre. */
  function aplicarPaquete(v) {
    const incluye = (v.perfil.paquete && v.perfil.paquete.incluye) || [];
    incluye.forEach(k => (BASES_PAQUETE[k] || []).forEach(base => R.motor.idsDe(v, base).forEach(id => {
      const previo = v.tareas[id] || {};
      if (previo.estado === 'hecha' && !previo.incluidoEnPaquete) return;
      v.tareas[id] = Object.assign({}, previo, { estado: 'hecha', incluidoEnPaquete: true, fechaHecha: previo.fechaHecha || new Date().toISOString() });
    })));
  }

  function def(t) { return t ? DEF[t.base || t.id] : null; }
  function tiene(t) { return !!def(t); }

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
        return `<label class="campo ${ancho}"><span>${esc(c.etiqueta)}</span><input type="${tipo}" ${attrs} ${c.rerender ? 'data-rerender="1"' : ''} ${c.tipo === 'numero' ? 'inputmode="decimal"' : ''} value="${esc(v)}" placeholder="${esc(c.placeholder || '')}">${ayuda}</label>`;
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
        ? { monto: gasto.monto, moneda: gasto.moneda, cotizacion: gasto.cotizacion, persona: gasto.persona, entre: gasto.division.entre.slice() }
        : { monto: '', moneda: v.monedaBase, cotizacion: '', persona: v.participantes.includes('yo') ? 'yo' : v.participantes[0], entre: v.participantes.slice() };
    }
    let archivosNuevos = [];
    let paso = 0;

    function pasos() {
      const lista = d.pasos(v, datos, ctx).map(p => Object.assign({ tipo: 'campos' }, p));
      const mostrarCosto = d.costo && !ctx.enPaquete && (!d.costo.si || d.costo.si(datos));
      if (mostrarCosto) lista.push({ tipo: 'costo', titulo: 'Costo' });
      if (d.archivos) lista.push({ tipo: 'archivos', titulo: 'Archivos' });
      if (!lista.length) lista.push({ tipo: 'campos', titulo: 'Listo', campos: [] });
      return lista;
    }

    const { el } = U.modal({
      titulo: t.titulo,
      subtitulo: `${R.guia.fase(t.fase).icono} ${R.guia.fase(t.fase).nombre}${ctx.enPaquete ? ' · incluido en el paquete' : ''}`,
      ancho: true,
      cuerpo: '<div id="formPaso"></div>'
    });
    const cont = el.querySelector('#formPaso');

    function pintar() {
      const lista = pasos();
      paso = Math.min(paso, lista.length - 1);
      const p = lista[paso];
      const ultimo = paso === lista.length - 1;
      cont.innerHTML = `
        ${lista.length > 1 ? `<div class="pasos-asistente">${lista.map((x, i) =>
          `<span class="paso-a ${i === paso ? 'actual' : ''} ${i < paso ? 'listo' : ''}"><i>${i < paso ? '✓' : i + 1}</i>${esc(x.titulo)}</span>`).join('')}</div>` : ''}
        <div class="form-paso">${cuerpoPaso(p)}</div>
        <div class="asistente-pie">
          <button type="button" class="btn btn-texto" data-a="sinDatos">${previo.datos ? 'Cancelar' : 'Marcar listo sin cargar datos'}</button>
          <span class="espaciador"></span>
          ${paso > 0 ? '<button type="button" class="btn btn-suave" data-a="atras">← Atrás</button>' : ''}
          <button type="button" class="btn btn-primario" data-a="seguir">${ultimo ? 'Guardar ✓' : 'Siguiente →'}</button>
        </div>`;
      enlazar(p);
    }

    function cuerpoPaso(p) {
      if (p.tipo === 'costo') return costoHTML();
      if (p.tipo === 'archivos') return archivosHTML();
      const campos = (p.campos || []).filter(c => !c.si || c.si(datos, {}));
      return `${p.intro ? `<p class="texto-suave form-intro">${esc(p.intro)}</p>` : ''}
        ${!campos.length && !p.intro ? '<p class="texto-suave">Listo para guardar.</p>' : ''}
        <div class="form-grilla">${campos.map(c => c.tipo === 'lista' ? listaHTML(c) : campoHTML(c, datos[c.id])).join('')}</div>`;
    }

    function listaHTML(c) {
      const items = datos[c.id] = Array.isArray(datos[c.id]) ? datos[c.id] : [];
      return `<div class="form-lista completo">
        ${items.map((it, i) => `
          <div class="form-item">
            <div class="form-item-cab"><strong>${esc(c.etiquetaItem ? c.etiquetaItem(it, i) : 'Ítem ' + (i + 1))}</strong>
              <button type="button" class="btn-icono" data-quitar="${c.id}" data-i="${i}" title="Quitar">×</button></div>
            <div class="form-grilla">${c.subcampos.filter(s => !s.si || s.si(datos, it)).map(s => s.tipo === 'aeropuerto' ? aeropuertoHTML(s, it, { lista: c.id, i }) : campoHTML(s, it[s.id], it, { lista: c.id, i })).join('')}</div>
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
        <input type="text" class="aero-manual" maxlength="3" placeholder="${sug.length ? 'Otro: código (ej. COR)' : 'Código del aeropuerto (ej. EZE)'}" data-aero-manual="${clave.lista}|${clave.i}|${c.id}">
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
          ${c.moneda !== v.monedaBase ? `<label class="campo completo"><span>Cotización: 1 ${esc(c.moneda)} = ? ${esc(v.monedaBase)}</span><input data-costo="cotizacion" inputmode="decimal" value="${esc(c.cotizacion)}"></label>` : ''}
          ${varios ? `
            <label class="campo completo"><span>¿Quién pagó?</span><select data-costo="persona">${v.participantes.map(pid => `<option value="${pid}" ${pid === c.persona ? 'selected' : ''}>${esc((R.db.persona(pid) || {}).nombre)}</option>`).join('')}</select></label>
            <div class="campo completo"><span>¿Entre quiénes se divide? (partes iguales)</span><div class="checks-grilla">${v.participantes.map(pid =>
              `<label class="chip-check ${c.entre.includes(pid) ? 'activo' : ''}"><input type="checkbox" data-entre="${pid}" ${c.entre.includes(pid) ? 'checked' : ''}> ${esc((R.db.persona(pid) || {}).nombre)}</label>`).join('')}</div></div>` : ''}
        </div>`;
    }

    function archivosHTML() {
      const existentes = v.documentos.filter(x => x.tareaId === tareaId);
      return `
        ${d.archivos.ayuda ? `<p class="texto-suave form-intro">${esc(d.archivos.ayuda)}</p>` : ''}
        ${existentes.length ? `<div class="docs-mini">${existentes.map(x => `<span class="doc-mini">${R.documentos.iconoDoc(x)} ${esc(x.nombre)}</span>`).join('')}</div>` : ''}
        <label class="zona-archivo ${archivosNuevos.length ? 'con-archivo' : ''}">
          <input type="file" id="fpArchivos" multiple accept="image/*,application/pdf,.doc,.docx,.txt">
          <span class="za-icono">⬆</span>
          <span>${archivosNuevos.length ? archivosNuevos.map(f => esc(f.name)).join(', ') : 'Elegí uno o varios archivos (opcional)'}</span>
        </label>`;
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
          destino[id] = x.value.trim();
        }
      });
      cont.querySelectorAll('[data-costo]').forEach(x => { datos.costo[x.dataset.costo] = x.value.trim(); });
      const entre = cont.querySelectorAll('[data-entre]');
      if (entre.length) datos.costo.entre = Array.from(entre).filter(x => x.checked).map(x => x.dataset.entre);
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
        }
      }
      return null;
    }

    function enlazar(p) {
      cont.querySelector('[data-a="seguir"]').onclick = () => {
        leer();
        const error = validar(p);
        if (error) { U.toast(error); return; }
        if (paso < pasos().length - 1) { paso++; pintar(); cont.scrollIntoView({ block: 'start' }); } else guardar();
      };
      const atras = cont.querySelector('[data-a="atras"]');
      if (atras) atras.onclick = () => { leer(); paso--; pintar(); };
      cont.querySelector('[data-a="sinDatos"]').onclick = () => {
        if (previo.datos) { U.cerrarModal(); return; }
        R.motor.setEstado(v, tareaId, 'hecha');
        const deducidasSin = R.motor.deducidasRecientes();
        R.db.guardarViaje(v);
        U.cerrarModal();
        R.app.refrescar();
        U.toast(deducidasSin.length
          ? `Listo. También di por resuelto: ${deducidasSin.map(x => x.titulo).slice(0, 3).join(', ')}.`
          : 'Listo. Podés cargar los datos cuando quieras desde "Completá los datos".');
      };
      cont.querySelectorAll('[data-seg] [data-opcion]').forEach(b => b.onclick = () => {
        const caja = b.closest('.campo');
        caja.querySelector('input[type="hidden"]').value = b.dataset.opcion;
        leer();
        pintar();
      });
      cont.querySelectorAll('select[data-campo], input[type="checkbox"][data-campo], select[data-costo="moneda"]').forEach(x => x.onchange = () => { leer(); pintar(); });
      cont.querySelectorAll('[data-entre]').forEach(x => x.onchange = () => { x.closest('.chip-check').classList.toggle('activo', x.checked); });
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
      const archivo = cont.querySelector('#fpArchivos');
      if (archivo) archivo.onchange = () => { archivosNuevos = archivosNuevos.concat(Array.from(archivo.files)); pintar(); };
    }

    async function guardar() {
      const boton = cont.querySelector('[data-a="seguir"]');
      boton.disabled = true;
      boton.textContent = 'Guardando…';
      try {
        const estabaHecha = R.motor.estado(v, tareaId) === 'hecha';
        const destrabadas = estabaHecha ? [] : R.motor.setEstado(v, tareaId, 'hecha');
        const deducidas = estabaHecha ? [] : R.motor.deducidasRecientes();
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
        if (d.costo && !ctx.enPaquete && U.numero(costo.monto) > 0) {
          const entre = v.participantes.length > 1 ? costo.entre : [costo.persona || v.participantes[0]];
          v.movimientos.push({
            id: U.id('mov'), tipo: 'gasto', origenTarea: tareaId,
            concepto: (d.concepto ? d.concepto(v, datos, ctx) : t.titulo) || t.titulo,
            categoria: d.costo.categoria, monto: U.numero(costo.monto), moneda: costo.moneda,
            cotizacion: costo.moneda !== v.monedaBase ? U.numero(costo.cotizacion) : 1,
            fecha: U.hoyISO(), persona: v.participantes.length > 1 ? costo.persona : (costo.persona || v.participantes[0]),
            division: { modo: 'igual', entre, montos: {} }, creado: new Date().toISOString()
          });
          gastoCargado = true;
        }

        // Archivos
        if (archivosNuevos.length) await R.documentos.guardarArchivos(v, archivosNuevos, { categoria: d.archivos.categoria, tareaId });

        if (d.alGuardar) d.alGuardar(v, datos, ctx, tareaId);
        R.db.guardarViaje(v);
        U.cerrarModal();
        R.app.refrescar();

        const partes = [];
        if (eventos.length) partes.push('itinerario');
        if (gastoCargado) partes.push('gastos');
        if (archivosNuevos.length) partes.push('documentos');
        U.toast(partes.length ? `¡Guardado! Ya está en ${partes.join(', ').replace(/, ([^,]*)$/, ' y $1')}.` : '¡Guardado!');
        if (deducidas.length) setTimeout(() => U.toast(`También di por resuelto: ${deducidas.map(x => x.titulo).slice(0, 3).join(', ')}.`), 2600);
        else if (destrabadas.length) setTimeout(() => U.toast(`Se destrabó: ${destrabadas.map(x => x.titulo).slice(0, 2).join(', ')}`), 2600);
        if (op.alTerminar) op.alTerminar();
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

  return { tiene, abrir, resumen, aplicarPaquete, MODOS };
})();
