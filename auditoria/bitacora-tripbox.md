# Tripbox — Bitácora del proyecto

Organizador de viajes paso a paso. Vanilla HTML/CSS/JS, misma filosofía que DBTYCS.
Nombre elegido: **Tripbox** (trip + box: el viaje y la caja donde se guarda y organiza todo).
Nota: existen otras apps llamadas "Tripbox" (ej. una de una agencia de Brasil); revisar marca/dominio antes de un lanzamiento público.

## Estado actual — v3 (19/10/2026)

### Estructura
```
index.html               Estructura base y carga de scripts
styles.css               Estilos (arena, mar y atardecer; modo oscuro automático)
main.js                  Arranque, sesión, rutas (#inicio, #viaje/{id}/{pestaña}, #personas) y pantalla de inicio
js/utilidades.js         Fechas, formato, modales, avisos, avatares, anillo de progreso
js/almacenamiento.js     Capa de datos por usuario (localStorage + IndexedDB para archivos). Punto a cambiar para Firestore/Storage
js/autenticacion.js      Registro, ingreso, Mi cuenta (local con hash SHA-256 + sal). Punto a cambiar para Firebase Auth
js/lugares.js            Autocompletado de lugares con país/provincia/coordenadas (geocodificador gratuito de Open-Meteo)
js/paisajeviaje.js       Ilustración personalizada por transporte, progreso e hitos
js/formulariospasos.js   Formularios paso a paso de cada paso de la guía (generan itinerario, gastos y documentos)
js/plantillaguia.js      Fases y pasos de la guía, motivos de cambio de planes, estados
js/motorprioridad.js     Motor de prioridades, progreso y reorganización por cambio de planes
js/viajes.js             Asistente de 5 pasos (crear/editar), portada y pestañas del viaje, tarjetas
js/vistaguia.js          Pestaña Guía: próximo paso, lo que sigue, fases, detalle, pasos propios, cambio de planes
js/itinerario.js         Pestaña Itinerario día por día
js/documentos.js         Pestaña Documentos (archivos en IndexedDB, vinculados a pasos)
js/gastos.js             Pestaña Gastos: gastos, ingresos, pagos, saldos y transferencias mínimas
js/participantes.js      Pestaña Viajeros + pantalla Compañeros (historial de con quién viajaste)
```
Nombres de archivo únicos en todo el proyecto.

### Cómo decide la prioridad (motorprioridad.js)
Puntaje = impacto × 12 + urgencia + destraba × 5 − espera sugerida + bonus (a revisar / en curso).
- **Impacto (1–5)**: cuánto cuesta cambiarlo / qué tan escaso es (vuelos 5, alojamiento 4, excursiones 3…).
- **Urgencia**: según la fecha recomendada (días antes de salir). Atrasados suben fuerte.
- **dependeDe**: bloquea (no se puede hacer antes).
- **despuesDe**: no bloquea, pero conviene después (ej. alojamiento después de vuelos).
- Cada paso explica "¿Por qué ahora?" con razones legibles.

### Cambio de planes
Motivos: fechas, destino, transporte, alojamiento, viajeros, presupuesto.
Reabre el paso raíz y, en cadena, todo lo ya hecho que dependía de él (estado "A revisar").
Arma un plan ordenado respetando dependencias y prioridad. Ej. cambio de fechas →
vuelos → alojamiento → auto → excursiones → itinerario. Queda en el historial de cambios del viaje.
También se dispara al editar fechas/destino desde "Editar viaje" y al cambiar viajeros con reservas hechas.

### Decisiones
- Datos locales por ahora (localStorage); archivos adjuntos en IndexedDB (localStorage no aguanta archivos).
- Copia de seguridad JSON (no incluye archivos adjuntos).
- Monedas: cada movimiento puede tener su moneda y cotización a la moneda principal del viaje.
- Ingreso = reintegro recibido por alguien y que corresponde a varios (reduce el gasto de esos).
- Una persona con movimientos no se puede quitar del viaje (rompería las cuentas).

### Verificado
- v3: 60 controles automáticos (cuenta y aislamiento entre usuarios, asistente multidestino, paquete, formularios,
  gastos generados en otra moneda, no duplicación, estados, cambio de planes, itinerario por destino) + capturas reales.
- v1: prueba automática (jsdom) de todos los flujos: asistente, guía, cambio de planes, notas, pasos propios,
  pestañas, itinerario, documentos, gastos (iguales, montos distintos, USD, ingreso), saldos suman cero,
  transferencias mínimas, compañeros, viaje internacional, persistencia y borrado.
