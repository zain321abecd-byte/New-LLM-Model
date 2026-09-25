// Checks which API features your Anthropic endpoint (direct or proxy) supports.
// Usage: npm run smoke:ai   (reads ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL / AGENT_MODEL from .env.local)
import Anthropic from "@anthropic-ai/sdk";

const model = process.env.AGENT_MODEL || "claude-opus-5";
// Same base URL handling as the app: a trailing /v1 is dropped (the SDK adds it).
const baseURL = process.env.ANTHROPIC_BASE_URL?.trim().replace(/\/v1\/?$/, "") || undefined;
const client = new Anthropic({ baseURL, maxRetries: 0, timeout: 60_000 });
console.log(`Endpoint: ${client.baseURL}\nModel:    ${model}\n`);

const checks = [
  ["basic message", () => client.messages.create({ model, max_tokens: 64, messages: [{ role: "user", content: "Reply with OK." }] })],
  ["adaptive thinking + effort", () => client.messages.create({
    model, max_tokens: 2000, thinking: { type: "adaptive" }, output_config: { effort: "medium" },
    messages: [{ role: "user", content: "Reply with OK." }],
  })],
  ["server-side fallbacks (beta)", () => client.beta.messages.create({
    model, max_tokens: 64, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    messages: [{ role: "user", content: "Reply with OK." }],
  })],
  ["custom tool use", async () => {
    const r = await client.messages.create({
      model, max_tokens: 1000,
      tools: [{ name: "get_pipeline_stats", description: "CRM totals.", input_schema: { type: "object", properties: {} } }],
      messages: [{ role: "user", content: "Call get_pipeline_stats." }],
    });
    if (!r.content.some((b) => b.type === "tool_use")) throw new Error(`no tool_use block (stop_reason: ${r.stop_reason})`);
    return r;
  }],
  ["Claude web search (server tool)", () => client.messages.create({
    model, max_tokens: 2000, tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 1 }],
    messages: [{ role: "user", content: "Search the web for 'Anthropic' and reply with one sentence." }],
  })],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    const r = await run();
    console.log(`PASS  ${name}${r?.model ? `  (served by ${r.model})` : ""}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Anthropic.APIError ? `${err.status ?? ""} ${err.message}` : String(err?.message ?? err);
    console.log(`FAIL  ${name}  ${msg.slice(0, 200)}`);
  }
}
console.log(failed ? `\n${failed} check(s) failed. The agent needs the first four; web search is only used when no SERPAPI/Google key is set.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
