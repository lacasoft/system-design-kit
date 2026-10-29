#!/usr/bin/env node
/**
 * design-status.cjs — estado y estructura de design.md (zero-dep).
 *
 * Lo usan el instalador, los hooks de Claude Code, la extensión de Pi Agent (como módulo) y las skills.
 * Dentro de Pi (PI_CODING_AGENT=true), las sugerencias usan /skill:<nombre> y `pi --review`.
 *   node design-status.cjs                 informe legible: qué secciones están hechas y cuál sigue
 *   node design-status.cjs hook            SessionStart: el mismo estado, como contexto breve
 *   node design-status.cjs guard           PostToolUse: si una edición rompió la estructura, se lo dice a Claude
 *   node design-status.cjs statusline      línea de estado: "📐 3/8 · siguiente: …"
 *   node design-status.cjs lint            revisa los bloques Mermaid (tipo de diagrama, comillas y corchetes)
 *   node design-status.cjs init --title "…" --lang es|en   crea design.md si no existe
 *
 * Cada sección lleva una marca `<!-- section:<id> -->` bajo su título. Las marcas, no los
 * títulos, son el contrato: así el documento puede estar en español o en inglés y la persona
 * puede retocar un título sin romper nada.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, "..", "..");
const DESIGN = path.join(ROOT, "design.md");

const SECTIONS = [
  {
    id: "requirements",
    es: "Requisitos",
    en: "Requirements",
    hint: {
      es: "Funcionales: qué hace el sistema y para quién (verbos). No funcionales, con número: latencia, disponibilidad, consistencia, durabilidad, seguridad.",
      en: "Functional: what the system does and for whom (verbs). Non-functional, with numbers: latency, availability, consistency, durability, security.",
    },
  },
  {
    id: "out-of-scope",
    es: "Fuera de alcance",
    en: "Out of scope",
    hint: {
      es: "Lo que esta versión no hará, y por qué. Evita que el diseño crezca sin control.",
      en: "What this version will not do, and why. Keeps the design from growing unchecked.",
    },
  },
  {
    id: "scale",
    es: "Escala y supuestos",
    en: "Scale and assumptions",
    hint: {
      es: "Usuarios activos, lecturas vs escrituras, tamaños, retención y picos. Estimaciones con la aritmética a la vista (/estimate) y supuestos marcados.",
      en: "Active users, reads vs writes, sizes, retention and peaks. Estimates with the arithmetic shown (/estimate) and assumptions marked.",
    },
  },
  {
    id: "api-data-model",
    es: "API y modelo de datos",
    en: "API and data model",
    hint: {
      es: "Endpoints o eventos de los casos de uso principales (idempotencia, paginación) y entidades con su clave de acceso.",
      en: "Endpoints or events for the main use cases (idempotency, pagination) and entities with their access key.",
    },
  },
  {
    id: "architecture",
    es: "Arquitectura inicial",
    en: "Initial architecture",
    hint: {
      es: "Componentes y el recorrido de una petición de punta a punta, síncrono y asíncrono. Dónde vive el estado.",
      en: "Components and the end-to-end path of a request, sync and async. Where state lives.",
    },
  },
  {
    id: "decisions",
    es: "Decisiones clave y tradeoffs",
    en: "Key decisions and tradeoffs",
    hint: {
      es: "Cada decisión con la alternativa descartada, lo que se gana y lo que se paga, y el requisito que la motiva.",
      en: "Each decision with the rejected alternative, what you gain and what you pay, and the requirement behind it.",
    },
  },
  {
    id: "failures",
    es: "Escenarios de falla",
    en: "Failure scenarios",
    hint: {
      es: "Qué pasa si cae cada dependencia crítica, ante picos, duplicados o particiones de red: cómo se detecta y cómo se mitiga.",
      en: "What happens when each critical dependency fails, under spikes, duplicates or network partitions: detection and mitigation.",
    },
  },
  {
    id: "ai-review",
    es: "Revisión con IA",
    en: "AI review",
    hint: {
      es: "Registro de las revisiones de /design-review: fecha, foco, hallazgos y qué decidiste con cada uno.",
      en: "Log of /design-review sessions: date, focus, findings and what you decided on each.",
    },
  },
];
const PENDING = { es: "_⏳ Pendiente_", en: "_⏳ Pending_" };
// Las tres que hacen falta para que una revisión no sea especulación.
const REVIEW_PREREQS = ["requirements", "scale", "architecture"];
const MERMAID_TYPES = /^(flowchart|graph|sequenceDiagram|erDiagram|classDiagram|stateDiagram(-v2)?|C4Context|C4Container|gantt|journey|mindmap|timeline|block-beta|architecture-beta)\b/;

function frontMatter(txt) {
  const m = txt.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) for (const l of m[1].split("\n")) {
    const kv = l.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return fm;
}

function parse(txt) {
  const fm = frontMatter(txt);
  const language = fm.language === "en" ? "en" : "es";
  const lines = txt.split("\n");
  const errors = [];
  if (!["es", "en"].includes(fm.language)) errors.push('el front matter no declara `language: es` o `language: en`');
  const positions = SECTIONS.map((s) => {
    const idx = lines.reduce((acc, l, i) => (l.trim() === `<!-- section:${s.id} -->` ? [...acc, i] : acc), []);
    if (idx.length === 0) errors.push(`falta la marca <!-- section:${s.id} --> (${s[language]})`);
    if (idx.length > 1) errors.push(`la marca <!-- section:${s.id} --> aparece ${idx.length} veces`);
    return idx[0];
  });
  const found = positions.filter((p) => p !== undefined);
  if (found.some((p, i) => i > 0 && p < found[i - 1])) errors.push("las secciones no están en el orden de la plantilla");

  const sections = SECTIONS.map((s, i) => {
    const start = positions[i];
    if (start === undefined) return { id: s.id, label: s[language], done: false, missing: true };
    let end = lines.length;
    for (let j = start + 1; j < lines.length; j++) {
      if (/^## /.test(lines[j]) || /^<!-- section:/.test(lines[j].trim())) {
        end = j;
        break;
      }
    }
    const body = lines.slice(start + 1, end).join("\n").replace(/<!--[\s\S]*?-->/g, "");
    const content = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^_?⏳/.test(l));
    const diagrams = [...lines.slice(start + 1, end).join("\n").matchAll(/<!-- diagram:([\w-]+) -->/g)].map((m) => m[1]);
    return { id: s.id, label: s[language], done: content.length > 0, diagrams };
  });
  const done = (id) => sections.find((s) => s.id === id)?.done;
  const next = sections.find((s) => !s.done && s.id !== "ai-review");
  return {
    title: fm.title || "",
    language,
    sections,
    errors,
    next: next || null,
    readyForReview: REVIEW_PREREQS.every(done),
    hasDiagram: sections.some((s) => s.diagrams && s.diagrams.length),
  };
}

function load() {
  try {
    return parse(fs.readFileSync(DESIGN, "utf8"));
  } catch (_) {
    return null;
  }
}

function render({ title, language = "es", date = new Date().toISOString().slice(0, 10) }) {
  const lang = language === "en" ? "en" : "es";
  const intro = {
    es: "Documento vivo: lo construyes respondiendo las preguntas de /design. Las marcas section:… las usan las skills del kit: no las borres; los títulos sí se pueden retocar.",
    en: "Living document: you build it by answering /design's questions. The section:… markers are used by the kit's skills: keep them; headings can be edited.",
  }[lang];
  const parts = [
    "---",
    `title: "${String(title).replace(/"/g, "'")}"`,
    `language: ${lang}`,
    `status: ${lang === "es" ? "borrador" : "draft"}`,
    `updated: ${date}`,
    "---",
    "",
    `# ${title} — System Design`,
    "",
    `<!-- ${intro} -->`,
    "",
  ];
  for (const s of SECTIONS) parts.push(`## ${s[lang]}`, `<!-- section:${s.id} -->`, `<!-- ${s.hint[lang]} -->`, PENDING[lang], "");
  return parts.join("\n");
}

// Revisión barata de sintaxis: no sustituye a un renderizador, pero atrapa lo que más rompe un
// diagrama generado (tipo desconocido, comillas o corchetes sin cerrar).
function lintMermaid(txt) {
  const problems = [];
  const blocks = [...txt.matchAll(/```mermaid\n([\s\S]*?)```/g)];
  blocks.forEach((b, n) => {
    const body = b[1];
    const first = body.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("%%"));
    if (!first || !MERMAID_TYPES.test(first)) problems.push(`bloque ${n + 1}: tipo de diagrama no reconocido (${first || "vacío"})`);
    body.split("\n").forEach((l, i) => {
      const sinComentario = l.replace(/%%.*$/, "");
      if ((sinComentario.match(/"/g) || []).length % 2) problems.push(`bloque ${n + 1}, línea ${i + 1}: comillas sin cerrar`);
    });
    for (const [a, c] of [["[", "]"], ["(", ")"], ["{", "}"]]) {
      const sinTexto = body.replace(/"[^"\n]*"/g, "");
      const abre = sinTexto.split(a).length - 1;
      const cierra = sinTexto.split(c).length - 1;
      if (abre !== cierra) problems.push(`bloque ${n + 1}: ${a}${c} desbalanceados (${abre} vs ${cierra})`);
    }
  });
  return { blocks: blocks.length, problems };
}

function readStdin() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

const T = {
  es: { none: "No hay design.md.", next: "Siguiente", review: "Listo para revisión", diagram: "Sin diagrama todavía", complete: "Diseño completo" },
  en: { none: "No design.md yet.", next: "Next", review: "Ready for review", diagram: "No diagram yet", complete: "Design complete" },
};
// Cuando no queda ninguna sección pendiente (salvo el registro de revisiones), el diseño puede
// pasar al proyecto de código: dev-starter-kit (≥ 3.1) lo importa con /project-context.
const handoff = () =>
  `en el proyecto de código (con dev-starter-kit): claude --add-dir ${ROOT} y ahí /project-context ${DESIGN}`;

// Las sugerencias usan la sintaxis del agente: en Pi las skills son /skill:<nombre> y el modo de
// solo lectura es `pi --review`. Pi marca a sus procesos hijos con PI_CODING_AGENT=true.
const enPi = () => process.env.PI_CODING_AGENT === "true";
function syntax(pi = enPi()) {
  return {
    skill: (name) => (pi ? `/skill:${name}` : `/${name}`),
    review: pi ? "pi --review" : "claude --permission-mode plan",
  };
}

/** Estado breve para el inicio de sesión (hook SessionStart en Claude; contexto en Pi). */
function hookMessage(st, { pi } = {}) {
  const x = syntax(pi);
  if (!st) return `📐 ${T.es.none} Propón empezar con ${x.skill("design")} (o: node .claude/helpers/design-status.cjs init --title "…" --lang es|en).`;
  const t = T[st.language];
  const hechas = st.sections.filter((s) => s.done && s.id !== "ai-review");
  const lines = [`📐 design.md (${st.language}) — ${hechas.length}/${SECTIONS.length - 1}: ${hechas.map((s) => s.label).join(", ") || "—"}.`];
  if (st.errors.length) lines.push(`⚠️ Estructura: ${st.errors.join("; ")}.`);
  if (st.next) lines.push(`${t.next}: ${st.next.label} → ${x.skill("design")} ${st.next.id}`);
  if (st.readyForReview) {
    if (!st.hasDiagram) lines.push(`${t.diagram}: ${x.skill("design-diagram")} architecture`);
    lines.push(`${t.review}: en otra terminal, ${x.review}, y ahí ${x.skill("design-review")} <foco>.`);
  }
  if (!st.next) lines.push(`${t.complete}. Para llevarlo al código: ${handoff()}`);
  return lines.join("\n");
}

