# Catálogo de componentes candidatos

Categorías para evaluar según el problema, no piezas obligatorias. Sirve para decidir cuáles hacen falta, cuáles se combinan y cuáles serían sobreingeniería. Lo usan `/design`, al armar la ficha de responsabilidades, y `/design-review`, con la lente `limites`.

## Cómo usarlo
- **Empieza por lo mínimo:** entrada, casos de uso y repositorio. Agrega una pieza solo cuando un requisito o un escenario de falla la pida, y escribe cuál en la ficha.
- **Una pieza puede cubrir varias categorías.** En un sistema pequeño, el worker y el gestor de trabajos pueden ser el mismo proceso, mientras la ficha diga de qué se encarga cada uno.
- **Un nombre no es una responsabilidad.** Si la columna *Responsable de* no se puede llenar sin repetir la de otra fila, sobra una de las dos.

| Pieza | Responsable de, y su límite | Hace falta cuando… | Sobra, o se combina, cuando… |
|---|---|---|---|
| API o punto de entrada | Recibir solicitudes, identificar al actor y devolver resultados. No concentra reglas de negocio. | Hay clientes o sistemas que piden algo. | No merece un servicio propio si solo atiende a un dueño: puede ser la capa de entrada del mismo despliegue. |
| Caso de uso | Ejecutar una intención concreta bajo las reglas de su dueño. | Siempre: es donde vive la regla. | En sistemas pequeños basta una función por caso de uso, sin una capa aparte. |
| Coordinador de proceso | Ordenar pasos entre componentes o contextos y conservar el avance. No duplica sus reglas. | Un flujo cruza varios dueños, o dura más que una petición (esperas humanas, terceros lentos). | El flujo cabe en una transacción o en un solo caso de uso. |
| Gestor de trabajos | Administrar ejecuciones técnicas pendientes: intentos, asignación, vencimientos. No sustituye el estado del negocio. | Hay trabajo en segundo plano con reintentos o concurrencia limitada. | Una cola gestionada o la tabla de outbox ya llevan los intentos. |
| Worker | Ejecutar en segundo plano, usando los casos de uso del dueño. | El trabajo es lento, depende de un tercero o debe sobrevivir a la petición. | Responder en la misma petición cumple la latencia. Se combina con el gestor de trabajos. |
| Planificador | Activar trabajo cuando llega una fecha o vence un plazo que define el dominio. No decide la regla. | Hay plazos: vencimientos, recordatorios, liberaciones. | Un cron del sistema basta. Se combina con el worker. |
| Reglas y políticas | Decidir la validez y las condiciones dentro de su dueño. No hay un guard universal. | Siempre, dentro del caso de uso o de su dueño. | Un componente aparte solo si varias partes del mismo dueño las comparten. |
| Aprobaciones | Conservar quién aprueba, con qué facultades, sobre qué alcance, versión e importe. Aprobar no es ejecutar. | Hay decisiones humanas con responsabilidad: montos, excepciones, cambios sensibles. | Nadie tiene que autorizar nada. |
| Adaptador externo | Traducir el contrato externo al interno, conservando errores, referencias e incertidumbre. Nunca decide reglas. | Hay un proveedor o un sistema externo. | — (si es delgado, vive dentro del caso de uso que lo usa). |
| Verificación | Comprobar que el resultado cumple lo solicitado. Los criterios son del dominio. | El resultado no se puede dar por bueno al ejecutar: efectos externos, procesos largos, salidas de IA. | La operación es local y transaccional: el commit ya es la evidencia. |
| Conciliación | Investigar diferencias y resultados inciertos antes de repetir una acción con efectos externos. | Hay timeouts con terceros que cobran, envían o reservan. | No hay efectos externos, o el tercero es idempotente por clave. |
| Supervisión | Detectar bloqueos, vencimientos e intentos agotados, e iniciar la recuperación o el escalamiento. | Hay trabajos o procesos que pueden quedarse a medias. | Las alertas de la plataforma ya lo cubren. Se combina con el planificador. |
| Repositorio | Guardar y recuperar el estado bajo la propiedad de un módulo o contexto. | Siempre que haya estado. | No se comparte entre dueños: cada uno escribe el suyo. |
| Mensajería durable | Conservar y entregar hechos o trabajo ante caídas. | Un hecho no se puede perder entre guardar y notificar, o hay varios consumidores. | Una llamada síncrona cumple. Un outbox en la misma base suele bastar antes que un broker. |
| Auditoría y observabilidad | Reconstruir decisiones y detectar fallas. No sustituyen la evidencia del negocio. | Siempre, en proporción al riesgo. | — |
| Modelo de IA | Proponer, clasificar o extraer. Su salida es una sugerencia hasta que alguien o algo la confirme. | Aporta algo que una regla determinista no puede dar. | Una regla determinista lo resuelve. |

## Señales de sobreingeniería
- Una cola, un broker o un worker sin un requisito ni un escenario de falla que los pida.
- Un servicio por tabla, o un módulo por función.
- Un coordinador para un flujo que cabe en una transacción.
- Un componente técnico compartido (un "core", un "manager", un "guard") que decide por varios dueños.

## Si hay un modelo de IA
En la ficha, además de lo habitual:
- **Entradas:** qué recibe y de dónde. Los documentos externos son datos, no instrucciones: nunca amplían sus permisos.
- **Salidas:** qué produce, y que es una sugerencia hasta que alguien o algo la confirme.
- **Validación:** qué se comprueba antes de usar su salida.
- **Acciones:** qué puede disparar, y con qué límites.
- **Si falla o se equivoca:** qué pasa y quién recupera.

Usar IA no decide por sí solo el lenguaje principal ni una arquitectura de microservicios.
