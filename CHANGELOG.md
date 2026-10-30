# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/) y [SemVer](https://semver.org/).

## [No publicado]

## [1.3.0] - 2026-10-30

### Notas de actualización
- `npx -y github:lacasoft/system-design-kit#v1.3.0 --update --yes` añade la skill. `design.md` no se toca.

### Added
- **`/task-planner`: backlog del producto y planificación de sprints, como lo haría un Product Owner.** Es opcional y no forma parte de la entrevista de `/design`: se usa cuando hay que planificar el trabajo y presentarlo al equipo, durante toda la vida del diseño.
  - **Historias de usuario** (*Como [rol], quiero [acción], para [beneficio]*) con los roles de los actores del diseño, cortadas en vertical.
  - Cada una con 2 a 5 criterios en **Dado / Cuando / Entonces** (camino principal, errores y escenarios de falla, no funcionales con su número), revisión INVEST, tareas técnicas, habilitadores y su **origen** en `design.md`. Lo que el diseño no dice va a *Preguntas abiertas*.
  - Prioridad MoSCoW propuesta con su razón; la persona decide. **No estima:** la columna queda para el planning del equipo.
  - **Varios sprints, sin reescribir nada:**
    - `backlog.md` es el backlog vivo del producto: cada historia una vez, con estado e ID estable. Las historias se descartan con su porqué; nunca se borran.
    - Cada sprint queda en `sprints/sprint-NN.md`, con su plan y su cierre. Un sprint cerrado ya no se edita.
  - **Aprende de cada sprint:**
    - Antes de planificar el siguiente, cierra el abierto: resultado de cada historia, objetivo cumplido, retrospectiva y huecos del diseño.
    - Los aprendizajes accionables se acumulan en `backlog.md`, y el siguiente plan dice cuáles aplicó.
    - Si el equipo estima, usa el ritmo observado como referencia.
  - **Sigue al diseño:** los requisitos nuevos se vuelven historias nuevas, y las historias cuyo origen cambió o quedó tachado quedan en `revisar`.
  - Argumentos: un objetivo (cierra y planifica), `cerrar`, `actualizar` o `refinar H-07`. Nunca modifica `design.md`.
- **`design-status.cjs sprints`**: dice qué sprint está abierto, cuál es el siguiente archivo (lo numera el helper, no el modelo) y los estados del backlog. El informe de `design-status.cjs` avisa si hay un sprint abierto.

## [1.2.0] - 2026-10-29

