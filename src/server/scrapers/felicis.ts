import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.felicis.com/companies";
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

// "acquired" and "ipo" are milestones as felicis states them; "current" is a
// company still held
const STATUS_LABEL: Record<string, string> = { acquired: "Acquired", ipo: "IPO" };

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const payload = flightPayload(await resp.text());

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  // every sanity company document declares its type
  for (const block of payload.split('"_type":"company"').slice(1).map((b) => b.slice(0, 3000))) {
    const name = clean(block.match(/"name":"((?:[^"\\]|\\.)*)","slug"/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const domains = block.match(/"domains":\[([\s\S]*?)\],"/)?.[1] ?? "";
    const sectors = [...domains.matchAll(/"title":"([^"]*)"/g)].map((m) => clean(m[1]));
    const stage = clean(block.match(/"stage":\{[\s\S]{0,300}?"title":"([^"]*)"/)?.[1] ?? "");
    const status = block.match(/"status":"([^"]*)"/)?.[1] ?? "";

    companies.push({
      name,
      category: [...sectors, stage, STATUS_LABEL[status] ?? ""].filter(Boolean).join(", "),
      url: block.match(/"websiteUrl":"(https?:[^"]*)"/)?.[1] ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("felicis: no companies found in the payload");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("felicis: the domain and stage fields moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("felicis: the companies' website links moved");
  }

  return companies;
}
