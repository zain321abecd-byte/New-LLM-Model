// Calls the WhatsApp agent poll endpoint back to back (each call long-polls
// for ~50s). Usually not needed: with WHATSAPP_AGENT_ENABLED=true, `npm run dev`
// and `npm start` run a background worker that does this. Use it to drive a
// server elsewhere, e.g. NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app.
// Usage: npm run agent:poll   (reads NEXT_PUBLIC_SITE_URL and CRON_SECRET from .env.local)
const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3003").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Set CRON_SECRET in .env.local first (any long random string).");
  process.exit(1);
}

console.log(`Polling ${site}/api/whatsapp-agent/poll. Ctrl+C to stop.`);
for (;;) {
  try {
    const res = await fetch(`${site}/api/whatsapp-agent/poll`, { headers: { authorization: `Bearer ${secret}` } });
    const body = await res.text();
    if (!res.ok) console.error(`${new Date().toLocaleTimeString()}  ${res.status} ${body.slice(0, 200)}`);
    else {
      const r = JSON.parse(body);
      if (r.enabled === false) {
        console.error("WHATSAPP_AGENT_ENABLED is not true on the server. Set it in .env.local and restart npm run dev.");
        process.exit(1);
      }
      if (r.messages) console.log(`${new Date().toLocaleTimeString()}  answered ${r.messages} message(s)`);
    }
    if (!res.ok) await new Promise((r) => setTimeout(r, 10_000));
  } catch (err) {
    console.error(`${new Date().toLocaleTimeString()}  ${err.message}. Is \`npm run dev\` running?`);
    await new Promise((r) => setTimeout(r, 5_000));
  }
}
