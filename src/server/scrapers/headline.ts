import type { ScrapedCompany } from './types';

const BASE_URL = "https://headline.com";
// the site moved from Next.js to Gatsby, which publishes each page's query
// result as a standalone json file
const DATA_URL = `${BASE_URL}/page-data/portfolio/page-data.json`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface CompanyNode {
  title?: string;
  hidden?: boolean | null;
  slug?: { current?: string } | null;
  location?: string | null;
  sectors?: ({ sector?: { title?: string } | null } | null)[] | null;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(DATA_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
  }
  const data: {
    result?: { data?: { companies?: { nodes?: CompanyNode[] } } };
  } = await resp.json();

  const nodes = data.result?.data?.companies?.nodes ?? [];
  if (nodes.length === 0) {
    throw new Error("headline: no companies in the page data");
  }

  const companies: ScrapedCompany[] = [];
  for (const node of nodes) {
    const name = (node.title ?? "").replace(/\s+/g, " ").trim();
    if (!name || node.hidden) continue;

    const sectors = (node.sectors ?? [])
      .map((s) => s?.sector?.title?.trim() ?? "")
      .filter(Boolean);
    const slug = node.slug?.current;

    companies.push({
      name,
      category: [...sectors, node.location?.trim() ?? ""].filter(Boolean).join(", "),
      // the payload carries no external links; a third of the nodes have no
      // detail page either, and those rows render without a link
      url: slug ? `${BASE_URL}/portfolio/${slug}` : "",
    });
  }

  return companies;
}
