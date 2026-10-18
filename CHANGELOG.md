# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/) y [SemVer](https://semver.org/).

## [No publicado]

## [1.0.0] - 2026-10-18

Primera versión: taller de System Design para Claude Code.

### Added
- **`design.md`** con 8 secciones (requisitos, fuera de alcance, escala y supuestos, API y modelo de datos, arquitectura inicial, decisiones y tradeoffs, escenarios de falla, revisión con IA), en español o inglés. Las marcas `<!-- section:<id> -->` son el contrato con skills y hooks, así que los títulos se pueden retocar.
- **Skills**: `design` (entrevista una pregunta a la vez, en modo coach), `estimate` (capacidad con la aritmética a la vista), `design-diagram` (Mermaid dentro de `design.md`, derivado del texto y verificado contra él) y `design-review` (revisión acotada para plan mode: hasta N escenarios con mitigación mínima y tradeoff, sin rediseñar ni editar).
- **Hooks**: al abrir sesión, el estado del documento y la sección siguiente, con el aviso de pasar a revisión en plan mode cuando hay requisitos, escala y arquitectura inicial. Tras cada edición de `design.md`, un guard que avisa a Claude si se perdió una marca o el orden de las secciones. Statusline con el avance.
- **Instalador** zero-dep: copia la capa del kit con manifiesto (`--update` no pisa lo editado), compone `CLAUDE.md` con un bloque gestionado que importa las reglas y `design.md`, crea `design.md` sin tocarlo nunca si ya existe, y actualiza `.gitignore`.
- `npm run validate` y tests con `node:test`; CI en cada PR.
