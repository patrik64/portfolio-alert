import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.zcg.com/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  // one tile per company, with its industries in a list kept hidden beside it
  // for the filters to read
  for (const raw of html.split('<div role="listitem" class="companies_item w-dyn-item">').slice(1)) {
    const item = raw.split('<div role="listitem" class="companies_item w-dyn-item">')[0];

    const name = text(item.match(/fs-cmsfilter-field="name"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const industries = [
      ...item.matchAll(/fs-cmsfilter-field="category"[^>]*>([\s\S]*?)<\/div>/g),
    ].map((m) => text(m[1]));

    companies.push({
      name,
      // zcg says nothing about a company beyond its industry — no year, no
      // location, and no mark on the ones it has already sold
      category: industries.filter(Boolean).join(", "),
      // the tile links straight out to the company; a few carry no link
      url: item.match(/<a id="[^"]*" href="(https?:\/\/[^"]+)"/)?.[1] ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("zcg: no companies found in the portfolio grid");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("zcg: portfolio industries not found — the tile markup moved");
  }

  // the page also lists the portfolio for search engines. that copy is kept by
  // hand and has drifted — it declares a count neither list matches — so it is
  // only good for noticing that the grid has collapsed
  const listed = (html.match(/"@type": "ListItem"/g) ?? []).length;
  if (listed > 0 && companies.length < listed * 0.75) {
    throw new Error(
      `zcg: the grid showed ${companies.length} companies against the ${listed} listed for search engines`,
    );
  }

  return companies;
}
