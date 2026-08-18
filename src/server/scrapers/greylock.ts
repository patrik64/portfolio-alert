import type { ScrapedCompany } from './types';

const BASE_URL = "https://greylock.com";
const PAGE_URL = `${BASE_URL}/portfolio/`;
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

// the company's website is published on its profile page, inside the
// structured-data block search engines read; greylock's own Organization
// schema also rides on the page, so the company's is picked out by its @id
async function websiteOf(slug: string): Promise<string> {
  const html = await fetchPage(`${PAGE_URL}${slug}/`);
  const url =
    html.match(
      /"@id":"[^"]*\/portfolio\/[^"]*#organization"[\s\S]{0,300}?"url":"(https?:\/\/[^"]+)"/,
    )?.[1] ?? "";
  return /^https?:\/\/(www\.)?greylock\.com\/?$/.test(url) ? "" : url;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const payload = flightPayload(await fetchPage(PAGE_URL));

  interface Record_ {
    name: string;
    slug: string;
    category: string;
  }

  const records: Record_[] = [];
  const seen = new Set<string>();
  for (const block of payload.split('{"_id":"company-').slice(1)) {
    const head = block.slice(0, 1500);
    // investors carry names of their own, so the company's is the one sitting
    // right before its slug and status
    const own = head.match(/"name":"((?:[^"\\]|\\.)*)","slug":"([^"]*)","status":"([^"]*)"/);
    if (!own) continue;
    const name = text(own[1]);
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const domain = text(head.match(/"domain":"((?:[^"\\]|\\.)*)"/)?.[1] ?? "");
    const partnered = text(head.match(/"firstPartnered":"((?:[^"\\]|\\.)*)"/)?.[1] ?? "");
    const status = text(own[3]);

    records.push({
      name,
      slug: own[2],
      // "Acquired" and "Public" are milestones as greylock states them — not
      // a claim that the fund is out
      category: [domain, partnered, status === "Active" ? "" : status]
        .filter(Boolean)
        .join(", "),
    });
  }

  if (records.length === 0) {
    throw new Error("greylock: no companies found in the portfolio payload");
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      records.slice(i, i + BATCH_SIZE).map(async (record) => ({
        name: record.name,
        category: record.category,
        url: record.slug ? await websiteOf(record.slug) : "",
      })),
    );
    companies.push(...batch);
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("greylock: the domain and status markers moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("greylock: the companies' website links moved");
  }

  return companies;
}
