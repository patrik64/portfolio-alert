import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.silversmith.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .trim();

// each company's detail page links its website under a "Website" heading
async function fetchWebsite(path: string, attempt = 1): Promise<string> {
  try {
    const resp = await fetch(`${BASE_URL}${path}`, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const html = await resp.text();
    return (
      html.match(/<h6>Website<\/h6>\s*<a[^>]*href="(https?:\/\/[^"]+)"/)?.[1] ?? ""
    );
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return fetchWebsite(path, attempt + 1);
    }
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
    // fully realized investments are listed without a profile page
    path: string;
    labels: string[];
  }
  const entries: Entry[] = [];
  const seen = new Set<string>();

  for (const item of html.split('class="portfolio-grid-item w-dyn-item"').slice(1)) {
    const name = item.match(/<p class="portfolio-item-title">([^<]+)<\/p>/)?.[1];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const path = item.match(/href="(\/portfolio\/[^"]+)"/)?.[1] ?? "";

    // sectors are tagged per item; the industry and status sit in its detail block
    const labels = [...item.matchAll(/data-sector="([^"]+)"/g)].map((m) => decode(m[1]));
    const industry = item.match(/<div class="portfolio-item-industry">([^<]*)<\/div>/)?.[1];
    if (industry && !labels.includes(decode(industry))) labels.push(decode(industry));
    // "Current" is the default state; the exit stages are the informative ones
    const status = item.match(/<div class="portfolio-item-status">([^<]*)<\/div>/)?.[1];
    if (status && decode(status) !== "Current") labels.push(decode(status));

    entries.push({ name: decode(name), path, labels: labels.filter(Boolean) });
  }

  const websiteByPath = new Map<string, string>();
  const linked = entries.filter((e) => e.path);
  for (let i = 0; i < linked.length; i += BATCH_SIZE) {
    const batch = linked.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (e) => ({ path: e.path, website: await fetchWebsite(e.path) })),
    );
    for (const r of results) {
      websiteByPath.set(r.path, r.website);
    }
    await sleep(BATCH_DELAY_MS);
  }

  const companies: ScrapedCompany[] = entries.map((e) => ({
    name: e.name,
    category: e.labels.join(", "),
    url: e.path ? websiteByPath.get(e.path) || `${BASE_URL}${e.path}` : "",
  }));

  return companies;
}
