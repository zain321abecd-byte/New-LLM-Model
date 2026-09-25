import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { logUsage } from "@/lib/db";
import { SYSTEM_PROMPT, workspaceContext } from "@/lib/agent/prompt";
import { runTool, toolDefinitions, type ToolContext } from "@/lib/agent/tools";

/**
 * The agent loop: Claude decides which tools to call; we execute them and feed
 * results back until it answers. A manual loop (rather than the SDK's tool
 * runner) because each turn needs workspace-scoped context threaded through
 * every tool, and usage metering per iteration.
 */

const MAX_ITERATIONS = 24;
const HISTORY_TURNS = 20;

let client: Anthropic | undefined;
function anthropic() {
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");
  // Proxies are often documented as ".../v1"; the SDK adds /v1 itself.
  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim().replace(/\/v1\/?$/, "") || undefined;
  client ??= new Anthropic({ apiKey: key, baseURL, maxRetries: 3 });
  return client;
}

// Anthropic-compatible proxies often reject beta headers, adaptive thinking,
// effort or server tools. After the first such rejection (or with
// AGENT_COMPAT=1), requests use only the basic Messages API surface.
let compat = process.env.AGENT_COMPAT === "1";

type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;

// Blocks only the full API produces; dropped if the switch happens mid-run.
const FULL_ONLY_BLOCKS = new Set(["thinking", "redacted_thinking", "server_tool_use", "web_search_tool_result", "fallback"]);

function compatParams(p: CreateParams): Anthropic.MessageCreateParamsNonStreaming {
  const tools = (p.tools ?? []).filter((t): t is Anthropic.Beta.BetaTool => "input_schema" in t).map(({ cache_control: _c, ...t }) => t);
  const messages = p.messages.map((m) =>
    typeof m.content === "string" ? m : { ...m, content: m.content.filter((b) => !FULL_ONLY_BLOCKS.has(b.type)) },
  );
  return { model: p.model, max_tokens: p.max_tokens, system: p.system, tools, messages } as unknown as Anthropic.MessageCreateParamsNonStreaming;
}

async function createMessage(p: CreateParams): Promise<Anthropic.Beta.BetaMessage> {
  const plain = () => anthropic().messages.create(compatParams(p)) as unknown as Promise<Anthropic.Beta.BetaMessage>;
  if (compat) return plain();
  try {
    return await anthropic().beta.messages.create(p);
  } catch (err) {
    const unsupported = err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError || err instanceof Anthropic.UnprocessableEntityError;
    if (!unsupported) throw err;
    const reply = await plain(); // if this fails too, the problem isn't the feature set
    compat = true;
    console.warn("[agent] endpoint rejected advanced features; using basic Messages API from now on:", (err as Error).message);
    return reply;
  }
}

/** A short, secret-free explanation of why the AI call failed, for the user's reply. */
export function describeAgentError(err: unknown): string {
  const model = env().AGENT_MODEL;
  if (err instanceof Anthropic.AuthenticationError) return "The AI key was rejected. Check ANTHROPIC_API_KEY in the server settings (and ANTHROPIC_BASE_URL if the key is for a proxy).";
  if (err instanceof Anthropic.PermissionDeniedError) return `The AI key isn't allowed to use model ${model}. Set AGENT_MODEL to a model the key can use.`;
  if (err instanceof Anthropic.NotFoundError) return `The AI model "${model}" wasn't found at the AI endpoint. Set AGENT_MODEL to a model it supports.`;
  if (err instanceof Anthropic.RateLimitError) return "The AI service is rate-limiting requests. Try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Check the internet connection and ANTHROPIC_BASE_URL.";
  if (err instanceof Anthropic.InternalServerError) return "The AI service is having trouble right now. Try again in a minute.";
  if (err instanceof Anthropic.BadRequestError) return `The AI service rejected the request: ${err.message.slice(0, 200)}`;
  if (err instanceof Error && /ANTHROPIC_API_KEY/.test(err.message)) return err.message;
  return "Something went wrong on my side while working on that.";
}

export interface AgentTurnResult {
  reply: string;
  lastLeadIds: string[];
}

export async function runAgent(
  ctx: ToolContext,
  channel: "whatsapp" | "web",
  userText: string,
  onProgress?: () => void,
): Promise<AgentTurnResult> {
  const e = env();

  // Prior turns are stored as plain text. Tool calls and results from earlier
  // turns are not replayed: they are large, and the CRM is the durable memory.
  const history: Anthropic.Beta.BetaMessageParam[] = ctx.thread.history.slice(-HISTORY_TURNS * 2).map((h) => ({ role: h.role, content: h.text }));
  while (history.length && history[0].role !== "user") history.shift();

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    { role: "user", content: `${workspaceContext(ctx.workspace, channel, ctx.thread.last_lead_ids.length)}\n\n---\n\n${userText}` },
  ];

  const tools = toolDefinitions();
  // Cache breakpoint on the last tool caches tools + system together.
  const last = tools[tools.length - 1] as { cache_control?: { type: "ephemeral" } };
  last.cache_control = { type: "ephemeral" };

  let finalText = "";
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (i > 0) onProgress?.();
    const response = await createMessage({
      model: e.AGENT_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: e.AGENT_EFFORT },
      system: [{ type: "text", text: SYSTEM_PROMPT }],
      tools,
      messages,
    });

    void logUsage(ctx.workspace.id, "ai_tokens", response.usage.input_tokens + response.usage.output_tokens, {
      model: response.model,
      cache_read: response.usage.cache_read_input_tokens,
    });

    if (response.stop_reason === "refusal") {
      return { reply: "I can't help with that request. Try rephrasing what kind of leads or outreach you need.", lastLeadIds: ctx.lastLeadIds };
    }

    const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (text) finalText = text;

    messages.push({ role: "assistant", content: response.content });

    // Server-side web search hit its per-request iteration limit; resend to continue.
    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      if (response.stop_reason === "max_tokens" && !finalText) finalText = "That got too long for one reply. Ask me for a narrower slice.";
      break;
    }

    // Parallel tool calls run concurrently; all results go back in one message.
    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const r = await runTool(t.name, t.input, ctx);
        return { type: "tool_result", tool_use_id: t.id, content: r.content, is_error: r.isError };
      }),
    );
    messages.push({ role: "user", content: results });

    if (i === MAX_ITERATIONS - 1) {
      finalText ||= "I hit my step limit on this one. Everything found so far is saved; say \"continue\" to keep going.";
    }
  }

  return { reply: finalText || "Done.", lastLeadIds: ctx.lastLeadIds };
}
