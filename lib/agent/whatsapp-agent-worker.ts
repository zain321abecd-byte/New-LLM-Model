/**
 * In-process background worker for the WhatsApp agent, started from
 * instrumentation.ts when WHATSAPP_AGENT_ENABLED=true on a long-running
 * server (`npm run dev` / `npm start`). It calls this server's own
 * /api/whatsapp-agent/poll back to back, authenticated with a random token
 * that exists only in this process. On Vercel, schedule that route instead.
 */
const g = globalThis as typeof globalThis & { __theronAgentWorker?: boolean; __theronAgentWorkerToken?: string };

export function workerToken(): string | undefined {
  return g.__theronAgentWorkerToken;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startWhatsAppAgentWorker() {
  if (g.__theronAgentWorker) return;
  g.__theronAgentWorker = true;
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  g.__theronAgentWorkerToken = token;
  const url = `http://127.0.0.1:${process.env.PORT || 3003}/api/whatsapp-agent/poll`;
  console.log("[wa-agent] background worker started");

  void (async () => {
    await sleep(3_000); // let the server finish starting
    let backoff = 5_000;
    for (;;) {
      try {
        const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(330_000) });
        if (!res.ok) throw new Error(`poll returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const r = (await res.json()) as { enabled: boolean; connections: number };
        if (!r.enabled) {
          console.log("[wa-agent] WHATSAPP_AGENT_ENABLED is off; background worker stopped");
          g.__theronAgentWorker = false;
          return;
        }
        backoff = 5_000;
        if (!r.connections) await sleep(30_000); // nothing connected yet: check back later
      } catch (err) {
        console.error(`[wa-agent] worker error; retrying in ${backoff / 1000}s:`, (err as Error).message);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 60_000);
      }
    }
  })();
}
