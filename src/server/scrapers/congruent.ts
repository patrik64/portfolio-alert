import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.congruentvc.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 8;
// webflow renders at most this many items of a collection at once
const LIST_LIMIT = 100;
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

// the listing shows only names; the business-model tags and the company's
// website are published on its profile page
async function detailOf(detailPath: string): Promise<{ tags: string[]; url: string }> {
  const html = await fetchPage(`${BASE_URL}${detailPath}`);
  const tags: string[] = [];
  for (const m of html.matchAll(/href="\/business-model-tags\/[^"]+">([^<]+)</g)) {
    const tag = text(m[1]);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return {
    tags,
    url: html.match(/<a href="(https?:\/\/[^"]+)" class="contactinfowebsite"/)?.[1] ?? "",
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  interface Item {
    name: string;
    detailPath: string;
  }

  const items: Item[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(
    /<a href="(\/portfolio\/[^"]+)"[^>]*class="portfolio-link-block[^"]*"[\s\S]*?class="company-name">([^<]*)</g,
  )) {
    const name = text(m[2]);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    items.push({ name, detailPath: m[1] });
  }

  if (items.length === 0) {
    throw new Error("congruent: no companies found in the portfolio");
  }
  if (items.length >= LIST_LIMIT) {
    throw new Error(
      `congruent: the portfolio list is full at ${LIST_LIMIT} — a company is hidden behind it`,
    );
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      items.slice(i, i + BATCH_SIZE).map(async (item) => {
        const detail = await detailOf(item.detailPath);
        // the exit marker is one of the site's own tags; it reads best last
        const exited = detail.tags.some((tag) => tag.toLowerCase() === "exited");
        return {
          name: item.name,
          category: [
            ...detail.tags.filter((tag) => tag.toLowerCase() !== "exited"),
            exited ? "Exited" : "",
          ]
            .filter(Boolean)
            .join(", "),
          url: detail.url,
        };
      }),
    );
    companies.push(...batch);
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("congruent: the business-model tags moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("congruent: the companies' website links moved");
  }

  return companies;
}
