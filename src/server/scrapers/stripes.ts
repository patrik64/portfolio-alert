import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.stripes.co";
const PAGE_URL = `${BASE_URL}/investments`;
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

// the company's website is published on its profile page, behind the
// "Visit Website" button. the site refuses these deeper pages to datacenter
// addresses with 403s, so a blocked or missing profile costs the company its
// url but never the refresh — existing rows keep the urls a local run found
async function websiteOf(slug: string): Promise<string> {
  let html: string;
  try {
    html = await fetchPage(`${PAGE_URL}/${slug}`);
  } catch (err) {
    if (err instanceof Error && /: (403|404|429)$/.test(err.message)) return "";
    throw err;
  }
  return html.match(/<a href="(https?:\/\/[^"]+)" target="_blank" class="btn-large"/)?.[1] ?? "";
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  interface Card {
    name: string;
    slug: string;
    category: string;
  }

  const cards: Card[] = [];
  const seen = new Set<string>();
  for (const card of html
    .split('class="investment-card scroll-mt-[100px]"')
    .slice(1)
    .map((c) => c.slice(0, 3000))) {
    const slug = card.match(/<a href="https:\/\/www\.stripes\.co\/investments\/([^"]+)"/)?.[1] ?? "";
    const name = text(card.match(/class="h3[^"]*">\s*([\s\S]*?)<\/div>/)?.[1] ?? "");
    if (!name || !slug || seen.has(name)) continue;
    seen.add(name);

    // the card carries a one-line blurb and a Current/Exited badge
    const blurb = text(card.match(/leading-\[16px\] text-center">\s*([\s\S]*?)<\/div>/)?.[1] ?? "");
    const exited = /rounded-full body-sm px-3 py-1">\s*Exited\s*</.test(card);

    cards.push({
      name,
      slug,
      category: [blurb, exited ? "Exited" : ""].filter(Boolean).join(", "),
    });
  }

  if (cards.length === 0) {
    throw new Error("stripes: no companies found in the listing");
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      cards.slice(i, i + BATCH_SIZE).map(async (card) => ({
        name: card.name,
        category: card.category,
        url: await websiteOf(card.slug),
      })),
    );
    companies.push(...batch);
    if (i + BATCH_SIZE < cards.length) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("stripes: the blurb and status markers moved");
  }
  // no url guard: from a datacenter address every profile page is refused,
  // so a run may legitimately come home with none

  return companies;
}
