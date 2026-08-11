import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.antler.co/portfolio";
const PAGE_PARAM = "0b933bfd_page";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function scrape(): Promise<ScrapedCompany[]> {
  const companies: ScrapedCompany[] = [];
  let page = 1;

  while (true) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}?${PAGE_PARAM}=${page}`;
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) {
      console.error(`Failed to fetch page ${page}: ${resp.status}`);
      break;
    }
    const html = await resp.text();

    // Each company is inside a portco_card div with:
    //   - name: <p fs-cmsfilter-field="name">...</p>
    //   - sector tag: <div fs-cmsfilter-field="sector">...<div fs-cmsfilter-field="location">SECTOR</div></div>
    //   - link: <a ... href="URL" class="clickable_link ...">
    const cardPattern =
      /class="portco_card">([\s\S]*?)class="clickable_link[^"]*"[^>]*>/g;
    let match;
    let count = 0;

    while ((match = cardPattern.exec(html)) !== null) {
      const card = match[0] + match[1];

      const nameMatch = card.match(/fs-cmsfilter-field="name"[^>]*>([^<]+)/);
      const name = nameMatch?.[1]?.trim() || "";

      // Sector is inside: <div fs-cmsfilter-field="sector" class="tag_small_wrap"><div fs-cmsfilter-field="location" class="tag_small_text">SECTOR</div>
      const sectorMatch = card.match(
        /fs-cmsfilter-field="sector"[^>]*>[\s\S]*?class="tag_small_text">([^<]+)/,
      );
      const category = sectorMatch?.[1]?.trim() || "";

      const urlMatch = match[0].match(/href="([^"]+)"[^>]*class="clickable_link/);
      const companyUrl = urlMatch?.[1] || "";

      if (name) {
        companies.push({ name, category, url: companyUrl });
        count++;
      }
    }

    if (count === 0) break;
    page++;
  }

  return companies;
}
