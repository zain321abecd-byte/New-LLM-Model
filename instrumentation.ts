/** Runs once when the server starts. */
export async function register() {
  // Only on a long-running Node server; on Vercel the poll route is scheduled instead.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const enabled = process.env.WHATSAPP_AGENT_ENABLED === "true" || process.env.WHATSAPP_AGENT_ENABLED === "1";
    if (enabled && !process.env.VERCEL) {
      const { startWhatsAppAgentWorker } = await import("./lib/agent/whatsapp-agent-worker");
      startWhatsAppAgentWorker();
    }
  }
}
