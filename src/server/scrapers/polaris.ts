import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const URL = "https://polarispartners.com/companies-list";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${URL}: ${resp.status}`);
  }
  const html = await resp.text();
  const $ = cheerio.load(html);

  const companies: ScrapedCompany[] = [];

  // Each fund section has a <section id="companies-list-grid"> with a <ul> of <li> items
  // Track which fund section we're in via the preceding <h2>
  let currentFund = "";

  $("h2, #companies-list-grid li").each((_, el) => {
    if (el.tagName === "h2") {
      currentFund = $(el).text().trim();
      return;
    }

    const name = $(el).text().trim();
    if (name) {
      companies.push({ name, category: currentFund, url: "" });
    }
  });

  return companies;
}
