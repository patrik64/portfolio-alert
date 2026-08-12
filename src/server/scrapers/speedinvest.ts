import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.speedinvest.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

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
  const resp = await fetch(url, { headers: HEADERS });
  // speedinvest's bot filter serves this fund from a laptop but turns away the
  // deployed app, whichever headers it sends — the block is on where the
  // request comes from, and it is the only fund here that does this
  if (resp.status === 403) {
    throw new Error(
      "speedinvest: refused this request (403) — the site only answers fetches run locally",
    );
  }
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// every company is one collapsible row, and the row carries everything the
// expanded panel shows: the sector tags, the year, the country and the website
function parsePage(html: string, companies: ScrapedCompany[], seen: Set<string>) {
  let found = 0;
  for (const card of html.split('class="portfolio-list_dropdown w-dropdown"').slice(1)) {
    const name = text(card.match(/fs-list-field="itemTitle"[^>]*>([\s\S]*?)<\/h6>/)?.[1] ?? "");
    if (!name) continue;
    found++;
    if (seen.has(name)) continue;
    seen.add(name);

    // the collapsed row lists the sectors; the country sits in the panel below
    // it, tagged the same way, so only the row is read for sectors
    const row = card.split("<nav")[0];
    const sectors = [...row.matchAll(/<div fs-list-field="portfolio">([\s\S]*?)<\/div>/g)].map(
      (m) => text(m[1]),
    );
    const country = text(
      card.match(/<div class="hide"><div fs-list-field="portfolio">([\s\S]*?)<\/div>/)?.[1] ?? "",
    );
    const year = text(card.match(/fs-list-field="date">([^<]*)</)?.[1] ?? "");
    // the website is handed to a script that turns it into the "Links" anchor
    const url = card.match(/data-fullurl="(https?:\/\/[^"]+)"/)?.[1] ?? "";

    companies.push({
      name,
      category: [
        ...sectors.filter((s) => s.toLowerCase() !== "exits"),
        country,
        year,
        sectors.some((s) => s.toLowerCase() === "exits") ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url,
    });
  }
  return found;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const first = await fetchPage(PAGE_URL);

  // webflow paginates the list server-side and prints how many pages it has;
  // the query parameter is generated per collection, so it's read, not assumed
  const param = first.match(/load-more-button="true"[^>]*href="\?([a-z0-9]+_page)=2"/)?.[1] ?? "";
  const pages = Number(first.match(/aria-label="Page \d+ of (\d+)"/)?.[1] ?? 0);
  if (!param || !pages) {
    throw new Error("speedinvest: portfolio pagination not found — the page layout moved");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  const perPage = parsePage(first, companies, seen);

  for (let page = 2; page <= pages; page++) {
    const found = parsePage(
      await fetchPage(`${PAGE_URL}?${param}=${page}`),
      companies,
      seen,
    );
    // a short page before the last one means the pagination stopped serving
    if (found === 0 || (page < pages && found < perPage)) {
      throw new Error(`speedinvest: page ${page} of ${pages} returned ${found} companies`);
    }
  }

  if (companies.length === 0) {
    throw new Error("speedinvest: no companies found in the portfolio list");
  }
  // without the tags every company would import uncategorised
  if (!companies.some((company) => company.category)) {
    throw new Error("speedinvest: portfolio tags not found — the row markup moved");
  }

  return companies;
}
