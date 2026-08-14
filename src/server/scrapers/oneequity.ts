import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.oneequity.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 12;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the site drops the occasional connection while the company pages are being
// read, and one dropped page would otherwise lose the whole portfolio
async function fetchPage(url: string, attempt = 1): Promise<string> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) {
      throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    }
    return await resp.text();
  } catch (err) {
    if (attempt >= 3) throw err;
    await sleep(1000 * attempt);
    return fetchPage(url, attempt + 1);
  }
}

async function detailOf(slug: string): Promise<ScrapedCompany> {
  const html = await fetchPage(`${PAGE_URL}/${slug}/`);

  // one equity writes each fact as a definition list, and a company can be
  // filed under more than one sector
  const facts = new Map<string, string[]>();
  for (const list of html.matchAll(/<dl[^>]*><dt[^>]*>([\s\S]*?)<\/dt>([\s\S]*?)<\/dl>/g)) {
    const label = text(list[1]);
    const values = [...list[2].matchAll(/<dd[^>]*>([\s\S]*?)<\/dd>/g)]
      .map((value) => text(value[1]))
      .filter(Boolean);
    if (label && !facts.has(label)) facts.set(label, values);
  }

  const name = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  if (!name) {
    throw new Error(`oneequity: ${slug} names no company — the page layout moved`);
  }

  // "Current" is a company one equity still holds
  const status = facts.get("Status")?.[0] ?? "";

  return {
    name,
    category: [
      ...(facts.get("Sector") ?? []),
      ...(facts.get("Location") ?? []),
      status === "Current" ? "" : status,
      status && status !== "Current" ? "Exited" : "",
    ]
      .filter(Boolean)
      .join(", "),
    // the link's text is a trimmed domain, so the address itself is the website
    url: html.match(/<dt[^>]*>Website<\/dt>[\s\S]{0,300}?href="(https?:\/\/[^"]+)"/)?.[1] ?? "",
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);
  const slugs = [...new Set([...html.matchAll(/href="\/portfolio\/([a-z0-9-]+)\/"/g)].map((m) => m[1]))];
  if (slugs.length === 0) {
    throw new Error("oneequity: no companies found in the portfolio grid");
  }

  // one page per company, and the sitemap lists them all
  const sitemap = await fetchPage(`${BASE_URL}/sitemap.xml`);
  const published = new Set(
    [...sitemap.matchAll(/<loc>https:\/\/www\.oneequity\.com\/portfolio\/([^<>/]+)\/?<\/loc>/g)].map(
      (m) => m[1],
    ),
  );
  if (published.size > 0) {
    for (const slug of slugs) {
      if (!published.has(slug)) {
        throw new Error(`oneequity: ${slug} is in the grid but not the sitemap`);
      }
    }
    for (const slug of published) {
      if (!slugs.includes(slug)) {
        throw new Error(`oneequity: ${slug} is in the sitemap but not the grid`);
      }
    }
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    companies.push(...(await Promise.all(slugs.slice(i, i + BATCH_SIZE).map(detailOf))));
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("oneequity: the company pages' facts moved");
  }

  return companies;
}
