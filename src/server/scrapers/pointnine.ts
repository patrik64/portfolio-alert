import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.pointnine.com/companies";
const MAX_PAGES = 40;
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

const CARD_MARKER = 'role="listitem" class="cms_ci is-companies w-dyn-item"';

export async function scrape(): Promise<ScrapedCompany[]> {
  const first = await fetchPage(BASE_URL);

  // webflow's own pagination; the next-page link names the query parameter,
  // and the pager states the total ("1 / 8") for a completeness check
  const pageParam = first.match(/href="\?([a-z0-9_]+_page)=2"/)?.[1];
  const totalPages = Number(first.match(/\b1\s*\/\s*(\d+)\b/)?.[1] ?? "0");

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  let pagesRead = 0;

  const collect = (html: string) => {
    const cards = html.split(CARD_MARKER).slice(1);
    for (const card of cards.map((c) => c.slice(0, 2500))) {
      const name = text(card.match(/sort="name">([^<]+)</)?.[1] ?? "");
      if (!name || seen.has(name)) continue;
      seen.add(name);

      // the icon sitting right before the founding year names the stage the
      // company was at when point nine first backed it
      const stage = text(
        card.match(/alt="([^"]*)"[^>]*class="company_card-icon"[^>]*\/>\s*<div>\d{4}/)?.[1] ?? "",
      );
      // the status closes the card: "Active" is a company still held; the
      // others ("Acquired", "IPO", "RIP") are kept as point nine states them
      const status = text(card.match(/<div>([A-Za-z]+)<\/div><\/div><\/div><\/a>/)?.[1] ?? "");
      // an is-unicorn icon that isn't hidden marks a billion-dollar company
      const unicorn = /is-unicorn(?!\s+w-condition-invisible)/.test(card);

      companies.push({
        name,
        category: [stage, unicorn ? "Unicorn" : "", status === "Active" ? "" : status]
          .filter(Boolean)
          .join(", "),
        url: card.match(/<a target="_blank" href="(https?:\/\/[^"]+)"/)?.[1] ?? "",
      });
    }
    return cards.length;
  };

  if (collect(first) === 0) {
    throw new Error("pointnine: no companies found in the listing");
  }
  pagesRead = 1;
  if (pageParam) {
    for (let page = 2; page <= MAX_PAGES; page++) {
      const count = collect(await fetchPage(`${BASE_URL}?${pageParam}=${page}`));
      if (count === 0) break;
      pagesRead = page;
    }
  }

  if (totalPages > 0 && pagesRead < totalPages) {
    throw new Error(
      `pointnine: read ${pagesRead} pages but the pager promises ${totalPages}`,
    );
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("pointnine: the stage and status markers moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("pointnine: the companies' website links moved");
  }

  return companies;
}
