import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.episode1.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
// webflow renders at most this many items of a collection at once
const LIST_LIMIT = 100;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// a company episode 1 has sold is one it is out of; one that has died is not
const EXITS = new Set(["acquired", "ipo"]);

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
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  const items = html.split('role="listitem" class="portfolio-item accordion-item w-dyn-item"').slice(1);
  if (items.length === 0) {
    throw new Error("episode 1: no companies found in the portfolio");
  }
  if (items.length >= LIST_LIMIT) {
    throw new Error(
      `episode 1: the portfolio list is full at ${LIST_LIMIT} — a company is hidden behind it`,
    );
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const name = text(item.match(/class="text-bold">([\s\S]*?)<\/div>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // each fact is written under the word naming it, which the panel spells
    // out even where the row above abbreviates it
    const stage = text(item.match(/>Stage<\/div><div class="text-medium">([\s\S]*?)<\/div>/)?.[1] ?? "");
    const status = text(item.match(/>Status<\/div><div class="tag"><div>([\s\S]*?)<\/div>/)?.[1] ?? "");

    companies.push({
      name,
      category: [
        ...[...item.matchAll(/fs-cmsfilter-field="sector">([\s\S]*?)<\/div>/g)].map((m) => text(m[1])),
        stage,
        // "Active" is a company episode 1 still holds
        status.toLowerCase() === "active" ? "" : status,
        EXITS.has(status.toLowerCase()) ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: item.match(/>website<\/div><a[^>]*href="(https?:\/\/[^"]+)"/)?.[1] ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("episode 1: no company was named — the portfolio rows moved");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("episode 1: the portfolio's sectors and stages moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("episode 1: the companies' website links moved");
  }

  return companies;
}
