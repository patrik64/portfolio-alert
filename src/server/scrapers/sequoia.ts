import type { ScrapedCompany } from './types';

const BASE_URL = "https://sequoiacap.com";
const BATCH_SIZE = 16;
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

// sequoia rebuilt its site on framer; the wordpress api the old scraper read is
// gone, and the list page renders only a spotlight of companies, so the sitemap
// is what enumerates the portfolio — one page per company
async function detailOf(slug: string): Promise<ScrapedCompany> {
  const html = await fetchPage(`${BASE_URL}/companies/${slug}`);

  const name = text(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").replace(
    /\s*\|\s*Sequoia Capital$/,
    "",
  );
  if (!name) {
    throw new Error(`sequoia: ${slug} names no company — the page layout moved`);
  }

  // the sectors are the chips linking back to the filtered company list
  const sectors: string[] = [];
  for (const chip of html.matchAll(
    /href="\/our-companies\?categories=[a-z0-9-]+"[^>]*>([\s\S]*?)<\/a>/g,
  )) {
    const sector = text(chip[1]);
    if (sector && !sectors.includes(sector)) sectors.push(sector);
  }

  const partnered = html.match(/>Partnered (\d{4})</)?.[1] ?? "";
  // an ipo or acquisition is a milestone here, as sequoia states it — not a
  // claim that the fund is out
  const milestones = [...html.matchAll(/>((?:IPO|Acquired) \d{4})</g)].map((m) => m[1]);

  return {
    name,
    category: [...sectors, partnered, ...milestones].filter(Boolean).join(", "),
    url: html.match(/data-framer-name="14px"[^>]*href="(https?:\/\/[^"]+)"/)?.[1] ?? "",
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const sitemap = await fetchPage(`${BASE_URL}/sitemap.xml`);
  const slugs = [
    ...new Set(
      [...sitemap.matchAll(/<loc>https:\/\/(?:www\.)?sequoiacap\.com\/companies\/([^<\/]+?)\/?<\/loc>/g)].map(
        (m) => m[1],
      ),
    ),
  ];
  if (slugs.length === 0) {
    throw new Error("sequoia: no company pages in the sitemap");
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = await Promise.all(slugs.slice(i, i + BATCH_SIZE).map(detailOf));
    companies.push(...batch);
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("sequoia: the company pages' sectors and milestones moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("sequoia: the company pages' website links moved");
  }

  return companies;
}
