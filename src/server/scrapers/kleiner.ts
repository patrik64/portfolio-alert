import type { ScrapedCompany } from './types';

const API_URL = "https://jobs.kleinerperkins.com/api-boards/search-companies";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch all companies via the job board API
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {},
      meta: { size: 500 },
      board: { id: "kleiner-perkins", isParent: true },
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
  }

  const data = await resp.json();
  const companies: ScrapedCompany[] = data.companies.map(
    (c: { name: string; website?: { url?: string }; markets?: string[] }) => ({
      name: c.name,
      category: (c.markets || []).join(", "),
      url: c.website?.url || "",
    }),
  );

  return companies;
}
