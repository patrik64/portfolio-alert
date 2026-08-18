import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.tcv.com";
const PAGE_URL = `${BASE_URL}/partnerships`;
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

const clean = (s: string) =>
  decode(s)
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

// the company records ride in the react flight payload, one escaped string
// chunk per script tag
function flightPayload(html: string): string {
  const chunks: string[] = [];
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      chunks.push(JSON.parse(`"${m[1]}"`));
    } catch {
      // a chunk that isn't a plain string carries no company data
    }
  }
  return chunks.join("");
}

// the company's website is published on its profile page, as the link
// labeled "Website"
async function websiteOf(slug: string): Promise<string> {
  let html: string;
  try {
    html = await fetchPage(`${PAGE_URL}/${slug}`);
  } catch (err) {
    if (err instanceof Error && err.message.endsWith(": 404")) return "";
    throw err;
  }
  return html.match(/<a href="(https?:\/\/[^"]+)"[^>]*>Website/)?.[1] ?? "";
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const payload = flightPayload(await fetchPage(PAGE_URL));

  interface Card {
    name: string;
    slug: string;
    category: string;
  }

  const cards: Card[] = [];
  const seen = new Set<string>();
  // every record opens with its continent field
  for (const block of payload.split('{"continent":').slice(1).map((b) => b.slice(0, 2500))) {
    const name = clean(block.match(/"name":"((?:[^"\\]|\\.)*)","sectors2"/)?.[1] ?? "");
    const slug = block.match(/"slug":"([^"]*)","status"/)?.[1] ?? "";
    if (!name || !slug || seen.has(name)) continue;
    seen.add(name);

    const sectors = [...block.matchAll(/\{"name":"([^"]+)","slug":"[^"]+"\}/g)].map((m) =>
      clean(m[1]),
    );
    const location = clean(block.match(/"location":"((?:[^"\\]|\\.)*)"/)?.[1] ?? "");
    // "Prior" is tcv's word for an investment it no longer holds
    const exited = block.match(/"status":"([^"]*)"/)?.[1] === "Prior";

    cards.push({
      name,
      slug,
      category: [...sectors, location, exited ? "Exited" : ""].filter(Boolean).join(", "),
    });
  }

  if (cards.length === 0) {
    throw new Error("tcv: no companies found in the payload");
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
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("tcv: the sector and status fields moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("tcv: the companies' website links moved");
  }

  return companies;
}
