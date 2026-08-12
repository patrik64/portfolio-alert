import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.apex.ventures";
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 8;
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

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// framer mints its class names afresh on every publish, so everything here
// keys on the names given to the components in the designer
const named = (html: string, name: string) =>
  text(html.match(new RegExp(`data-framer-name="${name}"[^>]*>([\\s\\S]*?)</div>`))?.[1] ?? "");

async function detailOf(slug: string) {
  const html = await fetchPage(`${PAGE_URL}/${slug}`);
  // the website sits behind a "Visit Website" button at the foot of the page
  const button = html.lastIndexOf("<a ", html.indexOf("Visit Website"));
  return {
    industry: named(html, "Company Industry"),
    location: named(html, "Company Localization"),
    url: button < 0 ? "" : (html.slice(button).match(/href="(https?:\/\/[^"]+)"/)?.[1] ?? ""),
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  // the grid is rendered once per breakpoint, so each company shows up twice
  const cards = new Map<string, { name: string; exited: boolean }>();
  for (const card of html.matchAll(/<a [^>]*href="\.\/portfolio\/([^"]+)"[^>]*>/g)) {
    const slug = card[1];
    const start = card.index ?? 0;
    const item = html.slice(start, html.indexOf("</a>", start));
    const name = text(
      item.match(/data-framer-name="Company Name"[\s\S]*?<h6[^>]*>([\s\S]*?)<\/h6>/)?.[1] ?? "",
    );
    if (!name || cards.has(slug)) continue;
    // apex calls a company it has exited an alumnus, and badges its logo
    cards.set(slug, { name, exited: item.includes('data-framer-name="Company Alumni Tag"') });
  }
  if (cards.size === 0) {
    throw new Error("apex: no companies found in the portfolio grid");
  }

  // one page per company, and the sitemap lists them all — the two have to
  // agree or the grid was served short
  const sitemap = await fetchPage(`${BASE_URL}/sitemap.xml`);
  const published = new Set(
    [...sitemap.matchAll(/<loc>[^<]*\/portfolio\/([^<\/]+?)\/?<\/loc>/g)].map((m) => m[1]),
  );
  if (published.size > 0) {
    for (const slug of cards.keys()) {
      if (!published.has(slug)) throw new Error(`apex: ${slug} is in the grid but not the sitemap`);
    }
    for (const slug of published) {
      if (!cards.has(slug)) throw new Error(`apex: ${slug} is in the sitemap but not the grid`);
    }
  }

  const slugs = [...cards.keys()];
  const details = new Map<string, Awaited<ReturnType<typeof detailOf>>>();
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      slugs.slice(i, i + BATCH_SIZE).map(async (slug) => [slug, await detailOf(slug)] as const),
    );
    for (const [slug, detail] of batch) details.set(slug, detail);
  }

  const companies = slugs.map((slug) => {
    const card = cards.get(slug)!;
    const detail = details.get(slug) ?? { industry: "", location: "", url: "" };
    return {
      name: card.name,
      category: [detail.industry, detail.location, card.exited ? "Exited" : ""]
        .filter(Boolean)
        .join(", "),
      url: detail.url,
    };
  });

  // the industry is the only thing the company pages say about what they do
  if (!companies.some((company) => company.category)) {
    throw new Error("apex: company industries not found — the company pages moved");
  }

  return companies;
}
