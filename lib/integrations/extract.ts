import "server-only";
import { fetchPublicPage, toDomain } from "@/lib/http";

export interface ExtractedPage {
  url: string;
  domain: string | null;
  title: string | null;
  description: string | null;
  emails: string[];
  phones: string[];
  linkedin_company: string | null;
  linkedin_people: string[];
  text_excerpt: string;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
const JUNK_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|@(example|sentry|wixpress|domain)\.|^(noreply|no-reply)@/i;

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&#64;|&commat;/g, "@").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function meta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
  return html.match(re)?.[1]?.trim() || null;
}

function parse(url: string, rawHtml: string): ExtractedPage {
  const html = decodeEntities(rawHtml);
  const domain = toDomain(url);

  const emails = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) emails.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of html.matchAll(EMAIL_RE)) emails.add(m[0].toLowerCase());
  const cleanEmails = [...emails].filter((e) => !JUNK_EMAIL.test(e)).slice(0, 10);

  const phones = new Set<string>();
  for (const m of html.matchAll(/tel:([+\d()\-.\s]{7,20})/gi)) phones.add(m[1].trim());

  const linkedin = [...html.matchAll(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(company|in)\/[A-Za-z0-9_%\-]+/gi)].map((m) => m[0]);

  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    url,
    domain,
    title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || meta(html, "og:title"),
    description: meta(html, "description") || meta(html, "og:description"),
    emails: cleanEmails,
    phones: [...phones].slice(0, 5),
    linkedin_company: linkedin.find((l) => l.includes("/company/")) ?? null,
    linkedin_people: [...new Set(linkedin.filter((l) => l.includes("/in/")))].slice(0, 5),
    text_excerpt: text.slice(0, 1500),
  };
}

/**
 * Lead extraction: visit a company's site (home page plus its contact/about
 * page when one is linked) and pull out public business contact details.
 */
export async function extractFromSite(rawUrl: string): Promise<ExtractedPage | null> {
  const home = await fetchPublicPage(rawUrl);
  if (!home) return null;
  const result = parse(home.url, home.html);

  const contactHref = home.html.match(/href=["']([^"']*(?:contact|about|team|impressum)[^"']*)["']/i)?.[1];
  if (contactHref) {
    try {
      const contactUrl = new URL(contactHref, home.url);
      if (toDomain(contactUrl.toString()) === result.domain) {
        const page = await fetchPublicPage(contactUrl.toString());
        if (page) {
          const extra = parse(page.url, page.html);
          result.emails = [...new Set([...result.emails, ...extra.emails])].slice(0, 10);
          result.phones = [...new Set([...result.phones, ...extra.phones])].slice(0, 5);
          result.linkedin_company ??= extra.linkedin_company;
          result.linkedin_people = [...new Set([...result.linkedin_people, ...extra.linkedin_people])].slice(0, 5);
        }
      }
    } catch {
      // Malformed href: the home page result stands on its own.
    }
  }
  return result;
}
