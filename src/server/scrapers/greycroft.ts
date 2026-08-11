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

    // strategy is the sector ("Software", "Consumer Brands", ...); the status
    // ("Acquired", "IPO") is appended when the company is no longer active
    const strategy = $(el).find(".portfolio-card__strategy").first().text().trim();
    const status = $(el).find(".portfolio-card__status").first().text().trim();
    const category = [strategy, status !== "Active" ? status : ""]
      .filter(Boolean)
      .join(", ");

    const url = $(el).find(".portfolio-card__top-link a").attr("href") || "";

    companies.push({ name, category, url });
  });

  return companies;
}