- Capturas en navegador real (escritorio y móvil) sin errores de consola.

### v3 — novedades
- **Cuenta**: registro con nombre, apellido, mail y contraseña; el nombre es "vos" en toda la app. Datos separados por usuario
  (clave `tripbox_datos_v1_{uid}`). "Olvidé mi contraseña" explica que funcionará con Firebase.
- **Lugares**: al escribir una ciudad se sugieren lugares con bandera; país, provincia y coordenadas se completan solos.
  Sin conexión, el campo sigue funcionando y pide el país a mano.
- **Multidestino**: varios destinos en orden + escapadas de un día (sin alojamiento). Noches por destino → fechas de cada tramo.
  La guía repite pasos por destino (alojamiento, confirmar check-in), agrega "Cómo ir de A a B" por tramo y "Organizar la escapada".
  Un paso de un destino solo espera al paso equivalente del mismo destino.
- **Salir del país**: se detecta solo comparando país de origen y destinos (incluye escapadas, ej. Cataratas → Brasil);
  se puede corregir a mano. Pregunta reformulada: "¿Salís del país en algún momento del viaje?".
- **Algo más**: 7 situaciones (auto, menores, mascota que viaja, mascotas en casa, accesibilidad, deportes con equipo,
  evento especial) + texto libre que se convierte en pasos propios. Viaje de trabajo suma "Rendir gastos".
- **Lo resuelto / paquete**: al crear el viaje se indica qué ya está resuelto (paquete y qué incluye, vuelos, alojamiento,
  seguro, auto, traslados, excursiones). Quedan hechos con "Faltan datos" y la guía prioriza lo que falta.
  Paso nuevo "Cargar los datos del paquete"; lo incluido no pide costo.
- **Viajeros**: cada viaje arranca solo con vos; los compañeros previos aparecen como sugerencia al escribir (mismo historial).
- **Estados**: próximo paso con Listo / Empezar / Volver a pendiente / No aplica y estado visible.
- **Formularios por paso**: Listo abre una carga paso a paso (vuelos por tramo con aerolínea, n° de vuelo, horarios,
  escalas, código, equipaje; alojamiento; seguro; auto; traslados; excursiones; escapada; internet; pasaporte; visa;
  vacunas; mascotas; evento; paquete…), luego Costo (moneda, cotización, quién pagó, entre quiénes) y Archivos.
  Genera eventos en el itinerario, el gasto y los documentos. Volver a guardar reemplaza lo generado (no duplica).
  "Marcar listo sin cargar datos" deja el paso en "Completá los datos" (con opción "No hace falta").
- **Diseño personalizado**: escena según transporte (avión con ruta y nubes, auto/micro en ruta, tren en vías, barco en el mar),
  el sol sube con el progreso, aparecen casita (alojamiento), banderita (experiencias) y pájaros (100%).
  Se ve en la portada del viaje, tarjetas, destacado, inicio y el encabezado del asistente (cambia mientras lo armás).

## Próximos pasos sugeridos (roadmap)
1. **Firebase**: Auth + Firestore (viajes/personas) + Storage (documentos), igual que DBTYCS.
2. **Viajes compartidos**: invitar a los compañeros para que vean el viaje y carguen sus gastos.
3. **Checklist de valija** inteligente según clima, duración y tipo de viaje.
4. **Escaneo de reservas con IA** (como Análisis de Sangre en DBTYCS): foto/PDF de pasaje o reserva →
   completa itinerario, documento y marca el paso.
5. **Varios destinos por viaje** (tramos), con alojamiento por tramo.
6. **Recordatorios** (notificaciones) cuando un paso se acerca a su fecha recomendada.
7. **Cotización automática** de monedas al cargar gastos.
8. **Plantillas por tipo de viaje** (mochilero, crucero, trabajo, con chicos) y pasos propios reutilizables.
9. **Estadísticas del viajero**: países, km, gastos por viaje, compañeros frecuentes.
10. **PWA**: instalable en el celular y uso sin conexión (clave durante el viaje).

## Historial
- v1 — 19/10/2026: primera versión completa (como "Rumbo").
- v3 — 19/10/2026: cuenta de usuario, lugares con país automático, multidestino y escapadas, salida del país detectada,
  más situaciones + texto libre, paquete y lo ya resuelto, viajeros por viaje, estados Pendiente/En curso, formularios
  completos por paso, paisaje personalizado.
- v2 — 19/10/2026: renombrado a Tripbox (textos, títulos, logo de valija/caja con sol, favicon, claves de guardado `tripbox_datos_v1` y `tripbox_archivos`).
