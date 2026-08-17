import { describeSuite, runQualityCases, runTraceCases } from "../../src/index.js";
import { cases, traceCases } from "./example.cases.js";

// Relative to the repo root — see REPO_ROOT in src/config.ts.
// Point this at your own surface; the sample artifact is here so a fresh copy runs.
const ARTIFACT = "evals/cases/example/artifact.md";

describeSuite("quality", "example", () => runQualityCases(ARTIFACT, cases));

describeSuite("trace", "example", () => runTraceCases(traceCases));
