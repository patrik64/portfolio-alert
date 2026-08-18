import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.preludeventures.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 6;
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

// the site rate-limits bursts of profile-page fetches with 429s, which pass
// after a few seconds of patience
async function fetchPage(url: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const resp = await fetch(url, { headers: { "User-Agent": UA } });
      if (!resp.ok) {
        const err = new Error(`Failed to fetch ${url}: ${resp.status}`);
        if (resp.status === 429 && attempt < 5) {
          lastError = err;
          await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
          continue;
        }
        throw err;
      }
      return await resp.text();
    } catch (err) {
      lastError = err;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError;
}

// a company with its own profile page publishes the website there, as the
// link wrapped around the logo
async function websiteOf(detailUrl: string): Promise<string> {
  const html = await fetchPage(detailUrl);
  return (
    html.match(/<a href="(https?:\/\/[^"]+)"\s+target="_blank"[^>]*>\s*<span class="sr-only">/)?.[1] ??
    ""
  );
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  // the filter buttons spell out the labels the cards carry as slugs
  // ("food-agriculture" is shown as "Food & Agriculture")
  const labels = new Map<string, string>();
  for (const m of html.matchAll(
    /<button[^>]*data-filter="([a-z0-9-]+)"[^>]*>([\s\S]{0,300}?)<\/button>/g,
  )) {
    const label = text(m[2]);
    if (label) labels.set(m[1], label);
  }
  if (labels.size === 0) {
    throw new Error("prelude: the portfolio filter moved");
  }

  interface Card {
    name: string;
    category: string;
    href: string;
  }

  const cards: Card[] = [];
  const seen = new Set<string>();
  for (const block of html.split(/<li(?=\s[^>]*\bdata-item\b)/).slice(1)) {
    const link = block.match(/<a\s+href="([^"]+)"[^>]*data-card-link[^>]*>([\s\S]*?)<\/a>/);
    const name = text(link?.[2] ?? "");
    if (!link || !name || seen.has(name)) continue;
    seen.add(name);

    const slugs = (block.slice(0, block.indexOf(">")).match(/data-filter="([^"]*)"/)?.[1] ?? "")
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean);
    const sectors = slugs
      .filter((slug) => slug !== "current" && slug !== "exited")
      .map((slug) => labels.get(slug) ?? "")
      .filter(Boolean);
    const exited = slugs.includes("exited");

    cards.push({
      name,
      category: [...sectors, exited ? "Exited" : ""].filter(Boolean).join(", "),
      href: link[1],
    });
  }

  if (cards.length === 0) {
    throw new Error("prelude: no companies found in the listing");
  }

  // most cards link to a profile page here; the rest go straight to the
  // company's own site and need no second fetch
  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      cards.slice(i, i + BATCH_SIZE).map(async (card) => ({
        name: card.name,
        category: card.category,
        url: card.href.startsWith(BASE_URL) ? await websiteOf(card.href) : card.href,
      })),
    );
    companies.push(...batch);
    if (i + BATCH_SIZE < cards.length) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("prelude: the sector and status markers moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("prelude: the companies' website links moved");
  }

  return companies;
}
