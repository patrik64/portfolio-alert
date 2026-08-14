import type { ScrapedCompany } from './types';

const BASE_URL = "https://standardindustries.com";
const PAGE_URL = `${BASE_URL}/our-businesses/standard-investments/venture-capital`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Item {
  name?: string | null;
  categories?: (string | null)[] | null;
  isExited?: boolean;
  link?: { href?: string | null } | null;
}

const clean = (s: string) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// next.js streams the page's data as javascript string literals
function flightPayload(html: string) {
  const chunks: string[] = [];
  for (const push of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      chunks.push(JSON.parse(push[1]));
    } catch {
      // a chunk that won't parse is one the page never used either
    }
  }
  return chunks.join("");
}

// the payload is a stream rather than one document, so each company is read
// from its opening brace to the matching close
function objectAt(payload: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < payload.length; i++) {
    const char = payload[i];
    if (escaped) {
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      inString = !inString;
    } else if (!inString) {
      if (char === "{") depth++;
      else if (char === "}" && --depth === 0) return payload.slice(start, i + 1);
    }
  }
  return "";
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const payload = flightPayload(await fetchPage(PAGE_URL));
  if (!payload) {
    throw new Error("standard industries: the page carried no data");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  // a company and the block listing them all open the same way, so what is
  // inside decides which is which
  for (const match of payload.matchAll(/\{"_key":"[0-9a-f]+","categories":\[/g)) {
    const raw = objectAt(payload, match.index ?? 0);
    if (!raw) continue;

    let item: Item;
    try {
      item = JSON.parse(raw) as Item;
    } catch {
      continue;
    }

    const name = clean(item.name ?? "");
    if (!name || typeof item.isExited !== "boolean" || seen.has(name)) continue;
    seen.add(name);

    companies.push({
      name,
      category: [
        ...(item.categories ?? []).map((category) => clean(category ?? "")),
        item.isExited ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: clean(item.link?.href ?? ""),
    });
  }

  if (companies.length === 0) {
    throw new Error("standard industries: no companies found in the portfolio");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("standard industries: the portfolio's categories moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("standard industries: the companies' links moved");
  }

  return companies;
}
