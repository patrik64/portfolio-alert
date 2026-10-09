import type { ScrapedCompany } from './types';

const PAGE_URL = "https://initialized.com/portfolio";

// next.js, moved in october 2026 from /companies to /portfolio and from a
// page with its data in a json script to one whose payload is pushed to the
// page's script in pieces: the list of companies is what the page hands its
// grid, each with its name, its site, its tags and the fund's unicorn mark
const LIST = '"companies":[';
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

interface Startup {
  name?: string;
  websiteUrl?: string;
  isUnicorn?: boolean;
  tags?: unknown[];
}

// the page's payload, pushed to the page's script in pieces
function flightPayload(html: string): string {
  const chunks: string[] = [];
  for (const push of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      chunks.push(JSON.parse(push[1]));
    } catch {
      // a chunk that will not parse is one the page never used either
    }
  }
  return chunks.join("");
}

// the json array that opens at start, up to its closing bracket
function arrayAt(payload: string, start: number): string {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < payload.length; i++) {
    const c = payload[i];
    if (escaped) escaped = false;
    else if (c === "\\") escaped = true;
    else if (c === '"') inString = !inString;
    else if (!inString) {
      if (c === "[") depth++;
      else if (c === "]" && --depth === 0) return payload.slice(start, i + 1);
    }
  }
  return "";
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const payload = flightPayload(await resp.text());
  const at = payload.indexOf(LIST);
  const list = at < 0 ? "" : arrayAt(payload, at + LIST.length - 1);
  if (!list) {
    throw new Error("initialized: no list of companies in the page's payload — the page moved");
  }
  const startups = JSON.parse(list) as Startup[];

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const a of startups) {
    const name = text(a.name ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const tags = (a.tags ?? [])
      .map((tag) => (typeof tag === "string" ? text(tag) : ""))
      .filter(Boolean);
    // "Exit" is one of the site's own tags; it reads best last, and a
    // billion-dollar company carries the fund's unicorn mark
    const exited = tags.includes("Exit");

    companies.push({
      name,
      category: [
        ...tags.filter((tag) => tag !== "Exit"),
        a.isUnicorn ? "Unicorn" : "",
        exited ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: a.websiteUrl ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("initialized: no companies found in the payload");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("initialized: the tag data moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("initialized: the companies' website links moved");
  }

  return companies;
}
