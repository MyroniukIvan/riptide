import type { QualityCase, TraceCase } from "../../src/index.js";

/**
 * Inline fixture. `isolatedTask` gives the model no tools, so everything it
 * needs must be in the prompt. The (A)/(B) labels are load-bearing: practices
 * reference them so the judge can find verbatim evidence without ambiguity.
 */
const FIXTURE = `Review this code for correctness and safety problems. For each
problem, name the rule it breaks, quote the offending line, and show the fix.

\`\`\`ts
// Handles untrusted webhook payloads.
export async function handle(req: Request): Promise<Response> {
  const body = await req.json();
  const invoice = schema.parse(body);          // (A)
  const total = invoice.items.reduce((a, i) => a + i.price, 0);
  db.query(\`INSERT INTO invoices (id, total) VALUES ('\${invoice.id}', \${total})\`); // (B)
  return Response.json({ ok: true });
}
\`\`\``;

export const cases: QualityCase[] = [
  {
    name: "flags throwing validation and string-interpolated SQL",
    prompt: FIXTURE,

    // Cheap deterministic gate. Both are the exact fixes, so their absence
    // means the answer is wrong regardless of how well it reads — and the
    // judge is never paid for a case that fails here.
    grounding: ["safeParse", "parameterized"],

    practices: [
      // Falsifiable: without the artifact under test, a model wraps parse() in
      // try/catch rather than switching to the non-throwing API.
      "flags line (A) — `schema.parse(body)` — as unsafe for an untrusted payload and recommends `safeParse()`, showing the `success` branch that handles failure without throwing",

      // Falsifiable: without it, a model calls the query 'a bit risky' and
      // suggests escaping rather than parameterisation.
      "flags line (B) as SQL injection, quoting the interpolated query verbatim, and gives a parameterized-query replacement rather than escaping",

      // Depth check: a keyword-level answer stops at the swap and never
      // mentions the consequence at the call site.
      "explains that the two fixes are not drop-in swaps — the caller must handle the validation failure branch explicitly",
    ],

    threshold: 0.6,
    maxTurns: 6,
  },
];

/**
 * Trace cases run against the real harness. A content-only suite cannot see
 * whether a skill actually fires — and "it silently stopped triggering" is the
 * most common harness regression there is.
 */
export const traceCases: TraceCase[] = [
  {
    name: "a security-shaped request activates the security discipline",
    prompt: "Review src/api/webhook.ts for injection risks before I open a PR.",
    expectSkills: ["ship"],
    maxTurns: 6,
  },
  {
    // The negative case. A component that fires on everything is as broken as
    // one that never fires.
    name: "a trivial formatting request does NOT activate it",
    prompt: "Rename the variable `x` to `count` in src/util.ts.",
    expectSkills: ["ship"],
    shouldActivate: false,
    maxTurns: 4,
  },
];
