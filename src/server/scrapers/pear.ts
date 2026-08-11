import type { ScrapedCompany } from './types';

const BASE_API = "https://pear.vc/wp-json/wp/v2";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch sector taxonomy terms to build an id->name map
  const sectorMap = new Map<number, string>();
  const taxResp = await fetch(`${BASE_API}/pear_vc_company_sector?per_page=100`, {
    headers: { "User-Agent": UA },
  });
  if (taxResp.ok) {
    for (const t of await taxResp.json()) {
      sectorMap.set(t.id, t.name);
    }
  }

  // Fetch all companies via WP REST API (paginated, 100 per page)
  const companies: ScrapedCompany[] = [];
  let page = 1;

  while (true) {
    const resp = await fetch(
      `${BASE_API}/pear_vc_company?per_page=100&page=${page}&_fields=id,title,link,pear_vc_company_sector`,
      { headers: { "User-Agent": UA } },
    );
    if (resp.status === 400) break;

    const data = await resp.json();
    if (data.length === 0) break;

    for (const item of data) {
      const name = item.title.rendered;
      const url = item.link || "";
      const category = (item.pear_vc_company_sector || [])
        .map((id: number) => sectorMap.get(id))
        .filter(Boolean)
        .join(", ");

      companies.push({ name, category, url });
    }

    page++;
  }

  return companies;
}
