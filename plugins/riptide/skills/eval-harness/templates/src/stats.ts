/**
 * Statistics over results/records.jsonl. One run is not a measurement.
 *
 *   tsx src/stats.ts repeat "<case name>" [n]   noise floor
 *   tsx src/stats.ts bench  "<case name>"       with vs without the artifact
 *   tsx src/stats.ts delta  "<labelA>" "<labelB>"  version vs version
 *   tsx src/stats.ts summary                    every case, latest run
 */

import { execFileSync } from "node:child_process";
import { EVALS_DIR } from "./config.js";
import { readRecords, type Record_ } from "./record.js";

function stats(xs: number[]) {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return {
    n: xs.length,
    mean: +mean.toFixed(3),
    sd: +Math.sqrt(variance).toFixed(3),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

function scores(rows: Record_[]): number[] {
  return rows.map((r) => r.score).filter((s): s is number => s !== null);
}

function runVitest(pattern: string, label: string): void {
  execFileSync("npx", ["vitest", "run", "-t", pattern], {
    cwd: EVALS_DIR,
    stdio: "inherit",
    env: { ...process.env, EVAL_LABEL: label },
  });
}

function since(): (r: Record_) => boolean {
  const mark = new Date().toISOString();
  return (r) => r.ts >= mark;
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "repeat") {
  const name = args[0];
  const n = Number(args[1] ?? 5);
  if (!name) throw new Error('usage: stats.ts repeat "<case name>" [n]');

  const after = since();
  for (let i = 0; i < n; i++) {
    console.log(`\n— run ${i + 1}/${n} —`);
    try {
      runVitest(name, `repeat-${i + 1}`);
    } catch {
      // A failing run is data. Keep going; the record was already written.
    }
  }
  const rows = readRecords().filter((r) => r.case === name && after(r));
  console.log(`\nrepeat "${name}"`, stats(scores(rows)) ?? "no scored rows");
  console.log("Interpret any comparison against this spread — a gap smaller than sd is noise.");
} else if (cmd === "bench") {
  const name = args[0];
  if (!name) throw new Error('usage: stats.ts bench "<case name>"');
  console.log(
    [
      "Benchmark = run the case WITH the artifact under test, then WITHOUT it.",
      "The gap is the measured lift — the only number that answers whether the",
      "artifact earns its tokens.",
      "",
      "  1. npx vitest run -t <case>                 # treatment (EVAL_LABEL=with)",
      "  2. point the suite at an empty artifact     # control  (EVAL_LABEL=without)",
      "  3. tsx src/stats.ts delta with without",
      "",
      "Automating step 2 means knowing which artifact each case targets — wire it",
      "in your own cases file rather than guessing here.",
    ].join("\n"),
  );
} else if (cmd === "delta") {
  const [a, b] = args;
  if (!a || !b) throw new Error('usage: stats.ts delta "<labelA>" "<labelB>"');
  const rows = readRecords();
  const sa = stats(scores(rows.filter((r) => r.label === a)));
  const sb = stats(scores(rows.filter((r) => r.label === b)));
  console.log(`${a}:`, sa ?? "no rows");
  console.log(`${b}:`, sb ?? "no rows");
  if (sa && sb) {
    const gap = +(sa.mean - sb.mean).toFixed(3);
    const noise = Math.max(sa.sd, sb.sd);
    console.log(
      `delta: ${gap > 0 ? "+" : ""}${gap} (noise floor ±${noise}) — ` +
        (Math.abs(gap) > noise ? "outside the noise floor" : "INSIDE the noise floor, not a result"),
    );
  }
} else {
  const rows = readRecords();
  const byCase = new Map<string, Record_[]>();
  for (const r of rows) byCase.set(r.case, [...(byCase.get(r.case) ?? []), r]);
  console.log(`${rows.length} records · ${byCase.size} cases\n`);
  for (const [name, rs] of [...byCase].sort()) {
    const last = rs[rs.length - 1]!;
    const s = stats(scores(rs));
    console.log(
      `${last.score === null ? "  —  " : last.score.toFixed(2).padStart(5)}  ${name}` +
        (s && s.n > 1 ? `   (n=${s.n} mean=${s.mean} sd=${s.sd})` : ""),
    );
  }
}
