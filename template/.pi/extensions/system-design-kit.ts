// System Design Kit para Pi Agent. Pi lee CLAUDE.md, pero no resuelve sus @imports ni tiene los
// hooks ni el plan mode de Claude Code. Esta extensión cubre lo que el taller necesita, con los
// mismos helpers del kit:
//  - expande los imports de CLAUDE.md (claude-imports.cjs): sin esto el modelo vería la línea
//    "@design.md" en lugar del documento;
//  - pone el estado de design.md en el contexto al iniciar, como el hook SessionStart de Claude, y
//    lo ofrece como herramienta de solo lectura (design_status);
//  - tras cada escritura de design.md, incluida la que el modelo haga con un script vía bash,
//    revisa que no se hayan perdido las marcas de sección (el guard de PostToolUse en Claude);
//  - `pi --review` deja solo herramientas de lectura: el equivalente al plan mode para
//    /skill:design-review.
// Imports y estado se calculan al iniciar, recargar o compactar la sesión y se reutilizan entre
// turnos, igual que Claude no relee CLAUDE.md a cada mensaje.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const { expand } = require("../../.claude/helpers/claude-imports.cjs");
const status = require("../../.claude/helpers/design-status.cjs");

const REVIEW_TOOLS = ["read", "grep", "find", "ls", "design_status"];
const mtime = () => (fs.existsSync(status.DESIGN) ? fs.statSync(status.DESIGN).mtimeMs : 0);

export default function (pi: ExtensionAPI) {
  let imports = new Map<string, { raw: string; expanded: string }>();
  let estado = "";
  let review = false;
  const antes = new Map<string, number>(); // mtime de design.md antes de cada bash

  const refrescar = () => {
    imports = new Map();
    estado = status.hookMessage(status.load(), { pi: true });
  };

  pi.registerFlag("review", {
    description: "System Design Kit: modo revisión, solo herramientas de lectura (para /skill:design-review)",
    type: "boolean",
    default: false,
  });

  pi.registerTool({
    name: "design_status",
    label: "design status",
    description: "Estado de design.md: qué secciones están hechas, cuál sigue y si se perdió alguna marca de sección. Solo lectura.",
    promptSnippet: "Estado de las secciones de design.md (solo lectura)",
    parameters: Type.Object({}),
    async execute() {
      return { content: [{ type: "text", text: status.report(status.load(), { pi: true }) }], details: {} };
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    refrescar();
    review = Boolean(pi.getFlag("review"));
    if (review) pi.setActiveTools(REVIEW_TOOLS);
    // Si la persona no ve este indicador, la capa del kit no está activa (proyecto sin confianza
    // o Pi corriendo con --no-extensions).
    if (ctx.hasUI) ctx.ui.setStatus("system-design-kit", review ? "📐 design-kit · revisión" : "📐 design-kit");
  });

  pi.on("session_compact", async () => refrescar());

  pi.on("before_agent_start", async (event) => {
    const opts = event.systemPromptOptions;
    for (const file of opts.contextFiles ?? []) {
      if (path.basename(file.path).toLowerCase() !== "claude.md") continue;
      let hit = imports.get(file.path);
      if (hit && file.content === hit.expanded) continue;
      if (!hit || hit.raw !== file.content) {
        hit = { raw: file.content, expanded: expand(file.path, file.content) };
        imports.set(file.path, hit);
      }
      file.content = hit.expanded;
    }
    if (opts.sections) opts.sections["design-status"] = estado;
    const regla = "Modo revisión (pi --review): solo puedes leer. No intentes editar archivos ni correr comandos; entrega los hallazgos como respuesta.";
    if (review && opts.promptGuidelines && !opts.promptGuidelines.includes(regla)) opts.promptGuidelines.push(regla);
  });

  pi.on("tool_call", async (event) => {
    // Defensa en profundidad: aunque una herramienta siga activa (MCP, codemode, otra extensión),
    // en modo revisión solo pasan las de lectura.
    if (review && !REVIEW_TOOLS.includes(event.toolName)) {
      return { block: true, reason: `Modo revisión (pi --review): ${event.toolName} no está permitido; solo ${REVIEW_TOOLS.join(", ")}.` };
    }
    if (event.toolName === "bash") antes.set(event.toolCallId, mtime());
  });

  pi.on("tool_result", async (event, ctx) => {
    const input = event.input as { path?: string };
    const tocado =
      ((event.toolName === "write" || event.toolName === "edit") && input.path && path.resolve(ctx.cwd, input.path) === status.DESIGN) ||
      (event.toolName === "bash" && antes.has(event.toolCallId) && antes.get(event.toolCallId) !== mtime());
    antes.delete(event.toolCallId);
    if (!tocado) return;
    const reason = status.guardReason();
    if (reason) return { content: [...event.content, { type: "text", text: `⚠️ ${reason}` }] };
  });
}
