import type { ScrapedCompany } from './types';

const BASE_API = "https://public.dxp.playbook.vc/.rest/delivery/startups/v1";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch all startups via Magnolia CMS delivery API (paginated, 100 per page)
  const companies: ScrapedCompany[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const resp = await fetch(`${BASE_API}?limit=${limit}&offset=${offset}`, {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) {
      throw new Error(`Failed to fetch: ${resp.status}`);
    }

    const data = await resp.json();
    for (const item of data.results) {
      const name = item.startupTitle || "";
      if (!name) continue;
      const url = item.startupWebsite || "";
      const category = item.startupMainIndustry?.industryTitle || "";

      companies.push({ name, category, url });
    }

    offset += limit;
    if (offset >= data.total) break;
  }

  return companies;
}
