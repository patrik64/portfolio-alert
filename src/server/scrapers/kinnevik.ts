import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.kinnevik.com";
const PAGE_URL = `${BASE_URL}/investments/`;
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

  // the whole portfolio is one table: name, description, sector, the year
  // kinnevik invested, and where the company is based
  for (const row of html.matchAll(/<tr class="item">([\s\S]*?)<\/tr>/g)) {
    const cell = (name: string) =>
      text(row[1].match(new RegExp(`<div class="${name}">([\\s\\S]*?)</div>`))?.[1] ?? "");

    const name = cell("__name");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const sectors = [
      ...(row[1].match(/<div class="_sector">([\s\S]*?)<\/div>/)?.[1] ?? "").matchAll(
        /<span>([\s\S]*?)<\/span>/g,
      ),
    ].map((m) => text(m[1]));
    // kinnevik names no company websites; a company big enough to have written
    // about gets a page here instead
    const slug = row[1].match(/href="\/companies\/([^"]+)\/"/)?.[1] ?? "";

    companies.push({
      name,
      category: [...sectors, cell("_location"), cell("_invested")].filter(Boolean).join(", "),
      url: slug ? `${BASE_URL}/companies/${slug}/` : "",
    });
  }

  if (companies.length === 0) {
    throw new Error("kinnevik: no companies found in the investments table");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("kinnevik: the investments table's columns moved");
  }

  // the companies shown above the table are drawn from it, so between them
  // they say whether the table was served short
  const names = new Set(companies.map((company) => company.name));
  for (const card of html.matchAll(/<a class="item" href="\/companies\/[^"]*">\s*<h2>([\s\S]*?)<\/h2>/g)) {
    const featured = text(card[1]);
    if (featured && !names.has(featured)) {
      throw new Error(`kinnevik: ${featured} is featured but missing from the investments table`);
    }
  }

  return companies;
}
