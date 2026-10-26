// Tests del helper: es el contrato entre design.md, las skills y los hooks.
const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HELPER = path.join(__dirname, "..", "template", ".claude", "helpers", "design-status.cjs");
const { parse, render, lintMermaid, SECTIONS } = require(HELPER);

function rellenar(txt, ids) {
  for (const id of ids) txt = txt.replace(new RegExp(`(<!-- section:${id} -->\\n<!--.*-->\\n)_⏳ (Pendiente|Pending)_`), `$1- contenido de ${id}`);
  return txt;
}
function correr(action, design, input = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "design-"));
  if (design !== null) fs.writeFileSync(path.join(dir, "design.md"), design);
  const r = spawnSync("node", [HELPER, action], {
    input: JSON.stringify(typeof input === "function" ? input(dir) : input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: r.stdout || "" };
}

test("la plantilla, en es y en, tiene las 8 secciones en orden y ninguna hecha", () => {
  for (const language of ["es", "en"]) {
    const st = parse(render({ title: "X", language }));
    assert.deepEqual(st.errors, []);
    assert.equal(st.language, language);
    assert.deepEqual(st.sections.map((s) => s.id), SECTIONS.map((s) => s.id));
    assert.ok(st.sections.every((s) => !s.done));
  }
});

test("los títulos van en el idioma del documento", () => {
  assert.match(render({ title: "X", language: "es" }), /^## Escala y supuestos$/m);
  assert.match(render({ title: "X", language: "en" }), /^## Scale and assumptions$/m);
});

test("una sección con contenido cuenta como hecha y marca la siguiente", () => {
  const st = parse(rellenar(render({ title: "X" }), ["requirements"]));
  assert.ok(st.sections[0].done);
  assert.equal(st.next.id, "out-of-scope");
  assert.equal(st.readyForReview, false);
});

test("con requisitos, escala y arquitectura está lista para revisión", () => {
  const st = parse(rellenar(render({ title: "X" }), ["requirements", "scale", "architecture"]));
  assert.equal(st.readyForReview, true);
});

test("detecta marcas perdidas, duplicadas o fuera de orden", () => {
  const base = render({ title: "X" });
  assert.match(parse(base.replace("<!-- section:failures -->", "")).errors.join(), /falta la marca <!-- section:failures -->/);
  assert.match(parse(base + "\n<!-- section:scale -->\n").errors.join(), /aparece 2 veces/);
  const swapped = base.replace("<!-- section:requirements -->", "@@").replace("<!-- section:scale -->", "<!-- section:requirements -->").replace("@@", "<!-- section:scale -->");
  assert.match(parse(swapped).errors.join(), /orden/);
});

test("un título retocado no rompe nada: mandan las marcas", () => {
  const st = parse(render({ title: "X" }).replace("## Requisitos", "## Requisitos del MVP"));
  assert.deepEqual(st.errors, []);
});

test("lint de Mermaid: acepta un diagrama válido y atrapa los errores típicos", () => {
  const bien = "```mermaid\nflowchart LR\n  api[\"API\"] --> db[(\"DB\")]\n```";
  assert.deepEqual(lintMermaid(bien).problems, []);
  assert.match(lintMermaid("```mermaid\nflowchat LR\n  a --> b\n```").problems.join(), /tipo de diagrama/);
  assert.match(lintMermaid("```mermaid\nflowchart LR\n  a[\"API] --> b\n```").problems.join(), /comillas/);
  assert.match(lintMermaid("```mermaid\nflowchart LR\n  db[(\"DB\") --> b\n```").problems.join(), /desbalanceados/);
});

test("hook: sin design.md propone /design", () => assert.match(correr("hook", null).out, /\/design/));
test("hook: dice la siguiente sección", () => assert.match(correr("hook", render({ title: "X" })).out, /Siguiente: Requisitos/));
test("hook: sugiere plan mode cuando está listo para revisión", () => {
  const out = correr("hook", rellenar(render({ title: "X" }), ["requirements", "scale", "architecture"])).out;
  assert.match(out, /claude --permission-mode plan/);
  assert.match(out, /\/design-diagram architecture/, "sin diagrama todavía, lo sugiere");
});
test("hook: no repite tras una compactación", () => assert.equal(correr("hook", render({ title: "X" }), { source: "compact" }).out, ""));

test("guard: avisa a Claude si una edición rompió la estructura de design.md", () => {
  const roto = render({ title: "X" }).replace("<!-- section:decisions -->", "");
  const r = correr("guard", roto, (dir) => ({ tool_input: { file_path: path.join(dir, "design.md") } }));
  const d = JSON.parse(r.out);
  assert.equal(d.decision, "block");
  assert.match(d.reason, /section:decisions/);
});
test("guard: calla si la estructura está bien o si el archivo editado es otro", () => {
  assert.equal(correr("guard", render({ title: "X" }), (dir) => ({ tool_input: { file_path: path.join(dir, "design.md") } })).out, "");
  const roto = render({ title: "X" }).replace("<!-- section:decisions -->", "");
  assert.equal(correr("guard", roto, (dir) => ({ tool_input: { file_path: path.join(dir, "notas.md") } })).out, "");
});

test("statusline muestra el avance", () =>
  assert.match(correr("statusline", rellenar(render({ title: "X" }), ["requirements"])).out, /📐 1\/7 · siguiente: Fuera de alcance/));

test("hook: con el diseño completo da el comando para llevarlo al código", () => {
  const todas = ["requirements", "out-of-scope", "scale", "api-data-model", "architecture", "decisions", "failures"];
  const out = correr("hook", rellenar(render({ title: "X" }), todas)).out;
  assert.match(out, /Diseño completo/);
  assert.match(out, /\/project-context \S+design\.md/);
  assert.match(out, /claude --add-dir /);
});
test("hook: sin el diseño completo no ofrece el traspaso", () =>
  assert.doesNotMatch(correr("hook", rellenar(render({ title: "X" }), ["requirements"])).out, /project-context/));