/** Informe legible: qué secciones están hechas y cuál sigue. */
function report(st, { pi } = {}) {
  const x = syntax(pi);
  if (!st) return `${T.es.none} Créalo con: node .claude/helpers/design-status.cjs init --title "…" --lang es|en`;
  const lines = [`📐 ${st.title || "design.md"} (${st.language})`];
  for (const s of st.sections) lines.push(`  ${s.done ? "✅" : "⏳"} ${s.label}${s.diagrams && s.diagrams.length ? `  [diagramas: ${s.diagrams.join(", ")}]` : ""}`);
  if (st.errors.length) lines.push(`\n⚠️ Estructura: ${st.errors.join("; ")}`);
  if (st.next) lines.push(`\n${T[st.language].next}: ${st.next.label} (${x.skill("design")} ${st.next.id})`);
  if (st.readyForReview) lines.push(`${T[st.language].review}: ${x.review} → ${x.skill("design-review")} <foco>`);
  if (!st.next) lines.push(`${T[st.language].complete}. Para llevarlo al código: ${handoff()}`);
  return lines.join("\n");
}

/** Si design.md perdió su estructura, el motivo para que el agente lo corrija; si no, null. */
function guardReason() {
  const st = load();
  if (!st || !st.errors.length) return null;
  return `design.md perdió su estructura: ${st.errors.join("; ")}. Restaura las marcas <!-- section:… --> (una por sección, en orden) sin tocar el contenido de la persona.`;
}

