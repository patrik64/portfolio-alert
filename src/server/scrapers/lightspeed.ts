import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const PAGE_URL = "https://lsvp.com/companies/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();
  const $ = cheerio.load(html);

  // Collect company names and detail page URLs from the listing
  const entries: { name: string; detailUrl: string }[] = [];
  $(".companies-list li[data-company-id]").each((_, el) => {
    const h5 = $(el).find("h5").clone();
    h5.find("span").remove(); // remove disclaimer spans inside h5
    const name = h5.text().trim();
    const detailUrl = $(el).find("a").first().attr("href") || "";
    if (name && detailUrl) entries.push({ name, detailUrl });
  });

  // Fetch detail pages in batches to get sector and external website URL
  const BATCH_SIZE = 50;
  const companies: ScrapedCompany[] = [];

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (entry) => {
        try {
          const r = await fetch(entry.detailUrl, {
            headers: { "User-Agent": UA },
          });
          const h = await r.text();
          const $d = cheerio.load(h);

          const url = $d("#company_url").attr("href") || "";

          return { name: entry.name, category: "", url };
        } catch {
          return { name: entry.name, category: "", url: "" };
        }
      }),
    );
    companies.push(...results);
  }

  return companies;
}
