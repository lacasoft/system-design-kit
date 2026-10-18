# System Design Kit — taller de diseño de sistemas con Claude Code

Convierte una carpeta en un **taller de System Design**: Claude te entrevista sección por sección,
va escribiendo `design.md` con tus respuestas, hace las cuentas de capacidad, dibuja los
diagramas y, cuando el diseño tiene base, lo revisa contigo en **plan mode** sin tocar nada hasta
que apruebes.

El diseño es tuyo. Claude pregunta, registra, calcula y critica; no diseña por ti salvo que le
pidas opciones.

## Instalar

En una carpeta vacía (una por diseño):

```bash
mkdir acortador-urls && cd acortador-urls
npx -y github:lacasoft/system-design-kit#v1.0.0                      # pregunta idioma y título
npx -y github:lacasoft/system-design-kit#v1.0.0 --lang en --title "URL shortener" --yes
```

Crea:

```
.
├── design.md                  # el documento: 8 secciones, en español o inglés
├── CLAUDE.md                  # importa las reglas del kit y design.md (Claude lo tiene siempre en contexto)
└── .claude/
    ├── design-kit.md          # reglas del taller: roles, idioma, modos, cómo escribir
    ├── settings.json          # hooks (estado al abrir sesión, guard de estructura) y statusline
    ├── helpers/design-status.cjs
    └── skills/                # 4 skills: design, estimate, design-diagram, design-review
```

## Cómo se trabaja

> **La primera vez**, abre Claude Code en modo interactivo dentro de la carpeta y acepta el diálogo
> de confianza. Hasta entonces Claude Code ignora el permiso del kit para correr su helper y te
> pedirá aprobarlo en cada uso.

### 1. Construir el documento — `/design`

Abre Claude Code en la carpeta y corre `/design`. Te pregunta **una cosa a la vez**, en orden:

| Sección | Lo que te va a preguntar |
|---|---|
| Requisitos | Actores, casos de uso; latencia, disponibilidad y consistencia **con número** |
| Fuera de alcance | Qué no hará esta versión y por qué |
| Escala y supuestos | Usuarios, lecturas vs escrituras, tamaños, retención, picos (calcula con `/estimate`) |
| API y modelo de datos | Endpoints o eventos, idempotencia, entidades y su clave de acceso |
| Arquitectura inicial | Componentes y el recorrido de una petición, síncrono y asíncrono |
| Decisiones clave y tradeoffs | Qué se eligió, qué se descartó, qué se gana y qué se paga |
| Escenarios de falla | Qué pasa si cae cada dependencia, picos, duplicados, particiones |
| Revisión con IA | El registro de `/design-review` |

Si no sabes un dato, Claude propone un **supuesto marcado** y sigue. Retoma donde lo dejaste con
`/design`, o ve a una sección concreta: `/design scale`.

Al abrir cada sesión, un hook te dice qué secciones están hechas y cuál sigue; la statusline
muestra el avance (`📐 3/7 · siguiente: API y modelo de datos`).

### 2. Diagramas — `/design-diagram`

```
/design-diagram architecture            # flowchart de componentes
/design-diagram sequence flujo-de-pago  # el recorrido de un flujo
/design-diagram data-model              # entidades y relaciones
/design-diagram check                   # ¿diagramas y texto dicen lo mismo?
```

Son **Mermaid dentro de `design.md`**, entre marcas, así que se regeneran sin tocar el texto.
Solo dibujan lo que el documento ya dice. GitHub los renderiza solo; en VS Code, con la extensión
*Markdown Preview Mermaid Support* (`bierner.markdown-mermaid`). `node .claude/helpers/design-status.cjs lint`
atrapa los errores de sintaxis más comunes.

### 3. Revisar en plan mode — `/design-review`

Cuando estén **requisitos, escala y arquitectura inicial** (el hook te avisa), abre la terminal
integrada y arranca Claude en plan mode:

```bash
claude --permission-mode plan
```

En plan mode Claude **lee y propone, pero no edita**: ideal para revisar el diseño contigo. Pide
una revisión acotada:

```
/design-review "el flujo de procesamiento asíncrono"
/design-review "la caché de lectura" 2 escala
```

O con tus palabras, en español o en inglés:

```
Read design.md. I have already established the requirements and proposed the initial architecture.
Review only the asynchronous processing flow. Identify up to three concrete failure scenarios.
For each scenario: explain how the current design could fail, suggest the smallest mitigation,
and state the tradeoff. Do not redesign the system or modify files. Keep the response concise.
```

Cada hallazgo sale con **cómo falla, la mitigación mínima y su tradeoff**. Si quieres guardarlo,
pide "regístralo": se añade a *Revisión con IA* como pendiente y tú decides qué aceptar.

### 4. Iterar

Para aplicar lo que aceptaste, aprueba el plan (o sal de plan mode con Shift+Tab) y Claude
actualiza la sección que corresponda y el diagrama (`/design-diagram`). Vuelve a revisar con
otro foco. El documento conserva el historial: las decisiones que cambian se tachan, no se borran.

## Skills incluidas (4 skills)

| Skill | Para qué |
|---|---|
| `design` | Entrevista que construye `design.md` sección por sección |
| `estimate` | Estimaciones de capacidad con la aritmética a la vista |
| `design-diagram` | Diagramas Mermaid derivados del documento, y su verificación |
| `design-review` | Revisión acotada: hasta N escenarios con mitigación mínima y tradeoff |

## La estructura de design.md

Cada sección lleva una marca `<!-- section:<id> -->` bajo su título. Las skills y los hooks se
guían por las marcas, no por los títulos: por eso el documento puede estar en español o en inglés
y puedes retocar un título sin romper nada. Si una edición borra una marca, el hook se lo dice a
Claude para que la restaure.

## Actualizar el kit

```bash
npx -y github:lacasoft/system-design-kit#v1.0.0 --update --yes
```

Actualiza reglas y skills que no hayas editado; lo editado se conserva y la versión nueva queda
como `*.kit-new`. **`design.md` nunca se toca.**

## Mantenimiento

- `npm run validate`: skills, JSON, sintaxis, estructura de la plantilla en es y en, es-MX y este README.
- `npm test`: helper e instalador (`node:test`, sin dependencias).
- Versionado SemVer con tag anotado por versión; instala siempre fijando el tag.

Licencia MIT.
