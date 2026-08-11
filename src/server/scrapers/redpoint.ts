import type { ScrapedCompany } from './types';

const DATA_URL =
  "https://www.redpoint.com/page-data/companies/page-data.json";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch the Gatsby page-data JSON which contains all companies
  const resp = await fetch(DATA_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
  }

  const pageData = await resp.json();
  const edges = pageData.result.data.companies.edges;

  const companies: ScrapedCompany[] = edges.map(
    (e: {
      node: {
        title: string;
        link?: string;
        sectors?: { title: string }[];
      };
    }) => ({
      name: e.node.title,
      category: (e.node.sectors || []).map((s) => s.title).join(", "),
      url: e.node.link || "",
    }),
  );

  return companies;
}
