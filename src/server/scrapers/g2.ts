import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.g2vp.com/portfolio";
// g2 used to turn away anything that called itself a browser without being
// one, so this scraper says plainly what it is
const UA = "portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)";

// webflow since september 2026: the portfolio is a collection list, one item
// per company, each linking the company's own site and naming the industry
// g2 files it under. the logo marquee above it is the partners' prior
// investments at kleiner perkins — another firm's deals, published as
// pictures without links — so it is left where it is.

const ITEM = /(?=<div[^>]*role="listitem"[^>]*class="[^"]*portfolio-item)/;
const NAME = /class="[^"]*portfolio-name[^"]*"[^>]*>([\s\S]*?)<\//;
const INDUSTRY = /class="[^"]*portfolio-industry[^"]*"[^>]*>([\s\S]*?)<\//;
const SITE = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="[^"]*portfolio-link/;

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8203;|&#x200b;|​/gi, "")
    .replace(/&nbsp;| /g, " ")
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
  for (const item of html.split(ITEM).slice(1)) {
    const name = text(item.match(NAME)?.[1] ?? "");
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    companies.push({
      name,
      category: text(item.match(INDUSTRY)?.[1] ?? ""),
      url: item.match(SITE)?.[1] ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("g2: no companies in the portfolio list");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("g2: the portfolio items' website links moved");
  }

  return companies;
}
