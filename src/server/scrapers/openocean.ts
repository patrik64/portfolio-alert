import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.openocean.vc";
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8203;|&#x200b;|\u200b/gi, "")
    .replace(/&nbsp;|\u00a0/g, " ")
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

  const companies: ScrapedCompany[] = [];
  const slugs = new Set<string>();
  const seen = new Set<string>();

  // the whole portfolio is rendered at once; every card carries the panel that
  // opens when it's clicked, and that panel holds everything openocean says
  for (const raw of html.split('<div role="listitem" class="portfolio-cards v2 w-dyn-item">').slice(1)) {
    const item = raw.split('<div role="listitem" class="portfolio-cards v2 w-dyn-item">')[0];

    const name = text(item.match(/<h2 fs-cmssort-field="name"[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const slug = item.match(/href="\/portfolio\/([a-z0-9-]+)"/)?.[1];
    if (slug) slugs.add(slug);

    // the panel's facts come as a label above its value
    const facts = new Map<string, string>();
    for (const column of item.matchAll(
      /<div class="portfolio-card-column">\s*<div[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/g,
    )) {
      const label = text(column[1]);
      if (!facts.has(label)) facts.set(label, text(column[2]));
    }

    const themes = [...item.matchAll(/fs-cmsfilter-field="theme"[^>]*>([\s\S]*?)<\/div>/g)]
      .map((m) => text(m[1]))
      .filter(Boolean);
    // "Portfolio" is a company openocean still holds
    const status = facts.get("Status") ?? "";
    // webflow flags the link when the text under it is blank, but the address
    // it points at is still the company's
    const url =
      item.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="text-size-small text-style-link[^"]*"/)?.[1] ??
      "";

    companies.push({
      name,
      category: [
        ...themes,
        facts.get("Country") ?? "",
        facts.get("Investment stage") ?? "",
        facts.get("Investment year") ?? "",
        status === "Portfolio" ? "" : status,
        status && status !== "Portfolio" && !/^exited$/i.test(status) ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url,
    });
  }

  if (companies.length === 0) {
    throw new Error("openocean: no companies found in the portfolio list");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("openocean: the portfolio cards' facts moved");
  }

  // one page per company, and the sitemap lists them all
  const sitemap = await fetchPage(`${BASE_URL}/sitemap.xml`);
  const published = new Set(
    [...sitemap.matchAll(/<loc>[^<]*\/portfolio\/([^<\/]+?)\/?<\/loc>/g)].map((m) => m[1]),
  );
  if (published.size > 0) {
    for (const slug of slugs) {
      if (!published.has(slug)) {
        throw new Error(`openocean: ${slug} is listed but not in the sitemap`);
      }
    }
    for (const slug of published) {
      if (!slugs.has(slug)) {
        throw new Error(`openocean: ${slug} is in the sitemap but not listed`);
      }
    }
  }

  return companies;
}
