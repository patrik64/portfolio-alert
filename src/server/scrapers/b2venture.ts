import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.b2venture.vc";
const PAGE_URL = `${BASE_URL}/portfolio`;
const MAX_PAGES = 100;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// b2venture files how it left a company in with the sectors, and the filter row
// lists the first two alongside them
const STATUSES = new Set(["trade sale", "ipo", "exited"]);

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

interface Row {
  name: string;
  year: string;
  region: string;
  sectors: string[];
  url: string;
}

function parsePage(html: string, rows: Map<string, Row>) {
  let found = 0;
  for (const raw of html.split('<div role="listitem" class="company-item w-dyn-item">').slice(1)) {
    const item = raw.split('<div role="listitem" class="company-item w-dyn-item">')[0];
    const field = (name: string) =>
      text(item.match(new RegExp(`fs-cmssort-field="${name}"[^>]*>([\\s\\S]*?)</div>`))?.[1] ?? "");

    const name = field("name");
    if (!name) continue;
    found++;
    if (rows.has(name)) continue;

    rows.set(name, {
      name,
      year: field("year"),
      region: field("region"),
      sectors: [...item.matchAll(/fs-cmsfilter-field="sector"[^>]*>([\s\S]*?)<\/div>/g)].map((m) =>
        text(m[1]),
      ),
      // the whole row is a link out to the company
      url:
        item.match(
          /<a href="(https?:\/\/[^"]+)" target="_blank" class="portfolio-table-grid link/,
        )?.[1] ?? "",
    });
  }
  return found;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const rows = new Map<string, Row>();
  let perPage = 0;
  let short = 0;
  let ended = false;

  // webflow keeps offering a "next" link past the end of the list, so the pages
  // are walked until one comes back empty
  for (let page = 1; page <= MAX_PAGES && !ended; page++) {
    const found = parsePage(
      await fetchPage(page === 1 ? PAGE_URL : `${PAGE_URL}?aa668c5b_page=${page}`),
      rows,
    );
    if (found === 0) {
      ended = true;
      break;
    }
    // only the last page is allowed to be short, so a short page followed by
    // more companies means one was served incomplete
    if (short) {
      throw new Error(`b2venture: page ${short} was short but the list carried on`);
    }
    if (page === 1) perPage = found;
    else if (found < perPage) short = page;
  }
  if (!ended) {
    throw new Error(`b2venture: the portfolio still paginated after ${MAX_PAGES} pages`);
  }

  if (rows.size === 0) {
    throw new Error("b2venture: no companies found in the portfolio table");
  }

  const companies = [...rows.values()].map((row) => {
    const sectors = row.sectors.filter((sector) => !STATUSES.has(sector.toLowerCase()));
    const exits = row.sectors.filter((sector) => STATUSES.has(sector.toLowerCase()));
    return {
      name: row.name,
      category: [
        ...sectors,
        row.region,
        row.year,
        ...exits,
        exits.length > 0 && !exits.some((exit) => /^exited$/i.test(exit)) ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: row.url,
    };
  });

  if (!companies.some((company) => company.category)) {
    throw new Error("b2venture: the portfolio table's columns moved");
  }

  return companies;
}
