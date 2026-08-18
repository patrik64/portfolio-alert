import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.ivp.com";
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

// nuxt serializes its payload as one flat array in which every object value
// is the index of another slot
type Node = null | boolean | number | string | Node[] | { [key: string]: number };

// the company's website is the one outbound link on its profile page
async function websiteOf(slug: string): Promise<string> {
  let html: string;
  try {
    html = await fetchPage(`${PAGE_URL}${slug}/`);
  } catch (err) {
    // a company the grid lists without a profile page simply keeps no url
    if (err instanceof Error && err.message.endsWith(": 404")) return "";
    throw err;
  }
  const url =
    html.match(/<a class="base_link[^"]*"[^>]*href="(https?:\/\/[^"]+)"[^>]*target="_blank"/)?.[1] ??
    "";
  // a profile without a company link offers only ivp's own pages — not an
  // address for the company
  const host = url.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
  return host.endsWith("ivp.com") || host.endsWith("sharesecurely.com") ? "" : url;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);
  const raw = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!raw) {
    throw new Error("ivp: the nuxt payload is gone — the page moved");
  }
  const data = JSON.parse(raw) as Node[];
  const at = (i: unknown): Node => (typeof i === "number" ? (data[i] ?? null) : null);

  // the search widget's company list is the one authoritative roster; the
  // same documents recur under news posts, so the roster is what counts
  let roster: Node[] = [];
  for (const node of data) {
    if (node && typeof node === "object" && !Array.isArray(node) && "searchWidgetCompanies" in node) {
      const list = at(node.searchWidgetCompanies);
      if (Array.isArray(list)) roster = list;
      break;
    }
  }
  if (roster.length === 0) {
    throw new Error("ivp: the company roster moved out of the payload");
  }

  interface Card {
    name: string;
    slug: string;
  }

  const cards: Card[] = [];
  const seen = new Set<string>();
  for (const ref of roster) {
    const doc = at(ref);
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) continue;
    const name = text(typeof at(doc.name) === "string" ? (at(doc.name) as string) : "");
    const slug = typeof at(doc.slug) === "string" ? (at(doc.slug) as string) : "";
    if (!name || !slug || seen.has(name)) continue;
    seen.add(name);
    cards.push({ name, slug });
  }
  if (cards.length === 0) {
    throw new Error("ivp: no company was named in the roster");
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      cards.slice(i, i + BATCH_SIZE).map(async (card) => ({
        name: card.name,
        // ivp publishes no sector or status for its companies
        category: "",
        url: await websiteOf(card.slug),
      })),
    );
    companies.push(...batch);
  }

  if (!companies.some((company) => company.url)) {
    throw new Error("ivp: the companies' website links moved");
  }

  return companies;
}