function main() {
  const action = process.argv[2] || "report";
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > -1 ? process.argv[i + 1] : undefined;
  };

  if (action === "init") {
    if (fs.existsSync(DESIGN)) {
      console.log("design.md ya existe: no se toca.");
      return;
    }
    fs.writeFileSync(DESIGN, render({ title: arg("title") || path.basename(ROOT), language: arg("lang") }));
    console.log(`design.md creado (${arg("lang") === "en" ? "en" : "es"}).`);
    return;
  }

  if (action === "guard") {
    // Solo interesa una edición de design.md. PostToolUse no puede deshacerla, pero con
    // decision:"block" el motivo le llega a Claude, que la corrige en el siguiente paso.
    const file = (readStdin().tool_input || {}).file_path || "";
    if (path.resolve(ROOT, file) !== DESIGN) return;
    const reason = guardReason();
    if (reason) process.stdout.write(JSON.stringify({ decision: "block", reason }));
    return;
  }

  const st = load();
  if (action === "statusline") {
    readStdin();
    if (!st) return process.stdout.write("📐 sin design.md");
    const hechas = st.sections.filter((s) => s.done && s.id !== "ai-review").length;
    process.stdout.write(`📐 ${hechas}/${SECTIONS.length - 1}${st.next ? ` · ${T[st.language].next.toLowerCase()}: ${st.next.label}` : " ✓"}`);
    return;
  }

  if (action === "lint") {
    if (!st) return console.log(T.es.none);
    const r = lintMermaid(fs.readFileSync(DESIGN, "utf8"));
    if (!r.problems.length) console.log(`✓ ${r.blocks} diagrama(s) Mermaid sin problemas de sintaxis evidentes.`);
    else {
      r.problems.forEach((p) => console.log(`✗ ${p}`));
      process.exitCode = 1;
    }
    return;
  }

  if (action === "hook") {
    if (readStdin().source === "compact") return; // ya está en el contexto resumido
    console.log(hookMessage(st));
    return;
  }

  console.log(report(st));
}

if (require.main === module) main();

module.exports = { SECTIONS, PENDING, DESIGN, parse, render, lintMermaid, load, hookMessage, report, guardReason };
