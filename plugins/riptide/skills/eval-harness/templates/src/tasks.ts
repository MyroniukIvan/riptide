/**
 * Two task modes, and the difference is load-bearing.
 *
 * `isolated` injects the artifact under test as the system prompt and loads no
 * on-disk configuration — it measures the artifact's *content*.
 *
 * `integrated` loads the real project harness — it is the only way to see
 * whether a skill actually activates or a subagent actually gets dispatched. A
 * content-only suite cannot detect a skill that silently stopped triggering.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { REPO_ROOT } from "./config.js";
import { run, type Result, type RunOptions } from "./run.js";

/** Strip YAML frontmatter — the judge should score the body, not the metadata. */
function stripFrontmatter(text: string): string {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  return end === -1 ? text : text.slice(end + 4).replace(/^\n+/, "");
}

export function loadArtifact(artifactPath: string): string {
  const full = isAbsolute(artifactPath) ? artifactPath : resolve(REPO_ROOT, artifactPath);
  return stripFrontmatter(readFileSync(full, "utf8"));
}

/** Content tier: the artifact IS the system prompt, nothing else is loaded. */
export function isolatedTask(
  prompt: string,
  artifactPath: string,
  opts: RunOptions = {},
): Promise<Result> {
  return run(prompt, {
    ...opts,
    systemPrompt: loadArtifact(artifactPath),
    allowedTools: opts.allowedTools ?? [],
    settingSources: [],
  });
}

/** Systemic tier: the real harness, so activation and dispatch are observable. */
export function integratedTask(prompt: string, opts: RunOptions = {}): Promise<Result> {
  return run(prompt, {
    ...opts,
    cwd: opts.cwd ?? REPO_ROOT,
    settingSources: ["project"],
  });
}

/** Did a skill engage? Either an explicit Skill call, or reading its SKILL.md. */
export function activated(result: Pick<Result, "skillsInvoked" | "filesRead">, skill: string): boolean {
  return (
    result.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`)) ||
    result.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`))
  );
}
