// System Design Kit para Pi Agent. Pi lee CLAUDE.md, pero no resuelve sus @imports: sin esta
// extensión el modelo vería la línea "@design.md" en lugar del documento. La expansión la hace el
// mismo helper del kit (.claude/helpers/claude-imports.cjs) y sigue el ritmo de Claude Code: se
// calcula al iniciar, recargar o compactar la sesión y se reutiliza entre turnos.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createRequire } from "node:module";
import * as path from "node:path";

const { expand } = createRequire(import.meta.url)("../../.claude/helpers/claude-imports.cjs");

export default function (pi: ExtensionAPI) {
  let cache = new Map<string, { raw: string; expanded: string }>();

  pi.on("session_start", async (_event, ctx) => {
    cache = new Map();
    // Si la persona no ve este indicador, la capa del kit no está activa (proyecto sin confianza
    // o Pi corriendo con --no-extensions).
    if (ctx.hasUI) ctx.ui.setStatus("system-design-kit", "📐 design-kit");
  });

  pi.on("session_compact", async () => {
    cache = new Map();
  });

  pi.on("before_agent_start", async (event) => {
    for (const file of event.systemPromptOptions.contextFiles ?? []) {
      if (path.basename(file.path).toLowerCase() !== "claude.md") continue;
      let hit = cache.get(file.path);
      if (hit && file.content === hit.expanded) continue;
      if (!hit || hit.raw !== file.content) {
        hit = { raw: file.content, expanded: expand(file.path, file.content) };
        cache.set(file.path, hit);
      }
      file.content = hit.expanded;
    }
  });
}
