import type { ScrapedCompany } from './types';

const BASE_API = "https://indiebio.co/wp-json/wp/v2";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch category taxonomy terms to build an id->name map
  const categoryMap = new Map<number, string>();
  const catResp = await fetch(`${BASE_API}/tx_category?per_page=100`, {
    headers: { "User-Agent": UA },
  });
  if (catResp.ok) {
    const cats = await catResp.json();
    for (const c of cats) {
      // Decode HTML entities (e.g. &amp; -> &)
      const name = c.name
        .replace(/&amp;/g, "&")
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"');
      categoryMap.set(c.id, name);
    }
  }

  // Fetch all companies via WP REST API (paginated, 100 per page)
  const companies: ScrapedCompany[] = [];
  let page = 1;

  while (true) {
    const resp = await fetch(
      `${BASE_API}/company?per_page=100&page=${page}&_fields=id,title,acf,tx_category`,
      { headers: { "User-Agent": UA } },
    );
    if (resp.status === 400) break;

    const data = await resp.json();
    if (data.length === 0) break;

    for (const item of data) {
      const name = item.title.rendered;
      const url = item.acf?.website || "";
      const category = (item.tx_category || [])
        .map((id: number) => categoryMap.get(id))
        .filter(Boolean)
        .join(", ");

      companies.push({ name, category, url });
    }

    page++;
  }

  return companies;
}
