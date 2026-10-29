# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/) y [SemVer](https://semver.org/).

## [No publicado]

### Added
- **Base para Pi Agent (`--pi`)**: primera parte del soporte para [Pi Agent](https://github.com/earendil-works/pi) ≥ 1.4.0. Es una capa aditiva: sin `--pi` el instalador hace exactamente lo de antes. Con `--pi`:
  - `.pi/settings.json` carga las skills desde `.claude/skills`, sin copias. Si el archivo ya existe se fusiona, y si no es JSON válido no se toca.
  - `.pi/extensions/system-design-kit.ts` expande los `@imports` de `CLAUDE.md`, que Pi lee pero no resuelve. Sin esto, el modelo vería la línea `@design.md` en lugar del documento. La expansión la hace `.claude/helpers/claude-imports.cjs` con las reglas de Claude Code (rutas relativas al archivo, hasta 5 saltos, sin ciclos, fuera del código) y nunca incluye archivos de entorno reales ni nada de `~/.ssh` o `~/.aws`.
  - La barra de estado de Pi muestra `📐 design-kit` cuando la capa está activa.
  - El manifiesto registra la capa, así que `--update` la recuerda.
  - Al terminar, el instalador explica la confianza del proyecto, `PI_TELEMETRY=0` y por qué conviene instalar ripgrep y fd.
- CI: job que prueba la capa dentro de Pi 1.4.0 real con su proveedor simulado, sin modelo ni API key.

### Changed
- Las skills nombran el documento como `./design.md` y aclaran que sus rutas son relativas a la raíz del proyecto. Pi le dice al modelo que las referencias de una skill son relativas a la carpeta de la skill, y un modelo más pequeño (qwen3 8B) buscaba `design.md` en `.claude/skills/design/`.

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
