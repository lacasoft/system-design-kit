#!/usr/bin/env node
/**
 * validate.cjs — integridad del kit sin dependencias (lo usan `npm run validate` y la CI).
 *  - Frontmatter de las skills (name + description, name = nombre de la carpeta y YAML válido)
 *  - JSON válido (package.json, settings.json) y sintaxis de los .js/.cjs
 *  - La plantilla que genera el helper pasa su propio chequeo de estructura, en es y en en
 *  - Las skills que nombran secciones usan ids que existen
 *  - La extensión de Pi carga helpers de .claude/ que existen
 *  - es-MX: sin peninsularismos en el contenido del kit
 *  - README: el número de skills que dice es el real
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const T = path.join(ROOT, "template", ".claude");
const errors = [];
let ok = 0;
const rel = (p) => path.relative(ROOT, p);
const walk = (d, f, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, f, out);
    else if (f(p)) out.push(p);
  }
  return out;
};

const skills = walk(path.join(T, "skills"), (p) => p.endsWith("SKILL.md"));
for (const s of skills) {
  const txt = fs.readFileSync(s, "utf8");
  const fm = (txt.match(/^---\n([\s\S]*?)\n---/) || [])[1];
  if (!fm) errors.push(`${rel(s)}: sin frontmatter`);
  else {
    const name = (fm.match(/^name:\s*(\S+)/m) || [])[1];
    if (!name) errors.push(`${rel(s)}: falta name`);
    else if (name !== path.basename(path.dirname(s))) errors.push(`${rel(s)}: name "${name}" no coincide con su carpeta`);
    if (!/^description:\s*\S/m.test(fm)) errors.push(`${rel(s)}: falta description`);
    else ok++;
    // Un valor YAML sin comillas no puede contener ": " ni empezar con comilla sin cerrarla: Pi
    // descarta la skill entera si su frontmatter no es YAML válido (Claude es más tolerante).
    for (const [, key, val] of fm.matchAll(/^([\w-]+):[ \t]*(.+)$/gm)) {
      if (!/^["']/.test(val) && /:\s/.test(val)) errors.push(`${rel(s)}: ${key} lleva ": " sin comillas, y eso no es YAML válido (Pi no cargaría la skill)`);
    }
  }
}

for (const j of ["package.json", "template/.claude/settings.json"]) {
  try {
    JSON.parse(fs.readFileSync(path.join(ROOT, j), "utf8"));
    ok++;
  } catch (e) {
    errors.push(`${j}: JSON inválido → ${e.message}`);
  }
}
for (const j of ["install.js", "scripts/validate.cjs", ...walk(path.join(T, "helpers"), (p) => /\.c?js$/.test(p)).map(rel)]) {
  try {
    execSync(`node --check ${JSON.stringify(path.join(ROOT, j))}`, { stdio: "ignore" });
    ok++;
  } catch (_) {
    errors.push(`${j}: error de sintaxis`);
  }
}

const status = require(path.join(T, "helpers", "design-status.cjs"));
for (const language of ["es", "en"]) {
  const st = status.parse(status.render({ title: "Prueba", language }));
  if (st.errors.length) errors.push(`plantilla (${language}): ${st.errors.join("; ")}`);
  else if (st.sections.some((s) => s.done)) errors.push(`plantilla (${language}): una sección vacía cuenta como hecha`);
  else ok++;
}

const ids = new Set(status.SECTIONS.map((s) => s.id));
for (const s of skills) {
  const hint = (fs.readFileSync(s, "utf8").match(/^argument-hint:\s*"(.*)"/m) || [])[1] || "";
  if (path.basename(path.dirname(s)) !== "design") continue;
  for (const id of hint.replace(/[[\]]/g, "").split("|").map((x) => x.trim()).filter(Boolean)) {
    if (!ids.has(id)) errors.push(`${rel(s)}: argument-hint nombra la sección "${id}", que no existe`);
  }
}

// La capa de Pi carga helpers de .claude/ por ruta relativa: cada uno tiene que existir.
const PI = path.join(ROOT, "template", ".pi");
for (const ext of walk(path.join(PI, "extensions"), (p) => p.endsWith(".ts"))) {
  const refs = [...fs.readFileSync(ext, "utf8").matchAll(/\.\.\/\.\.\/\.claude\/helpers\/([\w.-]+)/g)].map((m) => m[1]);
  if (!refs.length) errors.push(`${rel(ext)}: no carga ningún helper de .claude/`);
  for (const h of refs) {
    if (!fs.existsSync(path.join(T, "helpers", h))) errors.push(`${rel(ext)}: carga .claude/helpers/${h}, que no existe`);
    else ok++;
  }
}

const ESMX = /\b(coste|costes|montar|ordenador|ordenadores|fichero|ficheros|vale|pillar)\b/i;
const contenido = [...walk(T, (p) => /\.(md|cjs)$/.test(p)), ...walk(PI, (p) => p.endsWith(".ts")), path.join(ROOT, "install.js"), path.join(ROOT, "README.md")];
for (const f of contenido) {
  fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => {
    const m = l.match(ESMX);
    if (m) errors.push(`${rel(f)}:${i + 1}: peninsularismo "${m[1]}" — usa es-MX`);
  });
}

const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const dicho = Number((readme.match(/(\d+)\s+skills/) || [])[1]);
if (dicho !== skills.length) errors.push(`README.md: dice ${dicho} skills y hay ${skills.length}`);
else ok++;

console.log(`\n🔎 Validación del kit — skills: ${skills.length}`);
if (errors.length) {
  console.error(`\n❌ ${errors.length} problema(s):`);
  errors.forEach((e) => console.error(`   - ${e}`));
  process.exit(1);
}
console.log(`✅ Todo correcto (${ok} comprobaciones).`);
