import type { ScrapedCompany } from './types';

const PAGE_URL = "https://seedcamp.com/our-companies/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // the sector filter buttons carry the display label for every class name
  const labels = new Map<string, string>();
  for (const m of html.matchAll(/data-toggle="\.([a-z0-9-]+)"[^>]*>\s*([^<]{2,40}?)\s*</g)) {
    if (!labels.has(m[1])) labels.set(m[1], decode(m[2]));
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  // each row is a company: its sectors are the extra class names, and the row
  // links straight to the company's website
  for (const raw of html.split('<div class="company__item mix ').slice(1)) {
    const item = raw.split('<div class="company__item mix ')[0];
    const sectors = item.split('"')[0].split(/\s+/).filter(Boolean);

    const name = decode(
      item.match(/company__item__name[^>]*>\s*([^<]+?)\s*</)?.[1] ?? "",
    );
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const year = (item.match(/company__item__year[^>]*>\s*([^<]*?)\s*</)?.[1] ?? "").trim();
    const url = item.match(/<a href="(https?:\/\/[^"]+)"/)?.[1] ?? "";

    companies.push({
      name,
      category: [...sectors.map((s) => labels.get(s) ?? s), year].filter(Boolean).join(", "),
      url,
    });
  }

  if (companies.length === 0) {
    throw new Error("seedcamp: no companies found in the portfolio list");
  }

  return companies;
}
