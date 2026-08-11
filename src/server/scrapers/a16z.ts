import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

export async function scrape(): Promise<ScrapedCompany[]> {
  const URL = "https://a16z.com/portfolio/";

  const response = await fetch(URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const html = await response.text();
  const $ = cheerio.load(html);

  // Portfolio data is embedded as a JSON array in the data-companies attribute
  const jsonStr = $("[data-companies]").attr("data-companies");
  if (!jsonStr) {
    throw new Error('a16z: data-companies attribute not found');
  }

  const companiesData: Record<string, string>[] = JSON.parse(jsonStr);

  // Extract from the main companies list
  const companies: ScrapedCompany[] = companiesData.map(
    (c: Record<string, string>) => ({
      name: c.post_title,
      category: c.website_supercategory || "",
      url: c.company_url || "",
    }),
  );

  return companies;
}
