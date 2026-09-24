import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** fetch with a timeout and JSON parsing; throws HttpError on non-2xx. */
export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init;
  const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, `${res.status} from ${new URL(url).host}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * Fetch a public web page for lead extraction. URLs come from search results
 * and from the model, so they are untrusted: only http(s), no credentials in
 * the URL, no hosts that resolve to private/loopback/metadata addresses, and
 * redirects are followed manually so each hop is re-checked. Returns at most
 * `maxBytes` of HTML.
 */
export async function fetchPublicPage(rawUrl: string, maxBytes = 400_000): Promise<{ url: string; html: string } | null> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.port && !["80", "443"].includes(url.port)) return null;
    const host = url.hostname;
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) return null;

    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; SDRAgentBot/1.0; +lead-research)", accept: "text/html" },
    }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html")) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    return { url: url.toString(), html: new TextDecoder().decode(Buffer.concat(chunks)).slice(0, maxBytes) };
  }
  return null;
}

export function toDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input.includes("://") ? input : `https://${input}`);
    return u.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}
