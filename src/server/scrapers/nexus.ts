import type { ScrapedCompany } from './types';

const PAGE_URL = "https://nexusvp.com/companies/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch the companies page which has all data in a JS variable: portfolioCompanies
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // Extract each company entry from the JS object
  // Pattern: slug: { name:"...", website:"...", ... tags:['Tag1', 'Tag2'] }
  const companies: ScrapedCompany[] = [];
  const re =
    /\w+:\s*\{\s*name:"([^"]*)",\s*website:"([^"]*)",[\s\S]*?tags:\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[1];
    if (!name) continue;
    const url = m[2];
    const tags = [...m[3].matchAll(/'([^']*)'/g)]
      .map((t) => t[1])
      .filter(Boolean);
    companies.push({ name, category: tags.join(", "), url });
  }

  return companies;
}
