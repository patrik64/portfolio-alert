import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.pillar.vc";
const PAGE_URL = `${BASE_URL}/companies/`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 20;

// each company's detail page links the company website as a "biglink"
async function fetchWebsite(path: string): Promise<string> {
  try {
    const resp = await fetch(path, { headers: { "User-Agent": UA } });
    if (!resp.ok) return "";
    const html = await resp.text();
    return html.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="biglink"/)?.[1] ?? "";
  } catch {
    return "";
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  interface Entry {
    name: string;
    path: string;
    sectors: string;
  }
  const entries: Entry[] = [];
  const seen = new Set<string>();

  for (const item of html.split('class="portfolio-item"').slice(1)) {
    const match = item.match(/<a href="([^"]+)" data-name="([^"]+)"/);
    if (!match) continue;
    const [, path, name] = match;
    if (seen.has(path)) continue;
    seen.add(path);

    // sector links inside the focus-area block
    const focus = item.match(/<div class="focus-area">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const sectors = [...focus.matchAll(/<a [^>]*>([^<]+)<\/a>/g)]
      .map((m) => m[1].replace(/&amp;/g, "&").trim())
      .join(", ");

    entries.push({ name: name.trim(), path, sectors });
  }

  // company websites live on the detail pages (fetched in batches)
  const websiteByPath = new Map<string, string>();
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (e) => ({ path: e.path, website: await fetchWebsite(e.path) })),
    );
    for (const r of results) {
      websiteByPath.set(r.path, r.website);
    }
  }

  const companies: ScrapedCompany[] = entries.map((e) => ({
    name: e.name,
    category: e.sectors,
    url: websiteByPath.get(e.path) || e.path,
  }));

  return companies;
}
