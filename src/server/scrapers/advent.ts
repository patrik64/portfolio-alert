import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.adventinternational.com/investments/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (true) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}?sf_paged=${page}`;
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) break;

    const html = await resp.text();
    const $ = cheerio.load(html);

    const cards = $("article.c-card-investment-directory");
    if (cards.length === 0) break;

    cards.each((_, el) => {
      const name = $(el).find("h3").first().text().trim();
      if (!name || seen.has(name)) return;
      seen.add(name);

      // Sector from class (e.g. sector_tax-healthcare)
      const classes = $(el).attr("class") || "";
      const sectorMatch = classes.match(/sector_tax-([a-z-]+)/);
      const category = sectorMatch
        ? sectorMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "";

      // Company website from "Visit company website" link
      let companyUrl = "";
      $(el).find(".c-card-investment-directory__links a").each((_, a) => {
        if ($(a).text().trim().toLowerCase().includes("visit company")) {
          companyUrl = $(a).attr("href") || "";
        }
      });

      companies.push({ name, category, url: companyUrl });
    });

    page++;
  }

  return companies;
}
