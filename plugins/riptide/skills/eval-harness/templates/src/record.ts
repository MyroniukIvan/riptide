/**
 * Append-only trend log. One row per case execution, written in a `finally`
 * before any assertion — a failing case must still leave a row, or the trend
 * data has survivorship bias baked in and every regression reads as a gap.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { EVAL_JUDGE_MODEL, EVAL_MODEL, RECORDS_PATH, REPO_ROOT } from "./config.js";
import type { Result } from "./run.js";
import type { Verdict } from "./scorers.js";

export interface Record_ {
  ts: string;
  sha: string;
  label: string;
  case: string;
  tier: string;
  model: string;
  judgeModel: string;
  grounded: number | null;
  score: number | null;
  passed: number | null;
  total: number | null;
  threshold: number | null;
  turns: number;
  isError: boolean;
  usage: Result["usage"];
  durationMs: number;
}

let cachedSha: string | undefined;
function sha(): string {
  if (cachedSha !== undefined) return cachedSha;
  try {
    cachedSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    cachedSha = "unknown";
  }
  return cachedSha;
}

export function record(
  name: string,
  data: {
    tier: string;
    result: Result;
    verdict?: Verdict;
    grounded?: number;
    threshold?: number;
    /** Set by repeat/bench runs so rows can be grouped into a series. */
    label?: string;
  },
): void {
  const row: Record_ = {
    ts: new Date().toISOString(),
    sha: sha(),
    label: data.label ?? process.env.EVAL_LABEL ?? "",
    case: name,
    tier: data.tier,
    model: EVAL_MODEL,
    judgeModel: EVAL_JUDGE_MODEL,
    grounded: data.grounded ?? null,
    score: data.verdict?.score ?? null,
    passed: data.verdict?.passed ?? null,
    total: data.verdict?.total ?? null,
    threshold: data.threshold ?? null,
    turns: data.result.turns,
    isError: data.result.isError,
    usage: data.result.usage,
    durationMs: data.result.durationMs,
  };

  mkdirSync(dirname(RECORDS_PATH), { recursive: true });
  appendFileSync(RECORDS_PATH, `${JSON.stringify(row)}\n`, "utf8");
}

export function readRecords(): Record_[] {
  if (!existsSync(RECORDS_PATH)) return [];
  return readFileSync(RECORDS_PATH, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record_);
}
