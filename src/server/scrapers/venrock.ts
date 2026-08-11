import type { ScrapedCompany } from './types';

const BASE_API = "https://www.venrock.com/wp-json/wp/v2";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch all companies via WP REST API (paginated, 100 per page)
  const companies: ScrapedCompany[] = [];
  let page = 1;

  while (true) {
    const resp = await fetch(
      `${BASE_API}/investment?per_page=100&page=${page}&acf_format=standard&_fields=id,title,acf`,
      { headers: { "User-Agent": UA } },
    );
    if (resp.status === 400) break;

    const data = await resp.json();
    if (data.length === 0) break;

    for (const item of data) {
      const name = item.title.rendered;
      const url = item.acf?.website || "";
      const category = item.acf?.sector || "";

      companies.push({ name, category, url });
    }

    page++;
  }

  return companies;
}
