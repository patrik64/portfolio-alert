import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.khoslaventures.com";
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
  // the portfolio page only shows each category as a teaser carousel; the full
  // grids live on the category pages, which the sitemap is the one place to
  // enumerate — "exits" among them, which the portfolio page doesn't link
  const sitemap = await fetchPage(`${BASE_URL}/sitemap.xml`);
  const slugs = [
    ...new Set(
      [...sitemap.matchAll(/<loc>https:\/\/www\.khoslaventures\.com\/category\/([^<]+)<\/loc>/g)].map(
        (m) => m[1],
      ),
    ),
  ];
  if (slugs.length === 0) {
    throw new Error("khosla: the category links moved");
  }

  // a company may sit in several categories, so tags accumulate per name
  const byName = new Map<string, Entry>();
  for (const slug of slugs) {
    const html = await fetchPage(`${BASE_URL}/category/${slug}`);
    // the page titles itself "Khosla Ventures - <category>"
    const label = text(
      html.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/^Khosla Ventures\s*-\s*/, "") ?? "",
    );
    // the category khosla calls "Select Exits" is the exit marker here
    const isExits = /exits?$/i.test(label || slug);
    for (const card of html.split('class="company-card-item w-dyn-item">').slice(1)) {
      // the card's face shows the tagline; the name is on its flip side, with
      // the logo's alt text as the fallback
      const name = text(
        card.match(/class="back-company-title">([\s\S]*?)<\/div>/)?.[1] ??
          card.match(/<img[^>]*alt="([^"]*)"[^>]*class="company-card-image"/)?.[1] ??
          "",
      );
      if (!name) continue;
      const url = card.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="company-card-wrapper/)?.[1] ?? "";
      const entry = byName.get(name) ?? { tags: [], exited: false, url: "" };
      if (isExits) entry.exited = true;
      else if (label && !entry.tags.includes(label)) entry.tags.push(label);
      if (!entry.url) entry.url = url;
      byName.set(name, entry);
    }
  }
  if (byName.size === 0) {
    throw new Error("khosla: no companies found on the category pages");
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
