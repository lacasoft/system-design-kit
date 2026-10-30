// Integración con Pi Agent real, sin modelo: el proveedor simulado de Pi ejecuta pasos guionizados
// y el arnés guarda el prompt de sistema, las herramientas activas y el resultado de cada llamada.
// Corre solo si PI_BIN apunta al binario de Pi (la CI instala 1.4.0).
const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PI = process.env.PI_BIN;
const skip = PI ? false : "define PI_BIN con la ruta al binario de Pi para correr estas pruebas";
const INSTALL = path.join(__dirname, "..", "install.js");
// Arnés que Pi carga con -e. Va como texto porque Node trata los .ts de test/ como pruebas.
// HARNESS_STEPS: [{tool, args} | {text}]. Guarda system.txt, tools.json y log.json en HARNESS_OUT.
const HARNESS = `
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, getCurrentSystemPrompt, getCurrentTools } from "@earendil-works/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";

export default function (pi: ExtensionAPI) {
  const out = process.env.HARNESS_OUT ?? ".";
  const steps = JSON.parse(process.env.HARNESS_STEPS ?? '[{"text":"ok"}]');
  const log: unknown[] = [];
  const faux = fauxProvider();
  faux.setResponses(steps.map((step: any, i: number) => (context: any) => {
    if (i === 0) {
      fs.writeFileSync(path.join(out, "system.txt"), getCurrentSystemPrompt(context.messages));
      fs.writeFileSync(path.join(out, "tools.json"), JSON.stringify(getCurrentTools(context.messages).map((t: any) => t.name)));
    }
    const last = context.messages[context.messages.length - 1];
    if (last?.role === "toolResult") log.push({ tool: last.toolName, error: Boolean(last.isError), text: last.content.map((c: any) => c.text ?? "").join("") });
    fs.writeFileSync(path.join(out, "log.json"), JSON.stringify(log));
    return fauxAssistantMessage(step.tool ? fauxToolCall(step.tool, step.args ?? {}) : fauxText(step.text ?? "ok"));
  }));
  pi.registerProvider(faux.provider);
}
`;

// Instala el kit en una carpeta temporal y corre Pi una vez con los pasos dados.
function correrPi({ install = ["--pi"], piArgs = [], steps = [{ text: "ok" }], antes } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-pi-"));
  const agente = path.join(os.tmpdir(), `sdk-pi-agente-${path.basename(dir)}`);
  fs.mkdirSync(agente);
  // Configuración de Pi aislada: confía en la carpeta de prueba y no envía telemetría.
  fs.writeFileSync(path.join(agente, "settings.json"), JSON.stringify({ defaultProjectTrust: "always", enableInstallTelemetry: false }));
  fs.writeFileSync(path.join(agente, "harness.ts"), HARNESS);
  const inst = spawnSync("node", [INSTALL, "--yes", "--title", "Acortador de URLs", ...install], { cwd: dir, encoding: "utf8" });
  assert.equal(inst.status, 0, inst.stdout + inst.stderr);
  if (antes) antes(dir);
  const huella = huellaDe(dir);
  const r = spawnSync(PI, ["-e", path.join(agente, "harness.ts"), "--provider", "faux", "--model", "faux-1", "--no-session", ...piArgs, "-p", "hola"], {
    cwd: dir,
    input: "",
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, PI_CODING_AGENT_DIR: agente, HARNESS_OUT: agente, HARNESS_STEPS: JSON.stringify(steps), PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const leer = (f) => fs.readFileSync(path.join(agente, f), "utf8");
  const res = { prompt: leer("system.txt"), tools: JSON.parse(leer("tools.json")), log: JSON.parse(leer("log.json")), intacto: huella === huellaDe(dir), dir };
  fs.rmSync(agente, { recursive: true, force: true });
  return res;
}
// Hash de todos los archivos del proyecto (sin .git): prueba de que nada se escribió.
function huellaDe(dir) {
  const h = crypto.createHash("sha256");
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === ".git") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(path.relative(dir, p)).update(fs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest("hex");
}
const limpiar = (res) => fs.rmSync(res.dir, { recursive: true, force: true });

test("con --pi, Pi carga las skills, expande CLAUDE.md y recibe el estado del diseño", { skip }, () => {
  const res = correrPi();
  for (const s of ["design", "design-diagram", "design-review", "estimate", "task-planner"]) assert.match(res.prompt, new RegExp(`<name>${s}</name>`));
  assert.match(res.prompt, /# Taller de System Design/, "contenido de .claude/design-kit.md");
  assert.match(res.prompt, /<!-- section:requirements -->/, "contenido de design.md");
  assert.doesNotMatch(res.prompt, /^@(\.claude\/design-kit|design)\.md$/m, "no quedan líneas de import");
  assert.match(res.prompt, /<design-status>[\s\S]*Siguiente: Requisitos → \/skill:design requirements[\s\S]*<\/design-status>/);
  assert.ok(res.tools.includes("design_status"));
  limpiar(res);
});

test("sin --pi, Pi ve las líneas @ sin expandir y no carga las skills", { skip }, () => {
  const res = correrPi({ install: [] });
  assert.match(res.prompt, /^@design\.md$/m);
  assert.doesNotMatch(res.prompt, /<name>design<\/name>/);
  limpiar(res);
});

test("pi --review deja solo herramientas de lectura y no se escribe nada", { skip }, () => {
  const res = correrPi({
    piArgs: ["--review"],
    steps: [
      { tool: "write", args: { path: "design.md", content: "# borrado\n" } },
      { tool: "edit", args: { path: "design.md", edits: [{ oldText: "# Acortador", newText: "# Otro" }] } },
      { tool: "bash", args: { command: "echo x > nuevo.txt" } },
      { tool: "design_status", args: {} },
      { tool: "read", args: { path: "design.md" } },
      { text: "ok" },
    ],
  });
  assert.deepEqual([...res.tools].sort(), ["design_status", "find", "grep", "ls", "read"]);
  assert.match(res.prompt, /Modo revisión \(pi --review\)/);
  assert.deepEqual(res.log.map((l) => [l.tool, l.error]), [["write", true], ["edit", true], ["bash", true], ["design_status", false], ["read", false]]);
  assert.match(res.log[3].text, /⏳ Requisitos/);
  assert.ok(res.intacto, "ningún archivo del proyecto cambió");
  limpiar(res);
});

test("el guard avisa si una escritura de design.md rompe su estructura, también vía bash", { skip }, () => {
  const res = correrPi({
    steps: [
      { tool: "write", args: { path: "notas.md", content: "# notas\n" } },
      { tool: "write", args: { path: "design.md", content: "# roto\n" } },
      { tool: "bash", args: { command: "printf '# roto otra vez\\n' > design.md" } },
      { text: "ok" },
    ],
  });
  assert.doesNotMatch(res.log[0].text, /perdió su estructura/, "otro archivo: sin aviso");
  assert.match(res.log[1].text, /design\.md perdió su estructura/);
  assert.match(res.log[2].text, /design\.md perdió su estructura/);
  limpiar(res);
});
