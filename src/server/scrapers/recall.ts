import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.recall.capital/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;|&rsquo;/g, "'")
    .trim();

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  for (const item of html.split('class="portfolio-item w-dyn-item"').slice(1)) {
    const name = item.match(/class="title_text portfolio-name">([^<]*)</)?.[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // each card carries which vehicle invested (Angel / Fund I) and the status
    const type = item.match(/class="category-text-type">([^<]*)</)?.[1] ?? "";
    const status = item.match(/class="category-text-status">([^<]*)</)?.[1] ?? "";
    // the card links to the company site as well as its own detail page
    const url =
      [...item.matchAll(/href="(https?:\/\/[^"]+)"/g)]
        .map((m) => m[1])
        .find((href) => !/recall\.capital|website-files/.test(href)) ?? "";

    companies.push({
      name: decode(name),
      // "Active" is the default state; only exits are worth recording
      category: [decode(type), status.trim() !== "Active" ? decode(status) : ""]
        .filter(Boolean)
        .join(", "),
      url,
    });
  }

  if (companies.length === 0) {
    throw new Error("recall: no companies found in the portfolio list");
  }

  return companies;
}
