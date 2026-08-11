import type { ScrapedCompany } from './types';

const BASE_API = "https://sapphireventures.com/wp-json/wp/v2";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch company_cat taxonomy to build id->name map (only leaf categories)
  const categoryMap = new Map<number, string>();
  const catResp = await fetch(`${BASE_API}/company_cat?per_page=100`, {
    headers: { "User-Agent": UA },
  });
  if (catResp.ok) {
    const cats = await catResp.json();
    // Top-level parent IDs to skip (Category=1147, Domain=1246, Stage=1152, Region=1145)
    const parentIds = new Set(cats.filter((c: { parent: number }) => c.parent === 0).map((c: { id: number }) => c.id));
    for (const c of cats) {
      if (parentIds.has(c.id)) continue;
      const name = c.name.replace(/&amp;/g, "&").replace(/&#039;/g, "'");
      categoryMap.set(c.id, name);
    }
  }

  // Fetch all companies via WP REST API (paginated, 100 per page)
  const companies: ScrapedCompany[] = [];
  let page = 1;

  while (true) {
    const resp = await fetch(
      `${BASE_API}/company?per_page=100&page=${page}&_fields=id,title,link,company_cat`,
      { headers: { "User-Agent": UA } },
    );
    if (resp.status === 400) break;

    const data = await resp.json();
    if (data.length === 0) break;

    for (const item of data) {
      const name = item.title.rendered;
      const url = item.link || "";
      const category = (item.company_cat || [])
        .map((id: number) => categoryMap.get(id))
        .filter(Boolean)
        .join(", ");

      companies.push({ name, category, url });
    }

    page++;
  }

  return companies;
}
