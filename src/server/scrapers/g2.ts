import type { ScrapedCompany } from './types';

const BASE_URL = "https://g2vp.com";
const PAGE_URL = `${BASE_URL}/portfolio/`;
const SITEMAP_URL = `${BASE_URL}/portfolio-sitemap.xml`;
// g2 turns away anything that calls itself a browser without being one, so this
// is the one scraper here that says plainly what it is
const UA = "portfolio-alert/1.0 (+https://portfolio-alert.vercel.app)";

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8203;|&#x200b;|\u200b/gi, "")
    .replace(/&nbsp;| /g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  // every company g2 works with is a slide carrying its logo, what g2 says it
  // does, and a link out. the logos under "prior investments at kleiner
  // perkins" are another firm's deals and are published without names at all,
  // so they are left where they are
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const item of html.matchAll(
    /<div[^>]*class="carousel-item[^"]*"[^>]*data-post-id="\d+">([\s\S]*?)<\/div>\s*<\/div>/g,
  )) {
    const name = text(item[1].match(/<img[^>]*\salt="([^"]*)"/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    companies.push({
      name,
      // g2 files its companies under nothing but the sentence describing them
      category: "",
      url: item[1].match(/<a href="(https?:\/\/[^"]+)"[^>]*>\s*View Website/)?.[1] ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("g2: no companies found in the portfolio carousel");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("g2: the portfolio slides' website links moved");
  }

  // one page per company, and the sitemap counts them — the pages themselves
  // are broken, so only their number can be believed
  const sitemap = await fetchPage(SITEMAP_URL);
  const published = new Set(
    [...sitemap.matchAll(/<loc>https:\/\/g2vp\.com\/portfolio\/([^<>/]+)\/?<\/loc>/g)].map((m) => m[1]),
  );
  if (published.size > companies.length) {
    throw new Error(
      `g2: the carousel showed ${companies.length} of the ${published.size} companies in the sitemap`,
    );
  }

  return companies;
}
