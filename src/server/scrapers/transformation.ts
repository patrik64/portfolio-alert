import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const URL = "https://transformcap.com/partner-companies";
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

  $(".portfolio-company-item.w-dyn-item").each((_, el) => {
    const name = $(el).find('h2[fs-cmsfilter-field="name"]').text().trim();
    if (!name) return;

    const slug = $(el).find("a.portfolio-company-link").attr("href") || "";
    const companyUrl = slug ? `https://transformcap.com${slug}` : "";

    const description = $(el)
      .find('[fs-cmsfilter-field="description"]')
      .text()
      .trim();

    companies.push({ name, category: description, url: companyUrl });
  });

  return companies;
}
