// Integración con Pi Agent real, sin modelo: el proveedor simulado de Pi responde y el arnés
// guarda el prompt de sistema. Corre solo si PI_BIN apunta al binario de Pi (la CI instala 1.4.0).
const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PI = process.env.PI_BIN;
const skip = PI ? false : "define PI_BIN con la ruta al binario de Pi para correr estas pruebas";
const INSTALL = path.join(__dirname, "..", "install.js");
// Arnés que Pi carga con -e: registra el proveedor simulado, guarda el prompt de sistema en
// HARNESS_OUT/system.txt y responde "ok". Va como texto porque Node trata los .ts de test/ como pruebas.
const HARNESS = `
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxProvider, fauxText, getCurrentSystemPrompt } from "@earendil-works/pi-ai";
import * as fs from "node:fs";
import * as path from "node:path";

export default function (pi: ExtensionAPI) {
  const faux = fauxProvider();
  faux.setResponses([
    (context) => {
      fs.writeFileSync(path.join(process.env.HARNESS_OUT ?? ".", "system.txt"), getCurrentSystemPrompt(context.messages));
      return fauxAssistantMessage(fauxText("ok"));
    },
  ]);
  pi.registerProvider(faux.provider);
}
`;

// Instala el kit en una carpeta temporal, corre Pi una vez y devuelve el prompt de sistema.
function promptDePi(args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-pi-"));
  const agente = path.join(dir, ".agente");
  fs.mkdirSync(agente);
  // Configuración de Pi aislada: confía en la carpeta de prueba y no envía telemetría.
  fs.writeFileSync(path.join(agente, "settings.json"), JSON.stringify({ defaultProjectTrust: "always", enableInstallTelemetry: false }));
  fs.writeFileSync(path.join(agente, "harness.ts"), HARNESS);
  const inst = spawnSync("node", [INSTALL, "--yes", "--title", "Acortador de URLs", ...args], { cwd: dir, encoding: "utf8" });
  assert.equal(inst.status, 0, inst.stdout + inst.stderr);
  const r = spawnSync(PI, ["-e", path.join(agente, "harness.ts"), "--provider", "faux", "--model", "faux-1", "--no-session", "-p", "hola"], {
    cwd: dir,
    input: "",
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, PI_CODING_AGENT_DIR: agente, HARNESS_OUT: dir, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const prompt = fs.readFileSync(path.join(dir, "system.txt"), "utf8");
  fs.rmSync(dir, { recursive: true, force: true });
  return prompt;
}

test("con --pi, Pi carga las skills de .claude/ y ve CLAUDE.md con sus imports expandidos", { skip }, () => {
  const prompt = promptDePi(["--pi"]);
  for (const s of ["design", "design-diagram", "design-review", "estimate"]) assert.match(prompt, new RegExp(`<name>${s}</name>`));
  assert.match(prompt, /# Taller de System Design/, "contenido de .claude/design-kit.md");
  assert.match(prompt, /<!-- section:requirements -->/, "contenido de design.md");
  assert.doesNotMatch(prompt, /^@(\.claude\/design-kit|design)\.md$/m, "no quedan líneas de import");
});

test("sin --pi, Pi ve las líneas @ sin expandir y no carga las skills", { skip }, () => {
  const prompt = promptDePi([]);
  assert.match(prompt, /^@design\.md$/m);
  assert.doesNotMatch(prompt, /<name>design<\/name>/);
});
