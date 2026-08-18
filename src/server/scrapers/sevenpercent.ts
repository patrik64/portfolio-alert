import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.7pc.vc";
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 16;
const MAX_PAGES = 10;
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

// campaign trackers riding on a published link are not part of the address
const cleanUrl = (url: string) => {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|gclid|gclsrc|fbclid|mc_)/.test(key)) u.searchParams.delete(key);
    }
    return u.toString().replace(/\?$/, "");
  } catch {
    return url;
  }
};

// the company's website is published on its profile page, as a link labeled
// with the bare domain; stealth companies have none
async function websiteOf(detailPath: string): Promise<string> {
  const html = await fetchPage(`${BASE_URL}${detailPath}`);
  const url = html.match(
    /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="single-portfolio---link[^"]*"/,
  )?.[1];
  return url ? cleanUrl(decode(url)) : "";
}

const CARD_MARKER = 'role="listitem" class="project-card-left vid w-dyn-item"';

export async function scrape(): Promise<ScrapedCompany[]> {
  const first = await fetchPage(PAGE_URL);

  // webflow's own pagination: the next-page link names the query parameter
  const pageParam = first.match(/href="\?([a-z0-9_]+_page)=2"/)?.[1];

  interface Card {
    name: string;
    category: string;
    detailPath: string;
  }

  const cards: Card[] = [];
  const seen = new Set<string>();
  const collect = (html: string) => {
    const blocks = html.split(CARD_MARKER).slice(1);
    for (const block of blocks) {
      const field = (name: string) =>
        text(block.match(new RegExp(`fs-cmsfilter-field="${name}"[^>]*>([^<]*)<`))?.[1] ?? "");
      const name = field("Name");
      const detailPath = block.match(/<a href="(\/portfolio\/[^"]+)"/)?.[1] ?? "";
      if (!name || !detailPath || seen.has(name)) continue;
      seen.add(name);

      const tags = field("Tags")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const exited = field("Status") === "Exit";

      cards.push({
        name,
        category: [...tags, exited ? "Exited" : ""].filter(Boolean).join(", "),
        detailPath,
      });
    }
    return blocks.length;
  };

  if (collect(first) === 0) {
    throw new Error("7percent: no companies found in the portfolio");
  }
  if (pageParam) {
    for (let page = 2; page <= MAX_PAGES; page++) {
      const count = collect(await fetchPage(`${PAGE_URL}?${pageParam}=${page}`));
      if (count === 0) break;
    }
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      cards.slice(i, i + BATCH_SIZE).map(async (card) => ({
        name: card.name,
        category: card.category,
        url: await websiteOf(card.detailPath),
      })),
    );
    companies.push(...batch);
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("7percent: the tag and status markers moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("7percent: the companies' website links moved");
  }

  return companies;
}
