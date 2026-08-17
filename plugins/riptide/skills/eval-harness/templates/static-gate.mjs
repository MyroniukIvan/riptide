#!/usr/bin/env node
/**
 * Tier 0 — static gate. No model, no network, zero cost, fully deterministic.
 * This is the tier that belongs in CI as a required check.
 *
 *   node static-gate.mjs
 *
 * Checks:
 *   1. Every declared AI surface has at least one case file.       (coverage rot)
 *   2. Every case file exports a non-empty `cases` array.          (empty suites)
 *   3. Every prompt/skill artifact has parseable frontmatter.      (silent breakage)
 *   4. No model ID is hardcoded outside config.                    (drift)
 *
 * Declare your surfaces in surfaces.json:
 *   [{ "name": "invoice-extractor", "artifact": "../src/ai/invoice.prompt.md" }]
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS = dirname(fileURLToPath(import.meta.url));
const CASES = join(EVALS, "cases");
const SURFACES = join(EVALS, "surfaces.json");
const SRC = join(EVALS, "src");

// A model id ends in a version-ish segment, which is what distinguishes
// `claude-haiku-4-5` from the package name `@anthropic-ai/claude-agent-sdk`.
const MODEL_ID = /\b(claude|gpt|gemini)-[a-z0-9.-]*\d[a-z0-9.-]*\b/;
const ALLOW_MODEL_IDS = new Set(["config.ts", "README.md", "static-gate.mjs"]);

const errors = [];
const warnings = [];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// 1 + 2 — surface coverage and non-empty suites
if (!existsSync(SURFACES)) {
  warnings.push(
    "surfaces.json missing — coverage cannot be enforced. List every AI surface " +
      "there so a new one cannot ship without a case file.",
  );
} else {
  let surfaces;
  try {
    surfaces = JSON.parse(readFileSync(SURFACES, "utf8"));
  } catch (err) {
    errors.push(`surfaces.json is not valid JSON: ${err.message}`);
    surfaces = [];
  }
  if (Array.isArray(surfaces) && surfaces.length === 0) {
    warnings.push("surfaces.json is empty — either the project has no AI surface, or coverage is unenforced.");
  }
  for (const s of surfaces ?? []) {
    if (!s?.name) {
      errors.push("surfaces.json entry with no `name`");
      continue;
    }
    const dir = join(CASES, s.name);
    const files = walk(dir).filter((f) => f.endsWith(".cases.ts") || f.endsWith(".cases.js"));
    if (files.length === 0) {
      errors.push(`surface '${s.name}' has no case file under cases/${s.name}/`);
    }
    for (const f of files) {
      const body = readFileSync(f, "utf8");
      if (!/export\s+const\s+cases\s*(:|=)/.test(body)) {
        errors.push(`${f}: no exported \`cases\` array`);
      } else if (/cases[^=]*=\s*\[\s*\]/.test(body)) {
        errors.push(`${f}: \`cases\` is empty — an empty suite passes and detects nothing`);
      }
    }
    if (s.artifact) {
      const artifact = resolve(EVALS, s.artifact);
      if (!existsSync(artifact)) {
        errors.push(`surface '${s.name}': artifact not found at ${s.artifact}`);
      } else if (/\.md$/.test(artifact)) {
        // 3 — frontmatter must be present and terminated
        const text = readFileSync(artifact, "utf8");
        if (text.startsWith("---") && text.indexOf("\n---", 3) === -1) {
          errors.push(`${s.artifact}: unterminated YAML frontmatter`);
        }
      }
    }
  }
}

// 4 — hardcoded model IDs outside config
for (const f of [...walk(SRC), ...walk(CASES)]) {
  const base = f.split("/").pop();
  if (ALLOW_MODEL_IDS.has(base) || !/\.(ts|js|mjs)$/.test(f)) continue;
  const hit = readFileSync(f, "utf8").split("\n").findIndex((l) => MODEL_ID.test(l) && !l.trim().startsWith("*") && !l.trim().startsWith("//"));
  if (hit !== -1) {
    warnings.push(`${f}:${hit + 1} hardcodes a model id — move it to src/config.ts so runs stay comparable`);
  }
}

const red = "\x1b[31m";
const yellow = "\x1b[33m";
const green = "\x1b[32m";
const reset = "\x1b[0m";

for (const e of errors) console.error(`${red}ERROR${reset}  ${e}`);
for (const w of warnings) console.warn(`${yellow}WARN ${reset}  ${w}`);

if (errors.length === 0) {
  console.log(`${green}static gate passed${reset} — ${warnings.length} warning(s)`);
}
process.exit(errors.length ? 1 : 0);
