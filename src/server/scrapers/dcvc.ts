import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.dcvc.com/companies/";
const BATCH_SIZE = 16;
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

interface Card {
  name: string;
  detailUrl: string;
  category: string;
}

// the company's own website is published only on its dcvc detail page, as the
// header's call-to-action button
async function websiteOf(detailUrl: string): Promise<string> {
  const html = await fetchPage(detailUrl);
  return html.match(/basic-header__cta[\s\S]{0,300}?href="(https?:\/\/[^"]+)"/)?.[1] ?? "";
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  // the filter buttons spell out the labels the cards carry as slugs
  // ("computational-bio-and-chem" is shown as "Computational Bio & Chem")
  const labels = new Map<string, string>();
  for (const m of html.matchAll(
    /setFilter\('sector',\s*'([a-z0-9-]+)'\)"[^>]*>\s*<span[^>]*>([^<]+)</g,
  )) {
    if (m[1] !== "all") labels.set(m[1], text(m[2]));
  }
  if (labels.size === 0) {
    throw new Error("dcvc: the sector filter moved");
  }

  const cards: Card[] = [];
  const seen = new Set<string>();
  for (const card of html.split('<article class="company-card js--company-card"').slice(1)) {
    const link = card.match(
      /<a href="(https:\/\/www\.dcvc\.com\/companies\/[^"]+)" class="company-card__figure-link" aria-label="([^"]*)"/,
    );
    const name = text(link?.[2] ?? "");
    if (!link || !name || seen.has(name)) continue;
    seen.add(name);

    const attrs = card.slice(0, card.indexOf("<a "));
    const sectors = (attrs.match(/data-sector="([^"]*)"/)?.[1] ?? "")
      .split(",")
      .filter((slug) => slug && slug !== "all")
      .map((slug) => labels.get(slug) ?? "")
      .filter(Boolean);
    const exited = /data-status="[^"]*\bexits\b[^"]*"/.test(attrs);

    cards.push({
      name,
      detailUrl: link[1],
      category: [...sectors, exited ? "Exited" : ""].filter(Boolean).join(", "),
    });
  }

  if (cards.length === 0) {
    throw new Error("dcvc: no companies found in the listing");
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      cards.slice(i, i + BATCH_SIZE).map(async (card) => ({
        name: card.name,
        category: card.category,
        url: await websiteOf(card.detailUrl),
      })),
    );
    companies.push(...batch);
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("dcvc: the sector and status markers moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("dcvc: the companies' website links moved");
  }

  return companies;
}
