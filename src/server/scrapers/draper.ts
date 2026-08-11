import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.draper.vc/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch all pages of the Webflow portfolio (paginated via ?4e961c0f_page=N)
  const companies: ScrapedCompany[] = [];

  for (let page = 1; ; page++) {
    const url = page === 1 ? PAGE_URL : `${PAGE_URL}?4e961c0f_page=${page}`;
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) break;
    const html = await resp.text();

    const items = html
      .split(/class="universe-table-cl_item w-dyn-item"/)
      .slice(1);
    if (items.length === 0) break;

    for (const item of items) {
      // Only parse the table row, not the modal that follows
      const rowEnd = item.indexOf("universe-modal_wrapper");
      const row = rowEnd > -1 ? item.substring(0, rowEnd) : item;

      const nameMatch = row.match(/fs-list-field="company">([^<]+)</);
      const name = nameMatch?.[1]?.trim();
      if (!name) continue;

      const urlMatch = row.match(
        /fs-cmssort-field="IDENTIFIER"[^>]*>(https?:\/\/[^<\s]+)<\/div>/,
      );
      const companyUrl = urlMatch?.[1]?.trim() || "";

      const catMatches = [
        ...row.matchAll(/fs-list-field="category"[^>]*>([^<]+)</g),
      ];
      const category = catMatches
        .map((m) => m[1].replace(/&amp;/g, "&"))
        .join(", ");

      companies.push({ name, category, url: companyUrl });
    }

    // Check if there's a next page
    if (!html.includes(`4e961c0f_page=${page + 1}`)) break;
  }

  return companies;
}
