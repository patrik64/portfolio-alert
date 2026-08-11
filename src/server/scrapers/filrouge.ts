import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.filrougecapital.com";
const PORTFOLIO_URL = `${BASE_URL}/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 20;

// company status banners rendered per item; hidden ones carry w-condition-invisible
const BANNERS: [RegExp, string][] = [
  [/class="exit_banner[^"]*"/, "Exit"],
  [/class="rip_banner[^"]*"/, "RIP"],
  [/class="unicorn_banner[^"]*"/, "Unicorn"],
];

// each company's detail page carries the sector and the company website
async function fetchDetail(path: string): Promise<{ sector: string; website: string }> {
  try {
    const resp = await fetch(`${BASE_URL}${path}`, { headers: { "User-Agent": UA } });
    if (!resp.ok) return { sector: "", website: "" };
    const html = await resp.text();
    const sector =
      html
        .match(/class="portfolio_detail_sector[^"]*">([^<]*)</)?.[1]
        ?.replace(/&amp;/g, "&")
        .trim() ?? "";
    const website =
      html.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="portfolio_detail_title_wrapper/)?.[1] ??
      "";
    return { sector, website };
  } catch {
    return { sector: "", website: "" };
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  interface Entry {
    name: string;
    path: string;
    statuses: string[];
  }
  const entries: Entry[] = [];
  const seen = new Set<string>();
  let url = PORTFOLIO_URL;

  while (true) {
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) {
      throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    }
    const html = await resp.text();

    // each company is an anchor to its detail page inside a collection item
    const items = html.split('class="collection-item-2 w-dyn-item"').slice(1);
    let added = 0;
    for (const item of items) {
      const match = item.match(/<a aria-label="([^"]*)" href="(\/portfolio\/[^"]+)"/);
      if (!match) continue;
      const [, name, path] = match;
      if (!name || seen.has(path)) continue;
      seen.add(path);

      const statuses = BANNERS.filter(([re]) => {
        const banner = item.match(re);
        return banner && !banner[0].includes("w-condition-invisible");
      }).map(([, label]) => label);

      entries.push({ name, path, statuses });
      added++;
    }

    // Webflow pagination: follow the "next" link until it disappears
    const next = html.match(/<a href="\?([^"]+)"[^>]*class="[^"]*w-pagination-next/);
    if (!next || added === 0) break;
    url = `${PORTFOLIO_URL}?${next[1].replace(/&amp;/g, "&")}`;
  }

  // fetch sector + website from the detail pages (in batches)
  const detailMap = new Map<string, { sector: string; website: string }>();
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (e) => ({ path: e.path, detail: await fetchDetail(e.path) })),
    );
    for (const r of results) {
      detailMap.set(r.path, r.detail);
    }
  }

  const companies: ScrapedCompany[] = entries.map((e) => {
    const detail = detailMap.get(e.path) ?? { sector: "", website: "" };
    return {
      name: e.name,
      category: [detail.sector, ...e.statuses].filter(Boolean).join(", "),
      url: detail.website || `${BASE_URL}${e.path}`,
    };
  });

  return companies;
}
