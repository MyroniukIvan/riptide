/** Every knob in one place, all env-overridable. */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EVALS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(EVALS_DIR, "..");

/** Model under test. Use the smallest one that still discriminates. */
export const EVAL_MODEL = process.env.EVAL_MODEL ?? "claude-haiku-4-5";

/**
 * Judge model. Deliberately a stronger family than the task model — it softens
 * self-preference bias. On a shared subscription the families still overlap, so
 * the structural mitigations (blind, binary, verbatim evidence) do the real work.
 */
export const EVAL_JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-sonnet-5";

export const DEFAULT_THRESHOLD = Number(process.env.EVAL_THRESHOLD ?? 0.6);

/** A runaway agent loop is the most expensive failure a suite has. Cap it. */
export const DEFAULT_MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? 12);

export const RECORDS_PATH = resolve(
  EVALS_DIR,
  process.env.EVAL_RECORDS ?? "results/records.jsonl",
);

export const VERBOSE = process.env.EVAL_VERBOSE === "1";

/**
 * Default is the Claude Code subscription: the API key is stripped from the
 * spawned process so calls go through your login rather than per-token billing.
 * Opt into the key explicitly when you actually want metered API usage.
 */
export const USE_API_KEY = process.env.EVAL_USE_API_KEY === "1";
