import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.boxgroup.com/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// the portfolio tabs load these per-category pages in hidden iframes; each
// page lists that category's companies (identified by their external link)
const CATEGORIES: [string, string][] = [
  ["consumer", "Consumer"],
  ["enterprise", "Enterprise"],
  ["infra-devtools", "Infra / Devtools"],
  ["fintech", "FinTech"],
  ["healthcare", "Healthcare"],
  ["marketplaces", "Marketplaces"],
  ["climate", "Climate"],
  ["frontier", "Frontier"],
  ["web3", "Web3"],
  ["exits", "Exited"],
];

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
  // logo filenames are often all-lowercase single words ("clay" -> "Clay")
  if (/^[a-z0-9]+$/.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  interface Entry {
    name: string;
    url: string;
    labels: string[];
  }
  const byUrl = new Map<string, Entry>();
  let page = 1;

  while (true) {
    const url = page === 1 ? BASE_URL : `${BASE_URL}?31f24c7f_page=${page}`;
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
      if (!companyUrl || byUrl.has(companyUrl)) return;

      const bgStyle = link.find(".port_tabs-item_link-inner").attr("style") || "";
      const imgMatch = bgStyle.match(/url\(&quot;([^&]+)&|url\("([^"]+)"\)/);
      const imgUrl = imgMatch?.[1] || imgMatch?.[2] || "";
      const name = extractName(imgUrl, companyUrl);

      const labels: string[] = [];
      const ipo = $(el).find(".port_tabs-ipo");
      if (ipo.length > 0 && !(ipo.attr("class") || "").includes("w-condition-invisible")) {
        labels.push("IPO");
      }

      byUrl.set(companyUrl, { name, url: companyUrl, labels });
      newCount++;
    });

    if (newCount === 0) break;

    // Check if there's a next page
    const nextLink = $("a.w-pagination-next");
    if (nextLink.length === 0) break;

    page++;
  }

  for (const [slug, label] of CATEGORIES) {
    const resp = await fetch(`https://www.boxgroup.com/category/${slug}`, {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) continue;
    const html = await resp.text();
    for (const m of html.matchAll(/<a href="([^"]+)" target="_blank" class="port_tabs-item_link/g)) {
      const entry = byUrl.get(m[1]);
      if (entry && !entry.labels.includes(label)) entry.labels.push(label);
    }
  }

  return [...byUrl.values()].map((e) => ({
    name: e.name,
    category: e.labels.join(", "),
    url: e.url,
  }));
}
