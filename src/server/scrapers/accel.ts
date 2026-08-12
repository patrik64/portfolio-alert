import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.accel.com";
const PAGE_URL = `${BASE_URL}/companies`;
const PAGE_SIZE = 100;
const MAX_PAGES = 30;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Company {
  _type?: string;
  name?: string;
  slug?: { current?: string } | null;
  websiteUrl?: string | null;
  firstInvestDate?: string | null;
  firstExitType?: string | null;
  secondaryExitType?: string | null;
  initialInvestment?: { name?: string } | null;
  initialInvestmentType?: string | null;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// the ways accel has spelled an exit; anything new comes through as typed
const EXITS: Record<string, string> = { acquired: "Acquired", ipo: "IPO", spac: "SPAC" };

// "series-a" -> "Series A", "seed" -> "Seed"
const stage = (s: string) =>
  s
    .split("-")
    .map((part) => (part.length <= 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");

async function fetchText(url: string, init?: RequestInit) {
  const resp = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...(init?.headers ?? {}) },
  });
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

function collect(payload: string, companies: Map<string, Company>) {
  // every record opens with the date sanity created it; the ids are of two
  // shapes, so the type inside the object is what identifies a company
  for (const match of payload.matchAll(/\{"_createdAt":"/g)) {
    const raw = objectAt(payload, match.index ?? 0);
    if (!raw || !raw.includes('"_type":"company"')) continue;

    let entry: Company;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    if (entry._type !== "company") continue;

    const key = entry.slug?.current || entry.name;
    if (key && !companies.has(key)) companies.set(key, entry);
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchText(PAGE_URL);
  const payload = flightPayload(html);
  if (!payload) {
    throw new Error("accel: the page carried no data — the site moved off next.js");
  }

  const companies = new Map<string, Company>();
  collect(payload, companies);
  const total = Number(payload.match(/"totalCount":(\d+)/)?.[1] ?? 0);
  if (companies.size === 0) {
    throw new Error("accel: no companies found on the page");
  }

  // the grid holds a couple of hundred companies and asks a server action for
  // the rest. its id is minted at build time, so it's read from the bundle the
  // page loads rather than pinned here
  if (total > companies.size) {
    let action = "";
    const bundles = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[a-z0-9]+\.js/g)].map((m) => m[0]))];
    for (let i = 0; i < bundles.length && !action; i += 8) {
      const batch = await Promise.all(
        bundles.slice(i, i + 8).map((chunk) => fetchText(`${BASE_URL}${chunk}`).catch(() => "")),
      );
      for (const source of batch) {
        const id = source.match(
          /createServerReference\)\("([0-9a-f]+)"[^)]*"loadMoreCompanies"\)/,
        )?.[1];
        if (id) {
          action = id;
          break;
        }
      }
    }
    if (!action) {
      throw new Error("accel: the companies grid's load-more action was not found in the bundle");
    }

    for (let page = 0; page < MAX_PAGES && companies.size < total; page++) {
      const before = companies.size;
      collect(
        flightOrBody(
          await fetchText(PAGE_URL, {
            method: "POST",
            headers: { "Next-Action": action, "Content-Type": "text/plain;charset=UTF-8" },
            body: JSON.stringify([page * PAGE_SIZE, PAGE_SIZE]),
          }),
        ),
        companies,
      );
      // the pages overlap, so a page that adds nothing is the end of the list
      if (companies.size === before && page * PAGE_SIZE >= total) break;
    }
  }

  if (total > 0 && companies.size < total) {
    throw new Error(`accel: read ${companies.size} of the ${total} companies listed`);
  }

  return [...companies.values()].map((entry) => {
    const exits = [entry.firstExitType, entry.secondaryExitType]
      // accel types these by hand, so they arrive with stray case and spacing
      .map((exit) => clean(exit ?? ""))
      .map((exit) => EXITS[exit.toLowerCase()] ?? exit)
      .filter((exit, i, all) => exit && all.indexOf(exit) === i);

    return {
      name: clean(entry.name ?? ""),
      category: [
        entry.initialInvestmentType ? stage(entry.initialInvestmentType) : "",
        entry.initialInvestment?.name ?? "",
        entry.firstInvestDate ?? "",
        ...exits,
        exits.length > 0 ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: (entry.websiteUrl ?? "").trim(),
    };
  });
}

// a server action answers with the page's stream directly, not wrapped in html
function flightOrBody(body: string) {
  return body.includes("self.__next_f.push") ? flightPayload(body) : body;
}
