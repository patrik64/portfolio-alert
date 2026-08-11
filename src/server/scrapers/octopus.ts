import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const BASE_URL = "https://octopusventures.com/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (true) {
    const url =
      page === 1 ? `${BASE_URL}/` : `${BASE_URL}/page/${page}/`;
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) break;

    const html = await resp.text();
    const $ = cheerio.load(html);

    const cards = $("article.company-card--medium");
    if (cards.length === 0) break;

    cards.each((_, el) => {
      const name = $(el).attr("aria-label") || $(el).find(".card-item-title span").text().trim();
      if (!name || seen.has(name)) return;
      seen.add(name);

      const link = $(el).find("a").first();
      const companyUrl = link.attr("href") || "";

      // Category from card-item class (e.g. "b2b-software", "deep-tech")
      const skipClasses = new Set(["card-item", "company-card--medium", "card-overlay", "true"]);
      const classes = ($(el).attr("class") || "").split(/\s+/);
      const category = classes
        .filter((c) => !skipClasses.has(c) && c.length > 0)
        .map((c) => c.replace(/-/g, " "))
        .join(", ");

      companies.push({ name, category, url: companyUrl });
    });

    page++;
  }

  return companies;
}
