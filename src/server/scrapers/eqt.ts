import type { ScrapedCompany } from './types';

const BASE_URL = "https://eqtgroup.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// eqt keeps what it holds and what it has sold on two pages that share no
// companies, and only the second one carries exit years
const LISTINGS = [
  { path: "/about/current-portfolio", exited: false },
  { path: "/about/current-portfolio/divestments", exited: true },
];

interface KeyFacts {
  sector?: string | null;
  country?: string | null;
  launchYear?: string | null;
  exit?: string | null;
}

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// next.js streams the page's data as javascript string literals; joining them
// back up gives the document the browser reassembles, json and all
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

// the payload is a stream rather than one document, so each company object is
// taken from its opening brace to its matching close
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
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  for (const listing of LISTINGS) {
    const payload = flightPayload(await fetchPage(`${BASE_URL}${listing.path}`));
    if (!payload) {
      throw new Error(`eqt: ${listing.path} carried no page data — the site moved off next.js`);
    }

    let found = 0;
    for (const match of payload.matchAll(/\{"_id":"[0-9a-f-]{36}","_key":/g)) {
      const raw = objectAt(payload, match.index ?? 0);
      if (!raw) continue;

      let entry: { title?: string; keyFacts?: KeyFacts };
      try {
        entry = JSON.parse(raw);
      } catch {
        continue;
      }
      // the same shape carries the page's articles, which have no key facts
      const facts = entry.keyFacts;
      if (!facts || typeof facts !== "object") continue;

      const name = (entry.title ?? "").trim();
      if (!name) continue;
      found++;
      // a company held through two funds is listed once per fund
      if (seen.has(name)) continue;
      seen.add(name);

      companies.push({
        name,
        category: [
          facts.sector ?? "",
          facts.country ?? "",
          facts.launchYear ?? "",
          listing.exited ? (facts.exit ?? "") : "",
          listing.exited ? "Exited" : "",
        ]
          .map((part) => String(part).trim())
          .filter(Boolean)
          .join(", "),
        // eqt names no company websites anywhere on either page
        url: "",
      });
    }

    if (found === 0) {
      throw new Error(`eqt: no companies found on ${listing.path}`);
    }
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("eqt: the portfolio's key facts moved");
  }

  return companies;
}
