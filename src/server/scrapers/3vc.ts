import type { ScrapedCompany } from './types';

const BASE_URL = "https://three.vc";
const PAGE_URL = `${BASE_URL}/portfolio/`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface CompanyNode {
  name: string;
  content: string;
}

async function fetchJson(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.json();
}

// gatsby keeps the portfolio behind a static query whose id is minted at build
// time, so the page's own data file is asked which ids it uses
async function companyNodes(): Promise<CompanyNode[]> {
  const page = await fetchJson(`${BASE_URL}/page-data/portfolio/page-data.json`);
  const hashes: string[] = page?.staticQueryHashes ?? [];
  if (hashes.length === 0) {
    throw new Error("3vc: no static queries listed for the portfolio page");
  }

  for (const hash of hashes) {
    const query = await fetchJson(`${BASE_URL}/page-data/sq/d/${hash}.json`);
    const edges = query?.data?.companies?.edges;
    if (Array.isArray(edges) && edges.length > 0) {
      return edges.map((edge: { node: CompanyNode }) => edge.node);
    }
  }
  throw new Error("3vc: the portfolio's static queries hold no companies");
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const nodes = await companyNodes();

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const name = (node.name ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const content = JSON.parse(node.content ?? "{}");
    // 3VC's word for a company that has left the portfolio; it's the only
    // label the entries carry
    const category = (content.category ?? "").trim();
    // a few of the older entries give the domain without a scheme
    const url = (content.url?.url ?? "").trim();

    companies.push({
      name,
      category,
      url: url && !/^https?:\/\//i.test(url) ? `https://${url}` : url,
    });
  }

  if (companies.length === 0) {
    throw new Error("3vc: no companies found in the portfolio query");
  }

  // the grid is rendered ahead of time, so the page itself says how many
  // companies there should be
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const rendered = new Set((await resp.text()).match(/href="\/portfolio\/[^"/]+\//g) ?? []).size;
  if (rendered !== companies.length) {
    throw new Error(
      `3vc: the portfolio page shows ${rendered} companies but the query returned ${companies.length}`,
    );
  }

  return companies;
}
