/**
 * Two scorers. Reach for the free one first — never pay a judge for what a
 * substring settles.
 */

import { EVAL_JUDGE_MODEL } from "./config.js";
import { run } from "./run.js";

/** Deterministic, no model: fraction of expected substrings present. */
export function patternMatch(output: string, expected: string[]): number {
  if (expected.length === 0) return 1;
  const low = output.toLowerCase();
  return expected.filter((e) => low.includes(e.toLowerCase())).length / expected.length;
}

export interface Verdict {
  results: { practice: string; passed: boolean; evidence: string }[];
  passed: number;
  total: number;
  score: number;
}

const RUBRIC = [
  "You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES, judge each practice independently.",
  "Rules:",
  "(1) Exactly PASS or FAIL per practice. No scales, no partial credit.",
  "(2) PASS only when a direct verbatim quote from the OUTPUT is evidence the practice was met. A keyword is not evidence.",
  "(3) Reply with ONLY minified JSON:",
  '{"results":[{"practice":"<text>","passed":true,"evidence":"<verbatim quote>"}]}',
].join("\n");

function parse(text: string): Verdict["results"] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  }
  const obj = JSON.parse(text.slice(start, end + 1)) as { results?: Verdict["results"] };
  if (!Array.isArray(obj.results)) throw new Error("judge JSON missing results[]");
  return obj.results;
}

/** Binary per practice, evidence required. See rubrics.md for how to write them. */
export async function llmJudge(
  output: string,
  practices: string[],
  model = EVAL_JUDGE_MODEL,
): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;

  const res = await run(prompt, { model, allowedTools: [], maxTurns: 1, settingSources: [] });
  const results = parse(res.text);
  const total = results.length || 1;
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, total, score: passed / total };
}
