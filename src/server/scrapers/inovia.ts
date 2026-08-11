import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const URL = "https://www.inovia.vc/active-companies";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(URL, {
    headers: {
      "User-Agent": UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${URL}: ${resp.status}`);
  }
  const html = await resp.text();
  const $ = cheerio.load(html);

  const companies: ScrapedCompany[] = [];

  $("a.company-item").each((_, el) => {
    const href = $(el).attr("href") || "";
    // Extract name from URL slug (e.g. /active-companies/aikido/ -> Aikido)
    const slug = href.match(/\/active-companies\/([^/]+)/)?.[1] || "";
    const name = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    // Extract category tags
    const tags: string[] = [];
    $(el)
      .find(".thesis-tag .tag")
      .each((_, tag) => {
        const text = $(tag).text().trim();
        if (text) tags.push(text);
      });
    const category = tags.join(", ");

    if (name) {
      companies.push({ name, category, url: href });
    }
  });

  return companies;
}
