import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.flybridge.com/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // The page injects a modal per company (name, thematic category, website)
  // via an inline script. The "All Other Portfolio Companies" gallery holds
  // logo-only tiles without names, so it cannot be scraped.
  const companies: ScrapedCompany[] = [];
  const blocks = html.split(/<div id="modal-[a-z0-9-]+" class="portfolio-modal">/).slice(1);

  for (const block of blocks) {
    const name = block.match(/<h2>([^<]+)<\/h2>/)?.[1]?.trim();
    if (!name) continue;
    const category =
      block
        .match(/<p class="category">([^<]+)<\/p>/)?.[1]
        ?.replace(/&amp;/g, "&")
        .trim() ?? "";
    const url =
      block.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="portfolio-website-link"/)?.[1] ?? "";
    companies.push({ name, category, url });
  }

  return companies;
}
