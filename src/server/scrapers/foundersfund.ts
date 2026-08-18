import type { ScrapedCompany } from './types';

const API_URL = "https://foundersfund.com/wp-json/wp/v2/company";
const PER_PAGE = 100;
const MAX_PAGES = 20;
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

interface WpCompany {
  title?: { rendered?: string };
  // the industry taxonomy arrives already resolved to its label
  industry?: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  let total = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const resp = await fetch(`${API_URL}?per_page=${PER_PAGE}&page=${page}`, {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) {
      throw new Error(`Failed to fetch ${API_URL} page ${page}: ${resp.status}`);
    }
    total = Number(resp.headers.get("x-wp-total") ?? "0");
    const rows = (await resp.json()) as WpCompany[];

    for (const row of rows) {
      const name = text(row.title?.rendered ?? "");
      if (!name || seen.has(name)) continue;
      seen.add(name);
      companies.push({
        name,
        category: text(row.industry ?? ""),
        // founders fund publishes no website links for its companies, not
        // even on their profile pages
        url: "",
      });
    }

    if (rows.length < PER_PAGE) break;
  }

  if (companies.length === 0) {
    throw new Error("founders fund: the company API returned nothing");
  }
  if (total > 0 && companies.length < total) {
    throw new Error(
      `founders fund: found ${companies.length} companies but the API promises ${total}`,
    );
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("founders fund: the industry labels moved");
  }

  return companies;
}
