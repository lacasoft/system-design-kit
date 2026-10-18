// Tests del instalador: corre de verdad sobre carpetas temporales.
const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const INSTALL = path.join(__dirname, "..", "install.js");
const instalar = (dir, args = []) => {
  const r = spawnSync("node", [INSTALL, "--yes", ...args], { cwd: dir, input: "", encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout;
};
const carpeta = () => fs.mkdtempSync(path.join(os.tmpdir(), "sdk-"));
const leer = (dir, f) => fs.readFileSync(path.join(dir, f), "utf8");

test("instala la capa, CLAUDE.md y design.md en español por defecto", () => {
  const dir = carpeta();
  instalar(dir, ["--title", "Acortador de URLs"]);
  for (const f of [".claude/design-kit.md", ".claude/settings.json", ".claude/helpers/design-status.cjs", ".claude/skills/design/SKILL.md", ".claude/skills/design-review/SKILL.md", ".claude/skills/design-diagram/SKILL.md", ".claude/skills/estimate/SKILL.md"]) {
    assert.ok(fs.existsSync(path.join(dir, f)), f);
  }
  assert.match(leer(dir, "CLAUDE.md"), /@\.claude\/design-kit\.md\n@design\.md/);
  assert.match(leer(dir, "design.md"), /^language: es$/m);
  assert.match(leer(dir, "design.md"), /^# Acortador de URLs — System Design$/m);
  assert.match(leer(dir, ".gitignore"), /CLAUDE\.local\.md/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("--lang en genera el documento en inglés", () => {
  const dir = carpeta();
  instalar(dir, ["--lang", "en", "--title", "URL shortener"]);
  assert.match(leer(dir, "design.md"), /^## Failure scenarios$/m);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("--lang inválido sale con error sin instalar nada", () => {
  const dir = carpeta();
  const r = spawnSync("node", [INSTALL, "--yes", "--lang", "fr"], { cwd: dir, encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.ok(!fs.existsSync(path.join(dir, ".claude")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("sin TTY toma las respuestas de stdin (idioma y título)", () => {
  const dir = carpeta();
  const r = spawnSync("node", [INSTALL], { cwd: dir, input: "en\nChat app\n", encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(leer(dir, "design.md"), /^title: "Chat app"$/m);
  assert.match(leer(dir, "design.md"), /^language: en$/m);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("--update nunca toca design.md y respeta lo que editaste", () => {
  const dir = carpeta();
  instalar(dir);
  fs.appendFileSync(path.join(dir, "design.md"), "\n- mi contenido\n");
  fs.appendFileSync(path.join(dir, ".claude", "skills", "design", "SKILL.md"), "\n## mi ajuste\n");
  const antes = leer(dir, "design.md");
  instalar(dir, ["--update"]);
  assert.equal(leer(dir, "design.md"), antes);
  assert.match(leer(dir, ".claude/skills/design/SKILL.md"), /mi ajuste/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("--update actualiza un archivo del kit intacto y deja .kit-new si ambos cambiaron", () => {
  const dir = carpeta();
  instalar(dir);
  const mp = path.join(dir, ".claude", ".design-kit-manifest.json");
  const m = JSON.parse(fs.readFileSync(mp, "utf8"));
  const skill = path.join(dir, ".claude", "skills", "estimate", "SKILL.md");
  // Simula una versión anterior intacta: archivo distinto, pero igual a lo que registró el manifiesto.
  fs.writeFileSync(skill, "versión vieja");
  m.files["skills/estimate/SKILL.md"] = require("node:crypto").createHash("sha256").update("versión vieja").digest("hex").slice(0, 16);
  // Y otra editada por la persona cuando el kit también cambió.
  fs.writeFileSync(path.join(dir, ".claude", "design-kit.md"), "mis reglas");
  m.files["design-kit.md"] = "0".repeat(16);
  fs.writeFileSync(mp, JSON.stringify(m));
  const out = instalar(dir, ["--update"]);
  assert.match(leer(dir, ".claude/skills/estimate/SKILL.md"), /^---\nname: estimate/);
  assert.equal(leer(dir, ".claude/design-kit.md"), "mis reglas");
  assert.ok(fs.existsSync(path.join(dir, ".claude", "design-kit.md.kit-new")));
  assert.match(out, /kit-new/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("respeta un CLAUDE.md existente y añade su bloque una sola vez", () => {
  const dir = carpeta();
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# Mis notas\n");
  instalar(dir);
  instalar(dir, ["--update"]);
  const md = leer(dir, "CLAUDE.md");
  assert.match(md, /^# Mis notas/);
  assert.equal(md.split("BEGIN system-design-kit").length - 1, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("--dry-run no escribe nada", () => {
  const dir = carpeta();
  instalar(dir, ["--dry-run"]);
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});
