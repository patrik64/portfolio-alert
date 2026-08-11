import type { ScrapedCompany } from './types';

const GQL_URL = "https://eclipsevcprod.wpengine.com/graphql";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Fetch all companies via WPGraphQL API
const query = `{
  companies(first: 100) {
    nodes {
      title
      companies { websiteUrl }
      companyCategories { nodes { name } }
    }
  }
}`;

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${GQL_URL}: ${resp.status}`);
  }

  const json = await resp.json();
  const nodes = json.data.companies.nodes;

  const companies: ScrapedCompany[] = nodes.map(
    (n: {
      title: string;
      companies?: { websiteUrl?: string };
      companyCategories?: { nodes: { name: string }[] };
    }) => ({
      name: n.title,
      category: (n.companyCategories?.nodes || []).map((c) => c.name).join(", "),
      url: n.companies?.websiteUrl || "",
    }),
  );

  return companies;
}