Soporte opcional para [Pi Agent](https://github.com/earendil-works/pi) ≥ 1.4.0. Para Claude Code no cambia nada.

### Notas de actualización
- `npx -y github:lacasoft/system-design-kit#v1.2.0 --update --yes` trae los cambios de las skills y de `design-status.cjs`. Para sumar Pi, agrega `--pi`; desde ese momento `--update` la recuerda.

### Added
- **Revisión sin escrituras en Pi (`pi --review`)**: deja solo `read`, `grep`, `find`, `ls` y `design_status`, bloquea cualquier otra herramienta (también MCP, codemode o la de otra extensión) y le dice al modelo que la revisión es la respuesta. Sin la extensión, Pi rechaza la opción y no arranca.
- **Estado del diseño en Pi**: al iniciar, recargar o compactar la sesión, el mismo estado que da el hook de inicio de Claude entra al contexto de Pi. La herramienta de solo lectura `design_status` muestra el informe, para el modo revisión, donde no hay bash.
- **Guard de `design.md` en Pi**: tras cada `write`/`edit` de `design.md`, y tras cualquier `bash` que lo modifique, la extensión revisa las marcas de sección y avisa al modelo si se perdió alguna. En las pruebas con Sonnet, el modelo escribió `design.md` con un script en 2 de 3 repeticiones.
- `design-status.cjs` exporta `hookMessage`, `report`, `guardReason` y `load` para la extensión. Dentro de Pi (`PI_CODING_AGENT=true`), sus sugerencias usan `/skill:<nombre>` y `pi --review`.
- README: sección *También con Pi Agent* con requisitos, equivalencias, confianza del proyecto, privacidad y los modelos probados.

### Changed
- Las reglas y `design-review` ya no asumen plan mode: nombran también `pi --review` y la herramienta `design_status`.
- Las skills nombran el documento como `./design.md` y aclaran que sus rutas son relativas a la raíz del proyecto. Pi le dice al modelo que las referencias de una skill son relativas a la carpeta de la skill, y un modelo más pequeño (qwen3 8B) buscaba `design.md` en `.claude/skills/design/`.

### Base para Pi Agent (incluida en esta versión)
- **Base para Pi Agent (`--pi`)**: primera parte del soporte para [Pi Agent](https://github.com/earendil-works/pi) ≥ 1.4.0. Es una capa aditiva: sin `--pi` el instalador hace exactamente lo de antes. Con `--pi`:
  - `.pi/settings.json` carga las skills desde `.claude/skills`, sin copias. Si el archivo ya existe se fusiona, y si no es JSON válido no se toca.
  - `.pi/extensions/system-design-kit.ts` expande los `@imports` de `CLAUDE.md`, que Pi lee pero no resuelve. Sin esto, el modelo vería la línea `@design.md` en lugar del documento. La expansión la hace `.claude/helpers/claude-imports.cjs` con las reglas de Claude Code (rutas relativas al archivo, hasta 5 saltos, sin ciclos, fuera del código) y nunca incluye archivos de entorno reales ni nada de `~/.ssh` o `~/.aws`.
  - La barra de estado de Pi muestra `📐 design-kit` cuando la capa está activa.
  - El manifiesto registra la capa, así que `--update` la recuerda.
  - Al terminar, el instalador explica la confianza del proyecto, `PI_TELEMETRY=0` y por qué conviene instalar ripgrep y fd.
- CI: job que prueba la capa dentro de Pi 1.4.0 real con su proveedor simulado, sin modelo ni API key: imports, estado, modo revisión (hash del proyecto intacto) y guard.

## [1.1.0] - 2026-10-26

### Added
- **Del diseño al código.** Cuando no queda ninguna sección pendiente, el aviso de inicio de sesión (y `design-status.cjs`) da el comando exacto para importar el diseño en el proyecto de código: `claude --add-dir <carpeta>` y `/project-context <ruta>/design.md` con dev-starter-kit ≥ 3.1, que lo traslada a `CLAUDE.project.md` y crea un ADR por decisión.
- **`/design-diagram html <diagrama>`**: HTML interactivo para presentar, generado por la skill opcional [archify](https://github.com/tt-a1i/archify) a partir del Mermaid de `design.md`, que sigue siendo la fuente de verdad. archify se revisó y se probó con este kit (v3.2.0: Apache-2.0, gratuito, sin cuenta ni API key, local salvo una consulta de actualizaciones que se puede apagar); el README da el comando de instalación por proyecto, con versión fija y sin telemetría. El instalador ignora `.archify/`, donde archify deja sus borradores y recibos.

## [1.0.0] - 2026-10-18

Primera versión: taller de System Design para Claude Code.

### Added
- **`design.md`** con 8 secciones (requisitos, fuera de alcance, escala y supuestos, API y modelo de datos, arquitectura inicial, decisiones y tradeoffs, escenarios de falla, revisión con IA), en español o inglés. Las marcas `<!-- section:<id> -->` son el contrato con skills y hooks, así que los títulos se pueden retocar.
- **Skills**: `design` (entrevista una pregunta a la vez, en modo coach), `estimate` (capacidad con la aritmética a la vista), `design-diagram` (Mermaid dentro de `design.md`, derivado del texto y verificado contra él) y `design-review` (revisión acotada para plan mode: hasta N escenarios con mitigación mínima y tradeoff, sin rediseñar ni editar).
- **Hooks**: al abrir sesión, el estado del documento y la sección siguiente, con el aviso de pasar a revisión en plan mode cuando hay requisitos, escala y arquitectura inicial. Tras cada edición de `design.md`, un guard que avisa a Claude si se perdió una marca o el orden de las secciones. Statusline con el avance.
- **Instalador** zero-dep: copia la capa del kit con manifiesto (`--update` no pisa lo editado), compone `CLAUDE.md` con un bloque gestionado que importa las reglas y `design.md`, crea `design.md` sin tocarlo nunca si ya existe, y actualiza `.gitignore`.
- `npm run validate` y tests con `node:test`; CI en cada PR.
