/**
 * The ONE canonical measure → record → assert body. Case authors never rewrite
 * it, which is what keeps "recorded only on success" from creeping back in.
 */

import { describe, expect, test } from "vitest";
import { DEFAULT_THRESHOLD, VERBOSE } from "./config.js";
import { record } from "./record.js";
import type { Result } from "./run.js";
import { llmJudge, patternMatch, type Verdict } from "./scorers.js";
import { activated, integratedTask, isolatedTask } from "./tasks.js";

export interface QualityCase {
  name: string;
  prompt: string;
  /** All must appear before the judge is paid for. Fails cheap and diagnoses sharply. */
  grounding?: string[];
  /** Judged binary, evidence required. See rubrics.md. */
  practices?: string[];
  threshold?: number;
  maxTurns?: number;
}

export interface TraceCase {
  name: string;
  prompt: string;
  expectSubagents?: string[];
  expectSkills?: string[];
  expectFilesRead?: string[];
  expectMaxTurns?: number;
  /** Negative case: assert the named skills do NOT fire. */
  shouldActivate?: boolean;
  maxTurns?: number;
  allowedTools?: string[];
}

export const describeSuite = (tier: string, name: string, fn: () => void) =>
  describe(`${tier}:${name}`, fn);

function trace(name: string, r: Result): void {
  if (!VERBOSE) return;
  console.log(
    `[${name}] turns=${r.turns} tools=${r.toolCalls.map((t) => t.name).join(",")} ` +
      `skills=${r.skillsInvoked.join(",")} subagents=${r.subagents.join(",")} ` +
      `in=${r.usage.input} out=${r.usage.output} ${r.durationMs}ms`,
  );
}

/**
 * Quality cases against an artifact in isolation: the artifact is the system
 * prompt and nothing else is loaded, so a pass is attributable to its content.
 */
export function runQualityCases(artifactPath: string, cases: QualityCase[]): void {
  for (const c of cases) {
    test(c.name, async () => {
      const threshold = c.threshold ?? DEFAULT_THRESHOLD;
      const result = await isolatedTask(c.prompt, artifactPath, { maxTurns: c.maxTurns });
      trace(c.name, result);

      let grounded: number | undefined;
      let verdict: Verdict | undefined;

      // Measure inside the try, record in the finally, assert strictly after.
      // A config that fails early (grounding red, judge skipped) still records.
      try {
        if (c.grounding?.length) grounded = patternMatch(result.text, c.grounding);
        if (c.practices?.length && (grounded === undefined || grounded === 1)) {
          verdict = await llmJudge(result.text, c.practices);
          if (VERBOSE) console.log(`[${c.name}]`, JSON.stringify(verdict.results, null, 2));
        }
      } finally {
        record(c.name, { tier: "quality", result, verdict, grounded, threshold });
      }

      if (grounded !== undefined) {
        expect(grounded, `missing concrete evidence. Output:\n${result.text}`).toBe(1);
      }
      if (verdict) {
        expect(verdict.score, JSON.stringify(verdict.results, null, 2)).toBeGreaterThanOrEqual(
          threshold,
        );
      }
    });
  }
}

/** Trace cases against the real harness: activation, dispatch, reads, turn count. */
export function runTraceCases(cases: TraceCase[]): void {
  for (const c of cases) {
    test(c.name, async () => {
      const subs = c.expectSubagents ?? [];
      const skills = c.expectSkills ?? [];
      const files = c.expectFilesRead ?? [];
      const expectActive = c.shouldActivate ?? true;

      const result = await integratedTask(c.prompt, {
        maxTurns: c.maxTurns,
        ...(c.allowedTools ? { allowedTools: c.allowedTools } : {}),
        // A negative case has nothing to wait for — it must run to completion.
        // A positive one stops the moment every expectation is satisfied.
        stopWhen: expectActive
          ? (p) =>
              subs.every((s) => p.subagents.includes(s)) &&
              skills.every((s) => activated(p, s)) &&
              files.every((f) => p.filesRead.some((r) => r.includes(f)))
          : undefined,
      });
      trace(c.name, result);

      try {
        for (const sub of subs) {
          expect(result.subagents, `subagents: ${result.subagents.join(", ") || "none"}`).toContain(
            sub,
          );
        }
        for (const skill of skills) {
          expect(
            activated(result, skill),
            `skill '${skill}' | invoked: ${result.skillsInvoked.join(", ") || "none"} | read: ${result.filesRead.join(", ") || "none"}`,
          ).toBe(expectActive);
        }
        for (const file of files) {
          expect(
            result.filesRead.some((f) => f.includes(file)),
            `'${file}' not read | read: ${result.filesRead.join(", ") || "none"}`,
          ).toBe(true);
        }
        if (c.expectMaxTurns !== undefined) {
          expect(result.turns).toBeLessThanOrEqual(c.expectMaxTurns);
        }
        expect(result.isError, "run ended in error or hit the turn cap").toBe(false);
      } finally {
        record(c.name, { tier: "trace", result });
      }
    });
  }
}
