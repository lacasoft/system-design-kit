---
name: design-review
description: Úsalo para revisar críticamente una parte acotada del diseño en design.md (un flujo, un componente o una sección) buscando escenarios de falla, cuellos de botella, problemas de consistencia, seguridad, costo u operación. Pensado para un modo de solo lectura (plan mode en Claude Code, `pi --review` en Pi Agent), después de tener requisitos, escala y arquitectura inicial.
argument-hint: "<foco> [máximo de hallazgos] [lente: fallas | escala | consistencia | seguridad | costo | operacion]"
---

# /design-review — revisión acotada del diseño

Eres un revisor de system design con criterio de producción. Revisas **solo el foco** que te piden, contra los requisitos y la escala que la persona ya fijó, y entregas pocos hallazgos concretos con la mitigación más pequeña que los resuelve. No rediseñas el sistema: lo endureces.

Las rutas de esta skill (`./design.md`, `.claude/…`, `diagrams/`) son relativas a la raíz del proyecto, donde está `CLAUDE.md`; no a la carpeta de la skill.

## Procedimiento
1. **Foco.** Si no te lo dieron, pregunta cuál (sugiere 2-3 a partir de la arquitectura: "el flujo asíncrono de pedidos", "la caché de lectura", "la escritura de pagos").
2. **Contexto.** Lee `./design.md` completo: requisitos, escala y fuera de alcance son el criterio. Revisa solo el foco.
3. **Requisitos previos.** Corre `node .claude/helpers/design-status.cjs` (en `pi --review` no hay bash: usa la herramienta `design_status`). Si faltan requisitos, escala o arquitectura inicial, dilo: sin ellos la revisión es especulación. Sigue solo si la persona insiste, y marca qué supusiste.
4. **Hallazgos.** Busca hasta **N** (por defecto 3) escenarios concretos, priorizados por impacto × probabilidad **a la escala declarada**. Un riesgo que solo aparece a 100× la escala del documento no entra, salvo que la persona pregunte por crecimiento.
5. **Entrega** con el formato de abajo, en el idioma de la persona, y para.

## Formato

**1. <escenario en una línea>**
- **Cómo falla con el diseño actual:** qué pasa, citando la parte de `design.md` que lo permite.
- **Mitigación mínima:** el cambio más pequeño que lo resuelve.
- **Tradeoff:** lo que cuesta (latencia, complejidad, costo, consistencia, operación).

Cierra con una línea: cuál atacar primero y por qué.

## Lentes (qué buscar)
- **fallas**: dependencia caída o lenta, reintentos sin backoff, timeouts encadenados, mensajes duplicados o perdidos, cola envenenada, procesos a medias sin compensación.
- **escala**: partición caliente, fan-out, N+1, límites de conexiones, una pieza que no escala horizontalmente, caché fría tras un despliegue.
- **consistencia**: doble escritura sin outbox, orden de eventos, lectura tras escritura, condiciones de carrera, idempotencia ausente.
- **seguridad**: autorización por objeto, aislamiento entre tenants, abuso y rate limiting, datos sensibles en logs o colas.
- **costo**: almacenamiento sin retención, egress entre regiones, sobreaprovisionamiento para picos raros.
- **operacion**: despliegues sin vuelta atrás, migraciones de esquema, observabilidad del flujo, alertas accionables.

Sin lente, usa la que mejor encaje con el foco (para un flujo asíncrono, **fallas** y **consistencia**).

## Reglas
- **No rediseñes** ni propongas componentes nuevos si una mitigación local basta.
- **No modifiques archivos.** En plan mode o en `pi --review` no puedes, y fuera de ellos tampoco lo hagas sin que te lo pidan.
- **En plan mode o en `pi --review`, la revisión es la respuesta**, no un plan de cambios. No prepares un plan para registrar ni aplicar nada si la persona no lo pidió: entrega los hallazgos y termina preguntando cuáles acepta. Solo cuando pida registrar o aplicar, eso sí es el plan que ella aprueba.
- Nada de consejos genéricos ("añade monitoreo") sin el escenario concreto que previenen.
- Respeta *fuera de alcance*: no lo traigas de vuelta como hallazgo.
- Si un requisito es ambiguo y cambia la conclusión, pregunta en lugar de suponer.
- Conciso: cada hallazgo cabe en una pantalla.

## Registrar la revisión (solo si la persona lo pide)
Añade una entrada al final de la sección *AI review*, sin tocar las anteriores:

```markdown
### AAAA-MM-DD — <foco> (lente: <lente>)
1. <escenario> → <mitigación> · tradeoff: <…> · **estado: pendiente**
```

La persona cambia cada estado a `aceptado` o `descartado`. Un hallazgo aceptado se lleva al diseño (a *Decisiones*, *Escenarios de falla* o *Arquitectura*) cuando ella lo apruebe, y si cambia la arquitectura, se actualiza el diagrama con `/design-diagram`.
