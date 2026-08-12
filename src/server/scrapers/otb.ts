import type { ScrapedCompany } from './types';

const BASE_URL = "https://otb.vc";
const PAGE_URL = `${BASE_URL}/portfolio/`;
// the accordion renders the portfolio-item post type, which reports its own count
const COUNT_URL = `${BASE_URL}/wp-json/wp/v2/portfolio-item?per_page=1`;
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

  // the portfolio is one accordion: a logo and tagline collapsed, the company's
  // name, funding round and description inside
  for (const item of html.split('<li class="p-a__item reveal"').slice(1)) {
    const name = text(item.match(/<div class="p-a__heading[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // each fact is a blue label above its value; the stage is the only one that
    // describes the company rather than the deal or the people behind it
    const meta = new Map<string, string>();
    for (const pair of item.matchAll(
      /<div class="pb-5 clr-blue">([\s\S]*?)<\/div>\s*<div class="">([\s\S]*?)<\/div>/g,
    )) {
      meta.set(text(pair[1]).replace(/:$/, ""), text(pair[2]));
    }

    // realised investments wear a ribbon down the side of their logo, one
    // letter per line
    const label = text(item.match(/<div class="p-a__label">([\s\S]*?)<\/div>/)?.[1] ?? "").replace(
      /\s+/g,
      "",
    );

    companies.push({
      name,
      category: [meta.get("Current stage") ?? "", /^exit$/i.test(label) ? "Exited" : ""]
        .filter(Boolean)
        .join(", "),
      url: item.match(/<a href="(https?:\/\/[^"]+)" class="p-a__link/)?.[1] ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("otb: no companies found in the portfolio accordion");
  }

  // the page renders every company at once, so a short list means the markup
  // moved rather than the portfolio shrinking
  const countResp = await fetch(COUNT_URL, { headers: { "User-Agent": UA } });
  if (countResp.ok) {
    const total = Number(countResp.headers.get("x-wp-total") ?? 0);
    if (total > 0 && companies.length < total * 0.95) {
      throw new Error(
        `OTB Ventures portfolio incomplete: page listed ${companies.length} of ${total} companies`,
      );
    }
  }

  return companies;
}
