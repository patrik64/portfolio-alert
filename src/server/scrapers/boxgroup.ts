import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.boxgroup.com/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extractName(imgUrl: string, companyUrl: string): string {
  const filename = decodeURIComponent(imgUrl.split("/").pop() || "");
  // Remove the Webflow hash prefix (hex_) and file extension
  const withoutExt = filename.replace(/\.\w+$/, "");
  const withoutHash = withoutExt.replace(/^[a-f0-9]+_/, "");
  // Remove trailing "Logo" suffix and clean up
  let cleaned = withoutHash
    .replace(/\s*[Ll]ogo[s]?\s*$/i, "")
    .replace(/\s*Lgoo\s*$/i, "")
    .replace(/_/g, " ")
    .trim();
  // Fallback: if name is generic/empty/hex hash, derive from URL hostname
  if (!cleaned || /Website template|^Slide\d*$|^[a-f0-9]{10,}/i.test(cleaned)) {
    try {
      const host = new URL(companyUrl).hostname
        .replace(/^www\./, "")
        .replace(/\.\w+$/, "");
      cleaned = host;
    } catch {
      cleaned = withoutHash;
    }
  }
  return cleaned;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (true) {
    const url =
      page === 1 ? BASE_URL : `${BASE_URL}?31f24c7f_page=${page}`;
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) break;

    const html = await resp.text();
    const $ = cheerio.load(html);

    // Select items from the infinite-scroll grid (non-featured)
    const items = $(".port_tabs-grid.infinite .port_tabs-item.w-dyn-item");
    if (items.length === 0) break;

    let newCount = 0;
    items.each((_, el) => {
      const link = $(el).find("a.port_tabs-item_link");
      const companyUrl = link.attr("href") || "";
      if (!companyUrl || seen.has(companyUrl)) return;
      seen.add(companyUrl);

      const bgStyle = link.find(".port_tabs-item_link-inner").attr("style") || "";
      const imgMatch = bgStyle.match(/url\(&quot;([^&]+)&|url\("([^"]+)"\)/);
      const imgUrl = imgMatch?.[1] || imgMatch?.[2] || "";
      const name = extractName(imgUrl, companyUrl);

      const category = "";
      companies.push({ name, category, url: companyUrl });
      newCount++;
    });

    if (newCount === 0) break;

    // Check if there's a next page
    const nextLink = $("a.w-pagination-next");
    if (nextLink.length === 0) break;

    page++;
  }

  return companies;
}
