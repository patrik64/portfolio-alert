import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.mourocapital.com";
const PAGE_URL = `${BASE_URL}/our-portfolio/`;
const SITEMAP_URL = `${BASE_URL}/portfolio-sitemap.xml`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const decode = (s: string) =>
  s
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
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

  // the whole portfolio is one server-rendered grid; each tile carries the
  // company name, its website and — for realised investments — an Exit or IPO
  // badge, which is the only label the site publishes about a company
  for (const item of html.split('class="col-12 col-sm-6 col-md-3 col-lg-3 portfolio-grid__item').slice(1)) {
    const name = decode(item.match(/<h6 class="body">([^<]*)<\/h6>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    companies.push({
      name,
      category: decode(item.match(/<span class="(?:exit|ipo)_tag">([^<]*)<\/span>/)?.[1] ?? ""),
      url: item.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="portfolio-grid__link"/)?.[1] ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("mouro: no companies found in the portfolio grid");
  }

  // the grid is the only listing, so check it against the sitemap's own count of
  // company pages rather than trusting whatever the page happened to render
  const sitemapResp = await fetch(SITEMAP_URL, { headers: { "User-Agent": UA } });
  if (sitemapResp.ok) {
    const xml = await sitemapResp.text();
    const pages = [...xml.matchAll(/<loc>[^<]*\/portfolio\/([^<]+?)\/<\/loc>/g)].length;
    if (companies.length < pages * 0.9) {
      throw new Error(
        `Mouro Capital portfolio incomplete: grid listed ${companies.length} of ${pages} companies`,
      );
    }
  }

  return companies;
}
