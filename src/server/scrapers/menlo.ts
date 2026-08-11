import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const BASE_URL = "https://menlovc.com";
const PORTFOLIO_URL = `${BASE_URL}/portfolio/`;
const LOGOS_API = `${BASE_URL}/wp-json/menlovc/v1/portfolio/logos`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Build category map from the logos API (only featured companies have categories)
  const categoryMap = new Map<string, string>();
  for (const cat of ["consumer", "enterprise", "healthcare"]) {
    const resp = await fetch(`${LOGOS_API}?st=${cat}&id=15326`, {
      headers: { "User-Agent": UA, Referer: PORTFOLIO_URL },
    });
    if (resp.ok) {
      const html = JSON.parse(await resp.text());
      const $cat = cheerio.load(html);
      $cat(".logo-card-component img[alt]").each((_, el) => {
        const alt = $cat(el).attr("alt");
        if (alt) categoryMap.set(alt, cat);
      });
    }
  }

  // Fetch main portfolio page
  const response = await fetch(PORTFOLIO_URL, {
    headers: { "User-Agent": UA },
  });

  const html = await response.text();
  const $ = cheerio.load(html);

  // Company data is in .js-company-block elements with data-title attributes
  const companies: ScrapedCompany[] = [];

  $(".js-company-block[data-title]").each((_, el) => {
    const $el = $(el);
    const name = $el.attr("data-title") || "";
    const category = categoryMap.get(name) || "";
    const url = $el.find("a.portfolio-details-link").first().attr("href") || "";

    if (name) {
      companies.push({ name, category, url });
    }
  });

  return companies;
}
