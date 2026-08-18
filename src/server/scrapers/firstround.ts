import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.firstround.com/companies";
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

// first round marks a company's exit in its status; the label is stated as
// the fund states it, not as a claim the fund is out
const STATUS_LABEL: Record<string, string> = { acquired: "Acquired", ipo: "IPO" };

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const payload = flightPayload(await resp.text());

  // the sector taxonomy: each category document resolves an id to its title
  // ("Fintech"); location documents share the shape, so a company's own
  // category references pick the sectors back out
  const labels = new Map<string, string>();
  for (const m of payload.matchAll(/"id":"(import-[^"]+)","slug":"[^"]*","title":"([^"]*)"/g)) {
    labels.set(m[1], clean(m[2]));
  }
  if (labels.size === 0) {
    throw new Error("firstround: the category taxonomy moved");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  // every company object opens with "cardType"
  for (const block of payload.split('"cardType":').slice(1).map((b) => b.slice(0, 1600))) {
    const name = clean(block.match(/"title":"((?:[^"\\]|\\.)*)"/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const sectors = [
      ...(block.match(/"companyCategories":\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"(import-[^"]+)"/g),
    ]
      .map((m) => labels.get(m[1]) ?? "")
      .filter(Boolean);
    const status = block.match(/"status":"([^"]*)"/)?.[1] ?? "";

    companies.push({
      name,
      category: [...sectors, STATUS_LABEL[status] ?? ""].filter(Boolean).join(", "),
      url: (block.match(/"website":"(https?:[^"]*)"/)?.[1] ?? "").replace(/\\\//g, "/"),
    });
  }

  if (companies.length === 0) {
    throw new Error("firstround: no companies found in the payload");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("firstround: the category references moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("firstround: the companies' website links moved");
  }

  return companies;
}
