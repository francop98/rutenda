/* =========================================================
   Tripbox — plantilla de la guía paso a paso
   Cada paso tiene:
   - impacto (1 a 5): cuánto cuesta cambiarlo / qué tan escaso es
   - anticipacion: días antes de salir en que conviene tenerlo listo
     (con ref:'fin', días DESPUÉS de volver)
   - dependeDe: pasos que tienen que estar resueltos antes (bloquean)
   - despuesDe: pasos que conviene resolver antes (no bloquean)
   - aplica(v): si el paso corresponde según el perfil del viaje
   - porque: explicación humana de su prioridad
   - porDestino: se repite por cada destino con alojamiento
   - porTramo: se repite por cada traslado entre destinos
   - porEscapada: se repite por cada escapada de un día
   Títulos y descripciones pueden ser funciones (v, ctx), donde
   ctx = { destino, desde, hasta, varios }.
   ========================================================= */
window.R = window.R || {};

R.guia = (function () {
  const TRANSPORTE = {
    avion: { nombre: 'Avión', icono: '✈️', reservar: 'Reservar los vuelos' },
    micro: { nombre: 'Micro', icono: '🚌', reservar: 'Sacar los pasajes de micro' },
    auto: { nombre: 'Auto propio', icono: '🚗', reservar: 'Planificar la ruta en auto' },
    tren: { nombre: 'Tren', icono: '🚆', reservar: 'Sacar los pasajes de tren' },
    barco: { nombre: 'Barco / ferry', icono: '⛴️', reservar: 'Reservar el barco o ferry' }
  };

  const fases = [
    { id: 'definir', nombre: 'Definir el viaje', icono: '🧭', desc: 'Las bases: a dónde, cuándo, con quién y cuánto.' },
    { id: 'documentos', nombre: 'Documentación', icono: '🛂', desc: 'Lo que te deja (o no) subir al avión.' },
    { id: 'transporte', nombre: 'Cómo llegar', icono: '✈️', desc: 'El transporte principal, ida y vuelta.' },
    { id: 'alojamiento', nombre: 'Dónde dormir', icono: '🏡', desc: 'Tu base durante el viaje.' },
    { id: 'proteccion', nombre: 'Seguro y salud', icono: '🩺', desc: 'Viajar tranquilo es viajar cubierto.' },
    { id: 'dinero', nombre: 'Dinero', icono: '💳', desc: 'Cómo vas a pagar allá.' },
    { id: 'movilidad', nombre: 'Moverse en destino', icono: '🚕', desc: 'Traslados y transporte local.' },
    { id: 'experiencias', nombre: 'Experiencias', icono: '🌄', desc: 'Lo que vinieron a vivir.' },
    { id: 'conectividad', nombre: 'Conectividad', icono: '📶', desc: 'Datos, mapas y apps.' },
    { id: 'salida', nombre: 'Antes de salir', icono: '🧳', desc: 'Los últimos detalles.' },
    { id: 'regreso', nombre: 'Durante y al volver', icono: '🌅', desc: 'Cuentas claras y buenos recuerdos.' }
  ];

  const esInter = v => !!v.perfil.internacional;
  const req = v => R.requisitos.analizar(v);
  const paisesCon = (v, niveles) => req(v).porPais.filter(p => niveles.includes(p.nivel)).map(p => p.pais).join(', ');
  const usa = medio => v => R.recorrido.usaMedio(v, medio);

  const tareas = [
    /* ---------- Definir ---------- */
    {
      id: 'd_destino', fase: 'definir', titulo: 'Elegir destino(s) y fechas tentativas',
      desc: 'Decidí a dónde vas y una ventana aproximada de fechas. Es la base de todo el resto.',
      consejo: 'Si dudás entre dos destinos, compará precio de transporte y clima de esas fechas antes de decidir.',
      porque: 'Sin destino no se puede avanzar con nada más.',
      impacto: 5, anticipacion: 90, dependeDe: []
    },
    {
      id: 'd_participantes', fase: 'definir', titulo: 'Confirmar quiénes viajan',
      desc: 'Cerrá la lista de viajeros. Define cantidad de pasajes, tipo de alojamiento y cómo se dividen los gastos.',
      consejo: 'Cargalos en la pestaña Viajeros: así después podés dividir cuentas y queda el historial de con quién viajaste.',
      porque: 'Cambia la cantidad de pasajes, camas y cómo se reparten los gastos.',
      impacto: 4, anticipacion: 80, dependeDe: ['d_destino']
    },
    {
      id: 'd_fechas', fase: 'definir', titulo: 'Cerrar fechas firmes',
      desc: 'Pasá de fechas tentativas a fechas confirmadas: día de salida y de regreso.',
      consejo: 'Revisá feriados, vacaciones laborales y temporada alta del destino: mover un día puede cambiar mucho el precio.',
      porque: 'Destraba pasajes, alojamiento y casi todo lo demás.',
      impacto: 5, anticipacion: 75, dependeDe: ['d_destino', 'd_participantes']
    },

    /* ---------- Documentación ---------- */
    {
      id: 'doc_pasaporte', fase: 'documentos',
      titulo: 'Revisar el pasaporte de todos',
      desc: v => req(v).necesitaPasaporte
        ? `Para ${paisesCon(v, ['pasaporte', 'autorizacion', 'visa'])} se necesita pasaporte. Confirmá que esté vigente para todo el viaje (y unos meses más).`
        : `Para ${paisesCon(v, ['dni']) || 'este viaje'} alcanza con el DNI argentino vigente (tarjeta). Revisá que no esté vencido, también el de los menores.`,
      consejo: v => req(v).necesitaPasaporte
        ? 'Si hay que sacarlo o renovarlo, el trámite puede tardar semanas: es lo primero.'
        : 'El DNI tiene que ser la tarjeta vigente; la constancia de trámite en general no sirve para cruzar.',
      porque: v => req(v).necesitaPasaporte ? 'Si hay que renovarlo, es lo que más tarda y frena todo.' : 'Es rápido, pero sin documento vigente no se cruza.',
      impacto: v => req(v).necesitaPasaporte ? 5 : 3, anticipacion: v => req(v).necesitaPasaporte ? 90 : 7,
      dependeDe: [], aplica: v => req(v).necesitaPasaporte, docCategoria: 'identidad'
    },
    {
      id: 'doc_dni', rec: true, fase: 'documentos', titulo: 'Revisar que el DNI de todos esté vigente',
      desc: v => req(v).internacional ? `Para ${paisesCon(v, ['dni'])} alcanza con el DNI argentino vigente (la tarjeta). No hace falta pasaporte.` : 'Lo vas a necesitar para viajar y para registrarte en el alojamiento.',
      consejo: 'La constancia de DNI en trámite en general no sirve para cruzar fronteras. Revisá también el de los menores.',
      porque: 'Sin documento vigente no se viaja.',
      impacto: 3, anticipacion: 10, dependeDe: [], aplica: v => !req(v).necesitaPasaporte, docCategoria: 'identidad'
    },
    {
      id: 'doc_requisitos', fase: 'documentos',
      titulo: v => `Verificar requisitos de entrada a ${req(v).aVerificar.map(p => p.pais).join(', ')}`,
      desc: 'Tripbox no tiene los requisitos confirmados para este destino: revisalos en la fuente oficial.',
      consejo: 'Consultá siempre la Cancillería o el consulado del destino.',
      porque: 'Un requisito no cumplido puede dejarte sin embarcar.',
      impacto: 5, anticipacion: 75, dependeDe: ['d_destino'], aplica: v => req(v).aVerificar.length > 0
    },
    {
      id: 'doc_visa', fase: 'documentos',
      titulo: v => `Tramitar ${req(v).tramites.map(p => p.tramite || 'la visa de ' + p.pais).join(' y ')}`,
      desc: v => req(v).tramites.map(p => `${p.pais}: ${p.nota}`).join(' '),
      consejo: 'Hacelo apenas tengas el pasaporte al día. Guardá el comprobante en Documentos.',
      porque: v => req(v).tramites.some(p => p.nivel === 'visa') ? 'Los turnos y aprobaciones no dependen de vos: hay que empezar temprano.' : 'Es un trámite online, pero sin la autorización no te dejan embarcar.',
      impacto: 5, anticipacion: v => req(v).tramites.some(p => p.nivel === 'visa') ? 75 : 21,
      dependeDe: ['doc_pasaporte'], aplica: v => req(v).tramites.length > 0, docCategoria: 'identidad'
    },
    {
      id: 'doc_menores', fase: 'documentos', titulo: 'Autorización de viaje para menores',
      desc: 'Si viajan menores sin alguno de sus padres o tutores, puede hacer falta una autorización formal.',
      consejo: 'Averiguá qué formato se acepta para el destino y tramitalo con tiempo.',
      porque: 'Sin la autorización correcta, el menor puede no poder salir del país.',
      impacto: 5, anticipacion: 30, dependeDe: ['d_participantes'], aplica: v => !!v.perfil.menores, docCategoria: 'identidad'
    },
    {
      id: 'doc_licencia', fase: 'documentos', titulo: 'Licencia de conducir válida en destino',
      desc: 'En países del Mercosur la licencia argentina sirve; fuera de la región, revisá si necesitás el permiso internacional.',
      consejo: 'Llevá siempre la licencia original junto con el permiso internacional.',
      porque: 'Sin la licencia correcta no te entregan el auto alquilado.',
      impacto: 3, anticipacion: 30, dependeDe: [], aplica: v => req(v).necesitaPasaporte && !!v.perfil.alquilaAuto, docCategoria: 'identidad'
    },
    {
      id: 'doc_copias', rec: true, fase: 'documentos', titulo: 'Guardar copias digitales de los documentos',
      desc: 'Subí a Documentos fotos o PDFs de pasaporte, DNI, pasajes y reservas.',
      consejo: 'Si perdés algo durante el viaje, tener la copia a mano acelera cualquier trámite.',
      porque: 'Es rápido y te salva ante cualquier pérdida.',
      impacto: 2, anticipacion: 5, dependeDe: [], docCategoria: 'identidad'
    },

    /* ---------- Transporte ---------- */
    {
      id: 't_segmento', fase: 'transporte', porSegmento: true,
      titulo: (v, c) => (R.recorrido.MEDIOS[c.seg.medio] || R.recorrido.MEDIOS.otro).titulo(c.seg.desde.nombre, c.seg.hasta.nombre, c.seg),
      desc: (v, c) => `${R.recorrido.TIPOS_TRAMO[c.tipo]}${c.partes > 1 ? ` (parte ${c.indice + 1} de ${c.partes})` : ''}: ${c.seg.desde.nombre} → ${c.seg.hasta.nombre} en ${(R.recorrido.MEDIOS[c.seg.medio] || R.recorrido.MEDIOS.otro).nombre.toLowerCase()}.`,
      consejo: (v, c) => c.seg.medio === 'auto'
        ? 'Calculá no más de 8–9 horas de manejo por día y, si se puede, alterná conductores.'
        : 'Antes de pagar, revisá equipaje incluido, condiciones de cambio y escalas. Después subí el pasaje a Documentos.',
      porque: (v, c) => (R.recorrido.MEDIOS[c.seg.medio] || R.recorrido.MEDIOS.otro).porque,
      impacto: (v, c) => (R.recorrido.MEDIOS[c.seg.medio] || R.recorrido.MEDIOS.otro).impacto,
      anticipacion: (v, c) => (R.recorrido.MEDIOS[c.seg.medio] || R.recorrido.MEDIOS.otro).anticipacion,
      fechaBase: (v, c) => c.fecha || '',
      dependeDe: ['d_fechas', 'd_participantes'], docCategoria: 'pasaje'
    },
    {
      id: 'pq_paquete', fase: 'transporte', titulo: 'Cargar los datos del paquete',
      desc: 'Anotá qué incluye el paquete que compraste, la agencia, el código y los vouchers. Lo incluido queda resuelto en la guía.',
      consejo: 'Pedile a la agencia el detalle de vuelos, hoteles y traslados por escrito y subí los vouchers.',
      porque: 'Define qué ya está resuelto y qué falta organizar por tu cuenta.',
      impacto: 5, anticipacion: 45, dependeDe: [], aplica: v => !!v.perfil.paquete, docCategoria: 'reserva'
    },
    {
      id: 't_auto_revision', rec: true, fase: 'transporte', titulo: 'Poner el auto a punto',
      desc: 'Service, neumáticos (y auxilio), documentación del auto y seguro al día.',
      consejo: 'Si cruzás a otro país, revisá qué documentación extra del vehículo te piden.',
      porque: 'Un turno de taller puede demorar; mejor no dejarlo para último momento.',
      impacto: 3, anticipacion: 14, dependeDe: [], aplica: usa('auto')
    },
    {
      id: 't_asientos', rec: true, fase: 'transporte', titulo: 'Elegir asientos y revisar equipaje',
      desc: 'Seleccioná asientos y confirmá cuánto equipaje incluye tu tarifa (y si conviene sumar valija).',
      consejo: 'Sumar equipaje al reservar suele ser más barato que pagarlo en el aeropuerto.',
      porque: 'Detalle importante pero que se puede resolver más cerca de la fecha.',
      impacto: 2, anticipacion: 14, dependeDe: ['t_segmento'], aplica: usa('avion')
    },

    /* ---------- Alojamiento ---------- */
    {
      id: 'a_reserva', fase: 'alojamiento', porDestino: true,
      titulo: (v, c) => c.varios ? `Reservar alojamiento en ${c.destino.nombre}` : 'Reservar el alojamiento',
      desc: 'Elegí dónde vas a dormir cada noche del viaje.',
      consejo: 'Priorizá tarifas con cancelación gratuita: te dan margen si algo cambia. Subí la reserva a Documentos.',
      porque: 'Importante, pero suele tener más disponibilidad y cancelación flexible que el transporte.',
      impacto: 4, anticipacion: 45, dependeDe: ['d_fechas'], despuesDe: ['t_segmento'], docCategoria: 'reserva'
    },
    {
      id: 'a_confirmar', rec: true, fase: 'alojamiento', porDestino: true,
      titulo: (v, c) => c.varios ? `Confirmar check-in en ${c.destino.nombre}` : 'Confirmar reserva y horario de check-in',
      desc: 'Revisá que la reserva esté confirmada y avisá tu horario estimado de llegada.',
      consejo: 'Si llegás tarde de noche, avisalo: algunos lugares no tienen recepción 24 h.',
      porque: 'Evita sorpresas al llegar cansado.',
      impacto: 2, anticipacion: 7, dependeDe: ['a_reserva']
    },

    /* ---------- Seguro y salud ---------- */
    {
      id: 'p_seguro', fase: 'proteccion', titulo: 'Contratar seguro o asistencia al viajero',
      desc: 'Elegí una cobertura para todas las fechas del viaje (en algunos destinos es obligatoria).',
      consejo: 'Revisá si alguna de tus tarjetas ya incluye asistencia y qué cubre realmente antes de contratar otra.',
      porque: 'Te protege ante lo imprevisto; conviene contratarlo con fechas ya firmes.',
      impacto: 4, anticipacion: 15, dependeDe: ['d_fechas'], despuesDe: ['t_segmento'], aplica: esInter, docCategoria: 'seguro'
    },
    {
      id: 'p_vacunas', fase: 'proteccion',
      titulo: v => `Vacuna contra la fiebre amarilla (${req(v).fiebreAmarilla.map(x => x.region || x.lugar).join(', ')})`,
      desc: v => req(v).fiebreAmarilla.map(x => x.nota).join(' ') + ' Consultá en un vacunatorio o centro de medicina del viajero.',
      consejo: 'Tiene que aplicarse al menos 10 días antes de llegar. Si ya la tenés, buscá el certificado y subilo a Documentos.',
      porque: 'Necesita tiempo para hacer efecto antes del viaje.',
      impacto: 4, anticipacion: 30, dependeDe: ['d_destino'], aplica: v => req(v).fiebreAmarilla.length > 0, docCategoria: 'salud'
    },
    {
      id: 'p_botiquin', rec: true, fase: 'proteccion', titulo: 'Botiquín y medicación personal',
      desc: 'Prepará lo básico y tu medicación habitual para todos los días del viaje (y un poco más).',
      consejo: 'Llevá la medicación en el equipaje de mano, con la receta si corresponde.',
      porque: 'Rápido de resolver, pero imprescindible.',
      impacto: 2, anticipacion: 3, dependeDe: []
    },

    /* ---------- Dinero ---------- */
    {
      id: 'm_medios', rec: true, fase: 'dinero', titulo: 'Definir cómo vas a pagar',
      desc: 'Decidí qué tarjetas, efectivo y moneda vas a usar, y cuánto llevar de cada cosa.',
      consejo: 'Combiná al menos dos medios de pago distintos por si uno falla.',
      porque: 'Evita quedarte sin forma de pagar en destino.',
      impacto: 3, anticipacion: 14, dependeDe: []
    },
    {
      id: 'm_aviso', rec: true, fase: 'dinero', titulo: 'Habilitar tarjetas para usar en el exterior',
      desc: 'Revisá que tus tarjetas funcionen en el destino y avisá al banco si hace falta.',
      consejo: 'Anotá el teléfono del banco para emergencias fuera del país.',
      porque: 'Una tarjeta bloqueada en destino es un dolor de cabeza evitable.',
      impacto: 3, anticipacion: 7, dependeDe: ['m_medios'], aplica: esInter
    },
    {
      id: 'm_efectivo', rec: true, fase: 'dinero', titulo: 'Conseguir efectivo para los primeros días',
      desc: 'Tené algo de efectivo para traslados, propinas o lugares que no aceptan tarjeta.',
      consejo: 'Repartilo entre la billetera y otro lugar seguro.',
      porque: 'Útil al llegar, pero se resuelve sobre la fecha.',
      impacto: 2, anticipacion: 3, dependeDe: ['m_medios']
    },

    /* ---------- Movilidad ---------- */
    {
      id: 'mv_auto', fase: 'movilidad', titulo: 'Alquilar el auto',
      desc: 'Reservá el auto para los días que lo vas a usar.',
      consejo: 'Revisá qué cubre el seguro incluido, la franquicia y la política de combustible.',
      porque: 'En temporada alta los autos se agotan; mejor reservar con fechas firmes.',
      impacto: 3, anticipacion: 30, dependeDe: ['d_fechas'], despuesDe: ['t_segmento'],
      aplica: v => !!v.perfil.alquilaAuto, docCategoria: 'reserva'
    },
    {
      id: 'mv_traslado', fase: 'movilidad', titulo: 'Organizar el traslado al llegar',
      desc: 'Definí cómo vas del aeropuerto o terminal al alojamiento (y viceversa al volver).',
      consejo: 'Si llegás de noche, conviene tenerlo reservado de antemano.',
      porque: 'Necesita saber horarios de llegada y dirección del alojamiento.',
      impacto: 3, anticipacion: 7, dependeDe: ['a_reserva'], despuesDe: ['t_segmento'],
      aplica: v => v.perfil.transporte !== 'auto'
    },
    {
      id: 'mv_local', rec: true, fase: 'movilidad', titulo: 'Investigar el transporte local',
      desc: 'Averiguá cómo moverte allá: apps, tarjetas de transporte, horarios y zonas.',
      consejo: 'Muchas ciudades tienen pases turísticos que combinan transporte y museos.',
      porque: 'Útil, pero se puede resolver incluso durante el viaje.',
      impacto: 1, anticipacion: 5, dependeDe: ['d_destino']
    },

    /* ---------- Experiencias ---------- */
    {
      id: 'e_imperdibles', rec: true, fase: 'experiencias', titulo: 'Armar la lista de imperdibles',
      desc: 'Anotá lugares, comidas y experiencias que no te querés perder.',
      consejo: 'Separá lo que necesita reserva de lo que se puede improvisar.',
      porque: 'Te ayuda a detectar qué hay que reservar con anticipación.',
      impacto: 2, anticipacion: 30, dependeDe: ['d_destino']
    },
    {
      id: 'e_excursiones', fase: 'experiencias', titulo: 'Reservar excursiones y entradas con cupo',
      desc: 'Reservá lo que tiene cupo limitado o se agota: excursiones, museos, espectáculos.',
      consejo: 'Revisá la política de cancelación y subí los comprobantes a Documentos.',
      porque: 'Depende de las fechas y conviene saber dónde vas a estar parando.',
      impacto: 3, anticipacion: 21, dependeDe: ['d_fechas'], despuesDe: ['e_imperdibles', 'a_reserva'], docCategoria: 'excursion'
    },
    {
      id: 'e_escapada', fase: 'experiencias', porEscapada: true,
      titulo: (v, c) => `Organizar la escapada a ${c.destino.nombre}`,
      desc: 'Aunque sea por el día: cómo ir y volver, cruce de frontera, documentación y horarios.',
      consejo: 'Si cruzás a otro país, llevá el documento original de todos (también de los menores) y revisá el horario de la frontera.',
      porque: 'Un cruce de un día también necesita documentación y logística.',
      impacto: 3, anticipacion: 14, dependeDe: ['d_fechas'], despuesDe: ['a_reserva']
    },
    {
      id: 'e_itinerario', rec: true, fase: 'experiencias', titulo: 'Armar el itinerario día por día',
      desc: 'Distribuí actividades en los días del viaje en la pestaña Itinerario.',
      consejo: 'Dejá huecos libres: los mejores momentos muchas veces son los no planeados.',
      porque: 'Ordena todo lo anterior; se arma mejor con transporte y alojamiento definidos.',
      impacto: 2, anticipacion: 10, dependeDe: ['d_fechas'], despuesDe: ['t_segmento', 'a_reserva', 'e_excursiones']
    },

    /* ---------- Conectividad ---------- */
    {
      id: 'c_datos', rec: true, fase: 'conectividad', titulo: 'Resolver internet en destino',
      desc: 'Elegí entre roaming, eSIM o chip local para tener datos desde que llegás.',
      consejo: 'Verificá que tu teléfono sea compatible con eSIM antes de comprar una.',
      porque: 'Al llegar vas a necesitar mapas y comunicarte.',
      impacto: 2, anticipacion: 7, dependeDe: ['d_fechas'], aplica: esInter
    },
    {
      id: 'c_offline', rec: true, fase: 'conectividad', titulo: 'Descargar mapas offline y apps útiles',
      desc: 'Bajá mapas del destino, apps de transporte, traductor y lo que vayas a usar.',
      consejo: 'Hacelo con wifi en casa: pesan bastante.',
      porque: 'Rápido y te salva si te quedás sin señal.',
      impacto: 1, anticipacion: 3, dependeDe: ['d_destino']
    },

    /* ---------- Situaciones especiales ---------- */
    {
      id: 'x_mascota_viaja', fase: 'documentos', titulo: 'Requisitos para viajar con tu mascota',
      desc: 'Certificado veterinario, vacunas, transportadora y reglas del transporte y del alojamiento.',
      consejo: 'Cada aerolínea y país tiene reglas propias para mascotas; confirmá cupo y medidas de la transportadora.',
      porque: 'Sin la documentación de la mascota no te dejan embarcarla.',
      impacto: 5, anticipacion: 30, dependeDe: ['d_destino'], aplica: v => !!v.perfil.viajaConMascota, docCategoria: 'salud'
    },
    {
      id: 'x_accesibilidad', fase: 'proteccion', titulo: 'Confirmar accesibilidad y asistencia',
      desc: 'Pedí asistencia en aeropuertos o terminales y confirmá que el alojamiento y las actividades sean accesibles.',
      consejo: 'La asistencia especial suele pedirse con al menos 48 h de anticipación.',
      porque: 'Asegura que todos viajen cómodos y sin sorpresas.',
      impacto: 4, anticipacion: 21, dependeDe: [], despuesDe: ['t_segmento', 'a_reserva'], aplica: v => !!v.perfil.accesibilidad
    },
    {
      id: 'x_equipo', fase: 'experiencias', titulo: 'Reservar equipo y clases',
      desc: 'Alquiler de equipo (ski, buceo, bici…), pases o clases.',
      consejo: 'En temporada alta el equipo de alquiler y las clases se agotan: reservá con tiempo.',
      porque: 'Tiene cupo limitado en temporada.',
      impacto: 3, anticipacion: 21, dependeDe: ['d_fechas'], aplica: v => !!v.perfil.equipamiento
    },
    {
      id: 'x_evento', fase: 'experiencias', titulo: 'Organizar el momento especial',
      desc: 'Cumpleaños, aniversario, casamiento: reservas, regalo, sorpresa o vestimenta.',
      consejo: 'Si es una sorpresa, coordiná con el alojamiento o el restaurante con anticipación.',
      porque: 'Es lo que más se recuerda del viaje.',
      impacto: 3, anticipacion: 21, dependeDe: ['d_fechas'], aplica: v => !!v.perfil.eventoEspecial
    },
    {
      id: 'x_rendicion', fase: 'regreso', titulo: 'Rendir los gastos del viaje de trabajo',
      desc: 'Juntá facturas y comprobantes y presentá la rendición.',
      consejo: 'Sacale foto a cada comprobante en el momento y subilo a Documentos.',
      porque: 'Los plazos de rendición suelen ser cortos.',
      impacto: 3, anticipacion: 5, ref: 'fin', dependeDe: [], aplica: v => v.tipo === 'trabajo'
    },

    /* ---------- Antes de salir ---------- */
    {
      id: 's_mascotas', fase: 'salida', titulo: 'Organizar el cuidado de las mascotas',
      desc: 'Definí quién las cuida o reservá guardería/cuidador.',
      consejo: 'Dejá anotado alimentación, veterinario y un contacto de emergencia.',
      porque: 'Los buenos cuidadores se reservan con tiempo, sobre todo en temporada.',
      impacto: 4, anticipacion: 21, dependeDe: ['d_fechas'], aplica: v => !!v.perfil.mascotas
    },
    {
      id: 's_checkin', fase: 'salida', porSegmento: true, soloMedio: 'avion',
      titulo: (v, c) => `Check-in online: ${c.seg.desde.nombre} → ${c.seg.hasta.nombre}`,
      desc: 'Se habilita normalmente entre 24 y 48 h antes del vuelo. Hasta entonces queda en tus pendientes.',
      consejo: 'Guardá la tarjeta de embarque en el teléfono y subila a Documentos.',
      porque: 'Tiene una ventana de tiempo concreta antes del vuelo.',
      impacto: 3, anticipacion: 1, ventanaDias: 2, fechaBase: (v, c) => c.fechaVuelo || c.fecha || '',
      dependeDe: ['t_segmento'], docCategoria: 'pasaje'
    },
    {
      id: 's_casa', rec: true, fase: 'salida', titulo: 'Dejar la casa lista',
      desc: 'Plantas, heladera, llaves, luces, servicios y quién puede pasar ante cualquier cosa.',
      consejo: 'Un temporizador de luz da sensación de casa habitada.',
      porque: 'Te vas tranquilo sabiendo que todo queda en orden.',
      impacto: 2, anticipacion: 2, dependeDe: []
    },
    {
      id: 's_valija', rec: true, fase: 'salida', titulo: 'Armar la valija',
      desc: 'Prepará ropa según el clima, cargadores, adaptadores y lo esencial en el equipaje de mano.',
      consejo: 'En el equipaje de mano: documentos, medicación, cargador y una muda de ropa.',
      porque: 'Se hace sobre la fecha, con el pronóstico a mano.',
      impacto: 2, anticipacion: 1, dependeDe: []
    },
    {
      id: 's_repaso', rec: true, fase: 'salida', titulo: 'Repasar documentos y horarios del primer día',
      desc: 'Revisá que tengas todo: documentos, reservas, horarios de salida y cómo llegar al alojamiento.',
      consejo: 'Calculá con margen el horario para salir hacia el aeropuerto o terminal.',
      porque: 'El último control antes de salir.',
      impacto: 3, anticipacion: 1, dependeDe: ['a_reserva'], despuesDe: ['t_segmento']
    },

    /* ---------- Durante y al volver ---------- */
  ];

  /** Motivos de cambio de planes y el paso raíz que afectan. */
  const motivosCambio = [
    { id: 'fechas', nombre: 'Cambiaron las fechas', icono: '📅', afecta: ['d_fechas'] },
    { id: 'destino', nombre: 'Cambió el destino', icono: '🧭', afecta: ['d_destino'] },
    { id: 'transporte', nombre: 'Se canceló o cambió el vuelo / transporte', icono: '✈️', afecta: ['t_segmento', 'pq_paquete'] },
    { id: 'alojamiento', nombre: 'Se cayó o cambió el alojamiento', icono: '🏡', afecta: ['a_reserva', 'pq_paquete'] },
    { id: 'participantes', nombre: 'Cambiaron los viajeros', icono: '👥', afecta: ['d_participantes'] }
  ];

  const ESTADOS = {
    pendiente: { nombre: 'Pendiente', clase: 'est-pendiente' },
    en_curso: { nombre: 'En curso', clase: 'est-curso' },
    revisar: { nombre: 'A revisar', clase: 'est-revisar' },
    hecha: { nombre: 'Hecha', clase: 'est-hecha' },
    no_aplica: { nombre: 'No aplica', clase: 'est-noaplica' }
  };

  function fase(id) { return fases.find(f => f.id === id) || { id, nombre: 'Otros', icono: '📌' }; }

  return { TRANSPORTE, fases, tareas, motivosCambio, ESTADOS, fase };
})();
