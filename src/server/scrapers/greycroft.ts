import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const URL = "https://www.greycroft.com/portfolio/";
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

  $(".portfolio-card").each((_, el) => {
    const name = $(el).find(".portfolio-card__title").text().trim();
    if (!name) return;

    const description = $(el)
      .find('.portfolio-card__accordion div[style="grid-area: description;"] p')
      .text()
      .trim();

    const url = $(el).find(".portfolio-card__top-link a").attr("href") || "";

    companies.push({ name, category: description, url });
  });

  return companies;
}
