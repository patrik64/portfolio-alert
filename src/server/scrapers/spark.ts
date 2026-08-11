import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.sparkcapital.com/companies";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Item {
  name: string;
  url: string;
}

// each collection item wraps a modal with the company name (h3) and website link
function parseItems(pane: string): Item[] {
  const items: Item[] = [];
  for (const chunk of pane.split('class="collection-item w-dyn-item"').slice(1)) {
    const name = chunk.match(/<h3 class="h3 margin-top---0">([^<]+)<\/h3>/)?.[1]?.trim();
    if (!name) continue;
    const url = chunk.match(/class="website-link"><a href="([^"]+)"/)?.[1] ?? "";
    items.push({ name, url: url === "#" ? "" : url });
  }
  return items;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // tab links map internal pane keys to display labels (e.g. Software -> Consumer)
  const labels = new Map<string, string>();
  for (const m of html.matchAll(/data-w-tab="([^"]+)"[^>]*>\s*<div class="tab-label">([^<]+)</g)) {
    labels.set(m[1], m[2].trim());
  }

  // tab panes carry the actual collection items; the "All" pane is the master
  // list, the sector panes assign categories (companies appear in several)
  const paneMarkers = [...html.matchAll(/data-w-tab="([^"]+)" class="w-tab-pane/g)];
  const byName = new Map<string, { url: string; sectors: string[] }>();
  for (let i = 0; i < paneMarkers.length; i++) {
    const key = paneMarkers[i][1];
    const start = paneMarkers[i].index!;
    const end = i + 1 < paneMarkers.length ? paneMarkers[i + 1].index! : html.length;
    const items = parseItems(html.slice(start, end));

    for (const item of items) {
      const entry = byName.get(item.name) ?? { url: item.url, sectors: [] };
      if (!entry.url && item.url) entry.url = item.url;
      if (key !== "All") {
        const label = labels.get(key) ?? key;
        if (!entry.sectors.includes(label)) entry.sectors.push(label);
      }
      byName.set(item.name, entry);
    }
  }

  const companies: ScrapedCompany[] = [...byName].map(([name, entry]) => ({
    name,
    category: entry.sectors.join(", "),
    url: entry.url,
  }));

  return companies;
}
