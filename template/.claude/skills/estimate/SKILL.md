---
name: estimate
description: Úsalo para hacer estimaciones de capacidad (back-of-the-envelope) de un diseño — QPS medio y pico, almacenamiento, ancho de banda, tamaño de caché o número de instancias — a partir de usuarios, patrones de uso y tamaños de datos.
argument-hint: "[qué estimar: qps | almacenamiento | ancho de banda | caché | todo]"
---

# /estimate — estimaciones de capacidad

Haces cuentas de servilleta que sirven para **decidir**, no para impresionar. Cada número sale de una fórmula visible y de supuestos marcados; el resultado se redondea al orden de magnitud y se traduce en una implicación de diseño. Una estimación sin implicación no sirve.

Las rutas de esta skill (`./design.md`, `.claude/…`, `diagrams/`) son relativas a la raíz del proyecto, donde está `CLAUDE.md`; no a la carpeta de la skill.

## Datos de entrada
Tómalos de *Requisitos* y *Escala y supuestos* en `./design.md`. Pregunta solo lo que falte, una cosa a la vez: usuarios activos al día, acciones por usuario al día (lecturas y escrituras), tamaño medio de cada objeto, retención, factor de pico, crecimiento esperado.

## Fórmulas

| Métrica | Cálculo |
|---|---|
| Escrituras/s (media) | usuarios activos/día × escrituras por usuario/día ÷ 86 400 |
| Lecturas/s (media) | escrituras/s × ratio lectura:escritura |
| Pico | media × factor de pico (2-3 habitual; 10 o más en eventos o lanzamientos) |
| Almacenamiento | escrituras/día × tamaño × días de retención × réplicas, más un margen para índices y metadatos (supuesto) |
| Ancho de banda | QPS × tamaño medio de la respuesta (o de la petición, para la entrada) |
| Caché | fracción caliente de los datos leídos al día (la regla 80/20 es el punto de partida, supuesto) |
| Instancias | QPS pico ÷ capacidad medida por instancia, más el margen para perder una zona |

## Constantes útiles
- 1 día ≈ 86 400 s ≈ 10⁵ s. 1 mes ≈ 2.6 × 10⁶ s. 1 año ≈ 3.15 × 10⁷ s.
- 1 KB = 10³ B, 1 MB = 10⁶ B, 1 GB = 10⁹ B, 1 TB = 10¹² B (en cuentas rápidas, potencias de 10).
- Órdenes de magnitud de latencia para razonar, no para prometer: memoria ~100 ns; lectura aleatoria en SSD ~decenas a cientos de µs; ida y vuelta dentro de un datacenter ~0.5 ms; entre continentes ~100-150 ms.
- La capacidad por instancia (escrituras/s de una base, peticiones/s de un servicio) depende del hardware, la consulta y la configuración: trátala como **supuesto a medir**, nunca como dato.

## Formato de salida

| Métrica | Cálculo | Resultado |
|---|---|---|
| Escrituras/s | 1 M usuarios × 2 / 86 400 | ~23/s (pico ×3 ≈ 70/s) |
| … | … | … |

**Supuestos:** lista corta, cada uno marcado `(supuesto)`.

**Implicaciones:** 2-3 líneas que conecten los números con el diseño ("~70 escrituras/s en pico caben de sobra en una base relacional con una réplica; las ~7 000 lecturas/s piden una caché delante").

## Reglas
- Redondea: 23 148/s se escribe "~23 000/s". La precisión falsa da una seguridad que no existe.
- Muestra siempre la aritmética; la persona tiene que poder rehacerla.
- Señala qué supuesto mueve más el resultado (sensibilidad): "si el ratio lectura:escritura es 1 000:1 y no 100:1, las lecturas en pico pasan de ~7 000/s a ~70 000/s".
- Si lo invocan desde `/design` o la persona lo acepta, escribe la tabla en *Escala y supuestos*; si no, solo muéstrala.
