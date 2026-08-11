import type { ScrapedCompany } from './types';

const BASE_URL = "https://fly.vc";
const PAGE_URL = `${BASE_URL}/portfolio`;
// the portfolio page renders a five-company carousel; its script loads the
// full list from here
const DATA_URL = `${BASE_URL}/portfolio.json`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Entry {
  title?: string;
  link?: string;
  categories?: string[] | null;
  locations?: string[] | null;
}

// "location/uk" -> "UK", "location/germany" -> "Germany"
function locationLabel(slug: string): string {
  const value = slug.replace(/^location\//, "").replace(/-/g, " ").trim();
  if (!value) return "";
  if (value.length <= 3) return value.toUpperCase();
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(DATA_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${DATA_URL}: ${resp.status}`);
  }
  const entries: Entry[] = await resp.json();
  if (entries.length === 0) {
    throw new Error("fly: portfolio.json returned no companies");
  }

  // the page's filter links carry the display label for every category slug
  const labels = new Map<string, string>();
  const pageResp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (pageResp.ok) {
    const html = await pageResp.text();
    for (const m of html.matchAll(
      /href="\/(category\/[a-z0-9-]+)"[^>]*>\s*([^<]{1,40}?)\s*</g,
    )) {
      if (!labels.has(m[1])) labels.set(m[1], m[2].trim());
    }
  }

  const companies: ScrapedCompany[] = entries
    .filter((e) => e.title)
    .map((e) => ({
      name: e.title!.trim(),
      category: [
        ...(e.categories ?? []).map(
          (c) => labels.get(c) ?? locationLabel(c.replace(/^category\//, "")),
        ),
        ...(e.locations ?? []).map(locationLabel),
      ]
        .filter(Boolean)
        .join(", "),
      url: e.link ?? "",
    }));

  return companies;
}
