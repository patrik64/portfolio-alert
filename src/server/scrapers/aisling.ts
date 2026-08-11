import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.aislingcapital.com/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();
  const $ = cheerio.load(html);

  const companies: ScrapedCompany[] = [];

  $(".company").each((_, el) => {
    const name = $(el).find("h3").text().trim();
    if (!name) return;

    // Extract sector from the x-show attribute (e.g. 'sector-biopharma')
    const xShow = $(el).attr("x-show") || "";
    const sectors = [...xShow.matchAll(/sector-([^']+)/g)].map((m) => m[1]);
    const category = sectors.join(", ");

    // Website link from the details list (note: site often has broken URLs here)
    let url = "";
    $(el)
      .find(".company-details-info ul li")
      .each((_, li) => {
        if ($(li).find("h4").text().trim() === "Website") {
          const href = $(li).find("a").attr("href") || "";
          if (href && href !== "#" && !href.match(/^\d{4}$/)) {
            url = href;
          }
        }
      });

    companies.push({ name, category, url });
  });

  return companies;
}
