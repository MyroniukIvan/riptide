/**
 * Runtime: one prompt in, one Result out. The Result carries the trace
 * (tool calls, files read, subagents, skills) as well as the text, because
 * Tier 3 asserts on behaviour a content-only eval cannot see.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { DEFAULT_MAX_TURNS, EVAL_MODEL, USE_API_KEY } from "./config.js";

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface Result {
  text: string;
  toolCalls: { name: string; input: unknown }[];
  filesRead: string[];
  subagents: string[];
  skillsInvoked: string[];
  turns: number;
  isError: boolean;
  usage: Usage;
  durationMs: number;
}

/** Partial view handed to `stopWhen` while the run is still in flight. */
export type Partial_ = Pick<Result, "filesRead" | "subagents" | "skillsInvoked" | "toolCalls">;

export interface RunOptions {
  model?: string;
  maxTurns?: number;
  allowedTools?: string[];
  systemPrompt?: string;
  cwd?: string;
  /**
   * Load on-disk configuration or not. `[]` isolates the artifact under test;
   * `["project"]` loads the real harness so activation and dispatch become
   * observable. See harness-spec.md §2.
   */
  settingSources?: string[];
  /**
   * Stop as soon as the assertion can be decided. A dispatch case does not need
   * to wait out the subagent's whole nested run — this is a real cost lever.
   */
  stopWhen?: (partial: Partial_) => boolean;
}

const SUBAGENT_TOOLS = new Set(["Task", "Agent"]);
const READ_TOOLS = new Set(["Read", "NotebookRead"]);

function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
}

function addUsage(into: Usage, u: Record<string, unknown> | undefined): void {
  if (!u) return;
  into.input += Number(u.input_tokens ?? 0);
  into.output += Number(u.output_tokens ?? 0);
  into.cacheRead += Number(u.cache_read_input_tokens ?? 0);
  into.cacheCreation += Number(u.cache_creation_input_tokens ?? 0);
}

export async function run(prompt: string, opts: RunOptions = {}): Promise<Result> {
  const started = Date.now();

  const env = { ...process.env };
  if (!USE_API_KEY) delete env.ANTHROPIC_API_KEY;

  const result: Result = {
    text: "",
    toolCalls: [],
    filesRead: [],
    subagents: [],
    skillsInvoked: [],
    turns: 0,
    isError: false,
    usage: emptyUsage(),
    durationMs: 0,
  };

  // Streaming re-emits the same assistant message; dedupe usage by message id or
  // every token number comes out inflated several-fold.
  const seenUsage = new Set<string>();

  const stream = query({
    prompt,
    options: {
      model: opts.model ?? EVAL_MODEL,
      maxTurns: opts.maxTurns ?? DEFAULT_MAX_TURNS,
      ...(opts.allowedTools ? { allowedTools: opts.allowedTools } : {}),
      ...(opts.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
      settingSources: opts.settingSources ?? [],
      env,
    },
  } as Parameters<typeof query>[0]);

  for await (const message of stream) {
    const msg = message as Record<string, any>;

    if (msg.type === "assistant") {
      result.turns += 1;
      const id = msg.message?.id;
      if (typeof id === "string" && !seenUsage.has(id)) {
        seenUsage.add(id);
        addUsage(result.usage, msg.message?.usage);
      }

      for (const block of msg.message?.content ?? []) {
        if (block.type === "text" && typeof block.text === "string") {
          result.text += block.text;
        }
        if (block.type !== "tool_use") continue;

        const name = String(block.name ?? "");
        const input = block.input ?? {};
        result.toolCalls.push({ name, input });

        if (READ_TOOLS.has(name) && typeof input.file_path === "string") {
          result.filesRead.push(input.file_path);
        }
        if (SUBAGENT_TOOLS.has(name)) {
          const type = input.subagent_type ?? input.agentType ?? input.description;
          if (typeof type === "string") result.subagents.push(type);
        }
        if (name === "Skill" && typeof input.skill === "string") {
          result.skillsInvoked.push(input.skill);
        }
      }

      if (opts.stopWhen?.(result)) break;
    }

    if (msg.type === "result") {
      if (typeof msg.result === "string" && msg.result.length > result.text.length) {
        result.text = msg.result;
      }
      result.isError = Boolean(msg.is_error) || msg.subtype === "error_max_turns";
    }
  }

  result.durationMs = Date.now() - started;
  return result;
}
