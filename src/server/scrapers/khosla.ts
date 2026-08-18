import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.khoslaventures.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 8;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, named) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return NAMED[String(named).toLowerCase()] ?? whole;
  });

const text = (s: string) =>
  decode(s.replace(/<[^>]+>/g, " "))
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchPage(url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(url, { headers: { "User-Agent": UA } });
      if (!resp.ok) {
        throw new Error(`Failed to fetch ${url}: ${resp.status}`);
      }
      return await resp.text();
    } catch (err) {
      lastError = err;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError;
}

interface Entry {
  tags: string[];
  exited: boolean;
  url: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const portal = await fetchPage(PAGE_URL);

  // the portfolio page names the category pages; "Exits" is one of them
  const categories = new Map<string, string>();
  for (const m of portal.matchAll(
    /<a href="\/category\/([a-z0-9-]+)"[^>]*>\s*<div class="category-text">([^<]+)</g,
  )) {
    categories.set(m[1], text(m[2]));
  }
  if (categories.size === 0) {
    throw new Error("khosla: the category links moved");
  }

  // a company may sit in several categories, so tags accumulate per name
  const byName = new Map<string, Entry>();
  for (const [slug, label] of categories) {
    const html = await fetchPage(`${BASE_URL}/category/${slug}`);
    // the category khosla calls "Select Exits" is the exit marker here
    const isExits = /exits?$/i.test(label);
    for (const card of html.split('class="company-card-item w-dyn-item">').slice(1)) {
      const url = card.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="company-slide/)?.[1] ?? "";
      const name = text(card.match(/<img[^>]*alt="([^"]*)"/)?.[1] ?? "");
      if (!name) continue;
      const entry = byName.get(name) ?? { tags: [], exited: false, url: "" };
      if (isExits) entry.exited = true;
      else if (!entry.tags.includes(label)) entry.tags.push(label);
      if (!entry.url) entry.url = url;
      byName.set(name, entry);
    }
  }
  if (byName.size === 0) {
    throw new Error("khosla: no companies found on the category pages");
  }

  // the sitemap's featured profile pages carry a handful of companies the
  // category grids may not; their status label sits next to the website link
  const sitemap = await fetchPage(`${BASE_URL}/sitemap.xml`);
  const slugs = [
    ...new Set(
      [...sitemap.matchAll(/<loc>https:\/\/www\.khoslaventures\.com\/portfolio\/([^<]+)<\/loc>/g)].map(
        (m) => m[1],
      ),
    ),
  ];
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    await Promise.all(
      slugs.slice(i, i + BATCH_SIZE).map(async (slug) => {
        // the sitemap keeps entries for profiles that have since been taken
        // down; a page that is gone simply adds nothing
        let html: string;
        try {
          html = await fetchPage(`${BASE_URL}/portfolio/${slug}`);
        } catch (err) {
          if (err instanceof Error && err.message.endsWith(": 404")) return;
          throw err;
        }
        const name = text(
          html.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/^Khosla Ventures\s*-\s*/, "") ?? "",
        );
        if (!name || byName.has(name)) return;
        const status = text(html.match(/company-fact-label">([^<]*)<\/div>\s*<a /)?.[1] ?? "");
        byName.set(name, {
          // "Public" and "Acquired" are milestones as khosla states them
          tags: status && status !== "Private" ? [status] : [],
          exited: false,
          url: html.match(/<a href="(https?:\/\/[^"]+)" class="company-fact-text"/)?.[1] ?? "",
        });
      }),
    );
  }

  const companies = [...byName.entries()].map(([name, entry]) => ({
    name,
    category: [...entry.tags, entry.exited ? "Exited" : ""].filter(Boolean).join(", "),
    url: entry.url,
  }));

  if (!companies.some((company) => company.category)) {
    throw new Error("khosla: the category markers moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("khosla: the companies' website links moved");
  }

  return companies;
}
