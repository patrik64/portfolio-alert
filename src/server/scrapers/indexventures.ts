import type { ScrapedCompany } from './types';

const URL = "https://www.indexventures.com/companies/backed/all/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch the portfolio page HTML
  const resp = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // Build sector slug -> display name map from the <select> filter options
  const sectorMap = new Map<string, string>();
  const optionPattern = /<option\s+value="([^"]+)"\s*>([^<]+)<\/option>/g;
  let optMatch;
  while ((optMatch = optionPattern.exec(html)) !== null) {
    sectorMap.set(optMatch[1].trim(), optMatch[2].trim());
  }

  // Parse company entries from <li> elements with class js-company
  const companies: ScrapedCompany[] = [];
  const companyPattern =
    /<li\s[^>]*js-company"[^>]*data-sectors='([^']*)'[^>]*>\s*<a\s+href="([^"]*)"[^>]*>\s*([\s\S]*?)\s*<\/a>/g;
  let match;

  while ((match = companyPattern.exec(html)) !== null) {
    const sectorsRaw = match[1].replace(/&quot;/g, '"');
    const companyUrl = `https://www.indexventures.com${match[2]}`;
    // Extract company name (text before any <span>)
    const nameHtml = match[3];
    const name = nameHtml.replace(/<span[\s\S]*?<\/span>/g, "").trim();

    // Parse sectors JSON
    let sectors: string[] = [];
    try {
      sectors = JSON.parse(sectorsRaw);
    } catch {
      // ignore
    }
    const category = sectors
      .map((s: string) => sectorMap.get(s) || s)
      .join(", ");

    companies.push({ name, category, url: companyUrl });
  }

  return companies;
}
