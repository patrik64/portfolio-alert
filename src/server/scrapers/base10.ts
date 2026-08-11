import type { ScrapedCompany } from './types';

const API_URL = "https://api.base10.vc";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch all companies via the Base10 GraphQL API
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "{ fetchCompanies { name website primary_industry_string } }",
    }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
  }

  const json = await resp.json();
  const raw = json.data.fetchCompanies;

  const companies: ScrapedCompany[] = raw.map(
    (c: { name: string; website?: string; primary_industry_string?: string }) => ({
      name: c.name,
      category: c.primary_industry_string || "",
      url: c.website || "",
    }),
  );

  return companies;
}
