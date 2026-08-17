#!/usr/bin/env node
/**
 * Static quality gate for SKILL.md files. No model, no network, no cost.
 *
 *   node lint-skills.mjs                 # every skill under .claude/skills
 *   node lint-skills.mjs path/to/skills  # a specific root
 *   node lint-skills.mjs --json          # machine-readable, for CI
 *
 * Exits 1 if any skill FAILs. Warnings never fail the run.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const MIN_DESCRIPTION = 40;
const MAX_DESCRIPTION = 1536; // description + when_to_use are truncated here in the listing
const MIN_BODY_CHARS = 200;
const MAX_BODY_LINES = 500;

const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const EXTERNAL_RE = /^(https?:|#|mailto:)/;
const PERSONA_RE = /^\s*you are (a|an|the)\s+\w/i;
const BOOLISH = new Set(["true", "yes", "on", "1", "false", "no", "off", "0"]);

/**
 * Minimal YAML frontmatter reader: flat scalars, `>`/`|` folded blocks, and
 * `- item` lists. Enough for skill frontmatter; deliberately not a YAML parser.
 */
function splitFrontmatter(text) {
  if (!text.startsWith("---")) return [null, text];
  const end = text.indexOf("\n---", 3);
  if (end === -1) return [null, text];

  const raw = text.slice(text.indexOf("\n") + 1, end);
  const body = text.slice(end + 4).replace(/^\n+/, "");

  const data = {};
  let key = null;
  let buf = [];
  const flush = () => {
    if (key !== null) data[key] = buf.map((p) => p.trim()).filter(Boolean).join(" ").trim();
  };

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m && !/^[ \t-]/.test(line)) {
      flush();
      key = m[1];
      const rest = m[2].trim();
      buf = [">", "|", ">-", "|-", ""].includes(rest) ? [] : [rest];
    } else if (key !== null) {
      buf.push(line.trim().replace(/^-\s*/, ""));
    }
  }
  flush();
  return [data, body];
}

function check(skillDir) {
  const name = basename(skillDir);
  const md = join(skillDir, "SKILL.md");
  const errors = [];
  const warnings = [];

  if (!existsSync(md)) {
    return { skill: name, path: md, errors: ["no SKILL.md in directory"], warnings, verdict: "FAIL" };
  }

  const text = readFileSync(md, "utf8");
  let [fm, body] = splitFrontmatter(text);
  if (fm === null) {
    errors.push("missing or unterminated YAML frontmatter (--- ... ---)");
    fm = {};
  }

  const desc = fm.description ?? "";
  if (!desc) {
    errors.push("missing frontmatter field: description (the agent cannot route without it)");
  } else if (desc.length < MIN_DESCRIPTION) {
    errors.push(`description too short (${desc.length} chars) — state what it does AND when to use it`);
  } else if (desc.length + (fm.when_to_use ?? "").length > MAX_DESCRIPTION) {
    warnings.push("description + when_to_use exceeds 1536 chars and will be truncated in the listing");
  }

  if (fm.name && fm.name !== name) {
    errors.push(`frontmatter name '${fm.name}' does not match directory '${name}'`);
  }

  for (const key of ["disable-model-invocation", "user-invocable"]) {
    const val = fm[key];
    if (val !== undefined && !BOOLISH.has(String(val).toLowerCase())) {
      errors.push(`${key}: '${val}' is not a boolean`);
    }
  }

  if (body.length < MIN_BODY_CHARS) errors.push(`body is only ${body.length} chars — likely a stub`);

  const lines = body.split("\n");
  if (lines.filter((l) => l.startsWith("#")).length < 2) {
    errors.push("fewer than 2 headings — a skill needs a visible structure");
  }

  for (const m of body.matchAll(LINK_RE)) {
    const target = m[2];
    if (EXTERNAL_RE.test(target) || target.includes("${")) continue;
    const rel = target.split("#")[0];
    if (rel && !existsSync(join(skillDir, rel))) errors.push(`broken relative link: ${target}`);
  }

  const first = lines.find((l) => l.trim() && !l.startsWith("#")) ?? "";
  if (PERSONA_RE.test(first)) {
    warnings.push("opens with a persona line — spend those tokens on process instead");
  }
  if (lines.length > MAX_BODY_LINES) {
    warnings.push(`${lines.length} lines — split reference material into sibling files`);
  }

  return {
    skill: name,
    path: md,
    errors,
    warnings,
    verdict: errors.length ? "FAIL" : warnings.length ? "WARN" : "PASS",
  };
}

function discover(root) {
  if (existsSync(join(root, "SKILL.md"))) return [root];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (!statSync(p).isDirectory()) continue;
      if (existsSync(join(p, "SKILL.md"))) out.push(p);
      else walk(p);
    }
  };
  walk(root);
  return out.sort();
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const roots = args.filter((a) => !a.startsWith("--"));
if (roots.length === 0) roots.push(".claude/skills");

const dirs = [];
for (const r of roots) {
  if (!existsSync(r)) {
    console.error(`skill root not found: ${r}`);
    process.exit(1);
  }
  dirs.push(...discover(r));
}

if (dirs.length === 0) {
  console.log(`no SKILL.md found under ${roots.join(", ")}`);
  process.exit(0);
}

const reports = dirs.map(check);

if (asJson) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  const c = { FAIL: "\x1b[31m", WARN: "\x1b[33m", PASS: "\x1b[32m" };
  const reset = "\x1b[0m";
  for (const r of reports) {
    console.log(`\n${r.skill}  [${c[r.verdict]}${r.verdict}${reset}]  ${r.path}`);
    for (const e of r.errors) console.log(`  ${c.FAIL}ERROR${reset}  ${e}`);
    for (const w of r.warnings) console.log(`  ${c.WARN}WARN ${reset}  ${w}`);
    if (r.verdict === "PASS") console.log("  all checks passed");
  }
  const failed = reports.filter((r) => r.verdict === "FAIL").length;
  const warned = reports.filter((r) => r.verdict === "WARN").length;
  console.log(`\n${reports.length} skills · ${failed} failed · ${warned} warned`);
}

process.exit(reports.some((r) => r.verdict === "FAIL") ? 1 : 0);
