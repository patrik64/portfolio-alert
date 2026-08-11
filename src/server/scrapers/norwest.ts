import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

export async function scrape(): Promise<ScrapedCompany[]> {
  const BASE_URL = "https://www.norwest.com/companies";
  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const companies: ScrapedCompany[] = [];
  let page = 1;

  while (page < 20) {
    const pageUrl = page === 1 ? BASE_URL : `${BASE_URL}/?sf_paged=${page}`;

    const response = await fetch(pageUrl, {
      headers: { "User-Agent": UA },
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    const items = $(".companyline");
    if (items.length === 0) break;

    items.each((_, el) => {
      const cols = $(el).find(".elementor-column");

      const name = cols.eq(0).find("h2").first().text().trim();

      // Category spans (e.g. "Growth Equity", "Venture", or both)
      const catH2 = cols.eq(2).find("h2").last();
      const spans = catH2.find("span");
      const category =
        spans.length > 0
          ? spans
              .map((_, s) => $(s).text().trim())
              .get()
              .join(", ")
          : "";

      const url = cols.eq(4).find("a").attr("href") || "";

      if (name) {
        companies.push({ name, category, url });
      }
    });

    const nextLink = $(`a[href*="sf_paged=${page + 1}"]`);
    if (nextLink.length === 0) break;
    page++;
  }

  return companies;
}
