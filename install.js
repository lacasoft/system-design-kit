#!/usr/bin/env node
/**
 * install.js — instalador del System Design Kit (zero-dep).
 *
 * Convierte la carpeta actual en un taller de System Design para Claude Code:
 *  1. Copia la capa del kit (template/.claude → .claude): reglas, skills, helper, settings.
 *  2. Compone ./CLAUDE.md con un bloque gestionado que importa las reglas del kit.
 *  3. Crea design.md (en español o inglés) si no existe. Nunca lo toca si ya existe.
 *  4. Actualiza .gitignore con lo personal y los backups.
 *
 * Flags:
 *   --lang es|en     idioma del documento (si no, pregunta; con --yes, es)
 *   --title "…"      qué vas a diseñar (si no, pregunta; con --yes, el nombre de la carpeta)
 *   --yes, -y        no interactivo
 *   --update         trae la última capa del kit sin pisar lo que hayas editado (manifiesto)
 *   --dry-run        simula sin escribir
 *   --help, -h       ayuda
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const KIT = __dirname;
const CWD = process.cwd();
const TEMPLATE = path.join(KIT, "template");
const argv = process.argv.slice(2);
const flag = (...names) => names.some((n) => argv.includes(n));
const value = (name) => {
  const i = argv.indexOf(name);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
};
const FLAGS = {
  yes: flag("--yes", "-y"),
  update: flag("--update"),
  dryRun: flag("--dry-run"),
  help: flag("--help", "-h"),
  lang: value("--lang"),
  title: value("--title"),
};
const status = require(path.join(TEMPLATE, ".claude", "helpers", "design-status.cjs"));
const VERSION = JSON.parse(fs.readFileSync(path.join(KIT, "package.json"), "utf8")).version;

if (FLAGS.help) {
  console.log(`
System Design Kit — instalador

Uso:  npx -y github:lacasoft/system-design-kit [opciones]   (dentro de la carpeta del diseño)

  --lang es|en     idioma de design.md (pregunta si no lo indicas; con --yes, es)
  --title "…"      qué vas a diseñar (pregunta si no lo indicas; con --yes, el nombre de la carpeta)
  --yes, -y        no interactivo
  --update         actualiza las reglas y skills del kit sin pisar lo que hayas editado.
                   design.md nunca se toca.
  --dry-run        simula sin escribir
  --help, -h       esta ayuda

Después: abre Claude Code en la carpeta y corre /design.
`);
  process.exit(0);
}

// ---------- entrada ----------
// Sin TTY (tuberías, CI) readline pierde líneas: se drena stdin a una cola.
let piped = null;
async function ask(q) {
  if (FLAGS.yes) return null;
  if (!process.stdin.isTTY) {
    if (piped === null) {
      let raw = "";
      try {
        raw = fs.readFileSync(0, "utf8");
      } catch (_) {}
      piped = raw.split(/\r?\n/);
    }
    const line = piped.length ? piped.shift() : null;
    if (line !== null) console.log(`${q}${line}`);
    return line;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.on("close", () => resolve(null));
    rl.question(q, (a) => {
      resolve(a);
      rl.close();
    });
  });
}

// ---------- capa del kit con manifiesto ----------
// Mismas reglas que dev-starter-kit: lo intacto se actualiza, lo editado se conserva y la
// versión nueva queda al lado como *.kit-new. El manifiesto guarda el hash tal como lo dejó el kit.
const MANIFEST = path.join(CWD, ".claude", ".design-kit-manifest.json");
const hash = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
const dry = FLAGS.dryRun ? "(dry-run) " : "";
function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}
function applyLayer(ctx) {
  const src = path.join(TEMPLATE, ".claude");
  for (const rel of walk(src)) {
    const buf = fs.readFileSync(path.join(src, rel));
    const dest = path.join(CWD, ".claude", rel);
    const shown = path.relative(CWD, dest);
    ctx.next[rel] = hash(buf);
    if (!fs.existsSync(dest)) {
      if (!FLAGS.dryRun) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
      }
      console.log(`  ${dry}➕ ${shown}`);
      ctx.added++;
      continue;
    }
    const cur = hash(fs.readFileSync(dest));
    if (cur === ctx.next[rel]) {
      ctx.same++;
    } else if (!FLAGS.update) {
      ctx.kept++;
    } else if (ctx.prev[rel] === cur) {
      if (!FLAGS.dryRun) fs.writeFileSync(dest, buf);
      console.log(`  ${dry}⬆️  ${shown}`);
      ctx.updated++;
    } else if (ctx.prev[rel] !== ctx.next[rel]) {
      if (!FLAGS.dryRun) fs.writeFileSync(`${dest}.kit-new`, buf);
      console.log(`  ${dry}⚠️  ${shown} — lo tuyo se conserva; la versión nueva queda en ${path.basename(dest)}.kit-new`);
      ctx.conflicts++;
    }
  }
}

// ---------- CLAUDE.md ----------
const MB = "<!-- BEGIN system-design-kit -->";
const ME = "<!-- END system-design-kit -->";
function composeClaudeMd() {
  const block = `${MB}\n@.claude/design-kit.md\n@design.md\n${ME}\n`;
  const root = path.join(CWD, "CLAUDE.md");
  if (!fs.existsSync(root)) {
    if (!FLAGS.dryRun) fs.writeFileSync(root, block);
    console.log(`  ${dry}➕ CLAUDE.md`);
    return;
  }
  const cur = fs.readFileSync(root, "utf8");
  const re = new RegExp(`${MB}[\\s\\S]*?${ME}\\n?`);
  const next = re.test(cur) ? cur.replace(re, block) : `${cur.trimEnd()}\n\n${block}`;
  if (next !== cur) {
    if (!FLAGS.dryRun) fs.writeFileSync(root, next);
    console.log(`  ${dry}🔁 CLAUDE.md (bloque del kit)`);
  }
}

// .archify/ guarda borradores y recibos de archify (opcional); los HTML finales van a diagrams/.
const GITIGNORE = [".claude/agent-memory-local/", "CLAUDE.local.md", ".claude.backup.*", "*.kit-new", ".archify/"];
function ensureGitignore() {
  const gi = path.join(CWD, ".gitignore");
  const cur = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
  const have = new Set(cur.split(/\r?\n/).map((l) => l.trim()));
  const add = GITIGNORE.filter((l) => !have.has(l));
  if (!add.length) return;
  if (!FLAGS.dryRun) fs.writeFileSync(gi, `${cur}${cur && !cur.endsWith("\n") ? "\n" : ""}${cur ? "\n" : ""}# system-design-kit\n${add.join("\n")}\n`);
  console.log(`  ${dry}➕ .gitignore += ${add.join("  ")}`);
}

// ---------- main ----------
async function main() {
  console.log(`\n📐 System Design Kit v${VERSION}\n`);
  const designPath = path.join(CWD, "design.md");
  const existing = fs.existsSync(designPath) ? status.parse(fs.readFileSync(designPath, "utf8")) : null;

  let lang = FLAGS.lang;
  let title = FLAGS.title;
  if (existing) {
    console.log(`  ✓ design.md ya existe (${existing.language}): no se toca.`);
  } else {
    if (lang && !["es", "en"].includes(lang)) {
      console.error(`❌ --lang debe ser es o en (recibí "${lang}").`);
      process.exitCode = 1;
      return;
    }
    if (!lang) lang = ((await ask("Idioma del documento (es/en) [es]: ")) || "es").trim().toLowerCase();
    if (!["es", "en"].includes(lang)) lang = "es";
    if (!title) title = ((await ask(`¿Qué vas a diseñar? (título corto) [${path.basename(CWD)}]: `)) || "").trim() || path.basename(CWD);
  }

  if (fs.existsSync(path.join(CWD, ".claude")) && !FLAGS.dryRun) {
    const bk = `.claude.backup.${Date.now()}`;
    fs.cpSync(path.join(CWD, ".claude"), path.join(CWD, bk), { recursive: true });
    console.log(`  📦 Backup: ${bk}`);
  }

  console.log("\n📄 Capa del kit (.claude/)...");
  const prev = readJSON(MANIFEST);
  const ctx = { prev: (prev && prev.files) || {}, next: {}, added: 0, updated: 0, same: 0, kept: 0, conflicts: 0 };
  applyLayer(ctx);
  const resumen = [
    ctx.added && `${ctx.added} nuevos`,
    ctx.updated && `${ctx.updated} actualizados`,
    ctx.same && `${ctx.same} ya al día`,
    ctx.kept && `${ctx.kept} conservados (usa --update para actualizarlos)`,
    ctx.conflicts && `${ctx.conflicts} con cambios tuyos (revisa los *.kit-new)`,
  ].filter(Boolean);
  if (resumen.length) console.log(`  📋 ${resumen.join(" · ")}`);
  if (!FLAGS.dryRun) {
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    fs.writeFileSync(MANIFEST, JSON.stringify({ version: VERSION, files: ctx.next }, null, 2) + "\n");
  }

  console.log("\n📝 CLAUDE.md, design.md y .gitignore...");
  composeClaudeMd();
  if (!existing) {
    if (!FLAGS.dryRun) fs.writeFileSync(designPath, status.render({ title, language: lang }));
    console.log(`  ${dry}➕ design.md (${lang}): "${title}"`);
  }
  ensureGitignore();

  const es = (existing ? existing.language : lang) !== "en";
  console.log(`
✅ Listo. Siguientes pasos:
   1. Abre Claude Code en esta carpeta y corre /design: te entrevista sección por sección
      y va escribiendo design.md con tus respuestas.
   2. Con requisitos, escala y arquitectura inicial: /design-diagram architecture.
   3. Para revisar, en la terminal integrada: claude --permission-mode plan
      y ahí /design-review <foco>  (p. ej. ${es ? '"el flujo asíncrono"' : '"the async processing flow"'}).
   Vista previa de los diagramas en VS Code: extensión bierner.markdown-mermaid (GitHub los renderiza solo).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
