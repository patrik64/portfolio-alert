import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.qedinvestors.com";
const PAGE_URL = `${BASE_URL}/companies`;
const BATCH_SIZE = 16;
const MAX_PAGES = 20;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, named) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return NAMED[String(named).toLowerCase()] ?? whole;
  });

const text = (s: string) =>
  decode(s.replace(/<[^>]+>/g, " "))
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchPage(url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(url, { headers: { "User-Agent": UA } });
      if (!resp.ok) {
        throw new Error(`Failed to fetch ${url}: ${resp.status}`);
      }
      return await resp.text();
    } catch (err) {
      lastError = err;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError;
}

// the company's website is published on its profile page, as the outbound
// link beside the logo
async function websiteOf(slug: string): Promise<string> {
  let html: string;
  try {
    html = await fetchPage(`${PAGE_URL}/${slug}`);
  } catch (err) {
    if (err instanceof Error && err.message.endsWith(": 404")) return "";
    throw err;
  }
  return html.match(/<a rel="noopener" href="(https?:\/\/[^"]+)" target="_blank"/)?.[1] ?? "";
}

interface Item {
  slug: string;
  name: string;
  category: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const items: Item[] = [];
  const seen = new Set<string>();
  let pageParam = "";

  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchPage(page === 1 ? PAGE_URL : `${PAGE_URL}?${pageParam}=${page}`);
    if (page === 1) {
      pageParam = html.match(/href="\?([a-z0-9_]+_page)=2"/)?.[1] ?? "";
    }

    let added = 0;
    // each grid item hides its facts in a data block: status, sector, the
    // funds that backed it, then city and country
    for (const m of html.matchAll(
      /<a href="\/companies\/([a-z0-9-]+)" class="link-block w-inline-block"><img[^>]*alt="([^"]*)"[\s\S]{0,100}?<div class="hide">([\s\S]{0,1200}?)<\/div><\/div>/g,
    )) {
      const [, slug, alt, hide] = m;
      const name = text(alt);
      if (!name || seen.has(slug)) continue;
      seen.add(slug);
      added++;

      const facts = [...hide.matchAll(/<div>([^<]+)<\/div>/g)].map((f) => text(f[1]));
      const [status, sector, ...rest] = facts;
      // the fund names ride between the sector and the company's seat
      const seat = rest.filter((fact) => !/^(funds?|growth)\b/i.test(fact));

      items.push({
        slug,
        name,
        category: [sector ?? "", ...seat, status === "Exited" ? "Exited" : ""]
          .filter(Boolean)
          .join(", "),
      });
    }

    if (page === 1 && added === 0) {
      throw new Error("qed: no companies found in the listing");
    }
    if (added === 0 || !pageParam) break;
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      items.slice(i, i + BATCH_SIZE).map(async (item) => ({
        name: item.name,
        category: item.category,
        url: await websiteOf(item.slug),
      })),
    );
    companies.push(...batch);
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("qed: the sector and status facts moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("qed: the companies' website links moved");
  }

  return companies;
}
