import type { ScrapedCompany } from './types';

const CONFIG_URL = "https://www.techstars.com/api/search/config/companies";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PER_PAGE = 250; // typesense maximum

interface CompanyDoc {
  company_name: string;
  industry_vertical?: string[];
  website?: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  // The portfolio search runs on Typesense; the site exposes its search-only
  // credentials via this config endpoint, so fetch them fresh every run.
  const configResp = await fetch(CONFIG_URL, { headers: { "User-Agent": UA } });
  if (!configResp.ok) {
    throw new Error(`Failed to fetch ${CONFIG_URL}: ${configResp.status}`);
  }
  const config: { url: string; collection: string; apiKey: string } =
    await configResp.json();

  const companies: ScrapedCompany[] = [];
  let page = 1;

  while (true) {
    const resp = await fetch(
      `${config.url}/collections/${config.collection}/documents/search?q=*&per_page=${PER_PAGE}&page=${page}`,
      { headers: { "User-Agent": UA, "X-TYPESENSE-API-KEY": config.apiKey } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to fetch techstars companies page ${page}: ${resp.status}`);
    }

    const data: { found: number; hits: { document: CompanyDoc }[] } =
      await resp.json();

    for (const hit of data.hits) {
      const doc = hit.document;
      const website = doc.website?.trim() || "";
      companies.push({
        name: doc.company_name,
        category: (doc.industry_vertical ?? []).join(", "),
        // websites are stored as bare domains (e.g. "nlevel.de")
        url: website ? (website.startsWith("http") ? website : `https://${website}`) : "",
      });
    }

    if (data.hits.length < PER_PAGE || companies.length >= data.found) break;
    page++;
  }

  return companies;
}
