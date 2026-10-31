import type { ScrapedCompany } from "./types";

const BASE_URL = "https://onetarget.vc";
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 8;
// webflow renders at most this many items of a collection at once, which is
// why the portfolio is laid out as more than one list
const LIST_LIMIT = 100;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// in october 2026 target global became onetarget: www.targetglobal.vc now
// redirects to onetarget.vc, a new webflow site. the portfolio page is a wall
// of logos, each named only in its alt text and linking the company's page,
// with the facts its filters read written on it as slugs ("series-a"). a
// company's page spells those out and adds the year the fund came in and the
// company's own site, so the pages are read for them; a page that will not
// load leaves its company linking to that page.
//
// the new page lists fewer companies than the old one and adds much of the
// fund's exit history. the old site's stay stored.

// companies stored from the old site under the names it gave them
const STORED_AS: Record<string, string> = {
  alta: "Graphiti",
  ferry: "Ferry (formerly ThirdRails)",
  karma: "KarmaNow",
};

const TILE =
  /<div\b([^>]*)\brole="listitem" class="portfolio_item is-companies w-dyn-item"><a href="\/portfolio\/([^"/]+)"[^>]*><img\b[^>]*\balt="([^"]*)"/g;
const STATUS = /\bdata-x-filter-status="([^"]*)"/;
const FACT = /<div class="company_fact is-(\w+)">[\s\S]*?<dd class="company_fact-value">([\s\S]*?)<\/dd>/g;
const SITE = /<a\b[^>]*\bhref="(https?:\/\/[^"]+)"[^>]*>\s*<span>Company website<\/span>/;
const STEALTH = /^stealth\b/i;

const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, named) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return NAMED[String(named).toLowerCase()] ?? whole;
  });

const text = (s: string) =>
  decode(s.replace(/<[^>]+>/g, " "))
    .replace(/​/g, "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();

// the category is comma-joined, so a label holding a comma would read as two
const tag = (s: string) => text(s).replace(/\s*,\s*/g, " / ");

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// what a company's page says of it, or nothing when the page will not load
async function detailsOf(page: string): Promise<{ facts: Map<string, string>; site: string }> {
  try {
    const html = await fetchPage(page);
    return {
      facts: new Map([...html.matchAll(FACT)].map(([, field, value]) => [field, tag(value)])),
      site: decode(html.match(SITE)?.[1] ?? ""),
    };
  } catch {
    return { facts: new Map(), site: "" };
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  const tiles: { name: string; page: string; exited: boolean }[] = [];
  const seen = new Set<string>();
  for (const [, attributes, slug, alt] of html.matchAll(TILE)) {
    const shown = text(alt);
    const name = STORED_AS[shown.toLowerCase()] ?? shown;
    if (!name || STEALTH.test(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    tiles.push({
      name,
      page: `${PAGE_URL}/${slug}`,
      exited: attributes.match(STATUS)?.[1] === "exited",
    });
  }
  if (tiles.length === 0) {
    throw new Error("onetarget: no companies found in the portfolio");
  }

  // the portfolio runs across as many lists as it takes; a last list that has
  // filled up is one with companies behind it
  const lists = html
    .split('<div role="list"')
    .map((list) => list.split('class="portfolio_item is-companies w-dyn-item"').length - 1)
    .filter((count) => count > 0);
  if ((lists[lists.length - 1] ?? 0) >= LIST_LIMIT) {
    throw new Error(
      `onetarget: the last of the portfolio's lists is full at ${LIST_LIMIT} — a company is hidden behind it`,
    );
  }

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
    const batch = tiles.slice(i, i + BATCH_SIZE);
    const details = await Promise.all(batch.map((tile) => detailsOf(tile.page)));
    batch.forEach((tile, j) => {
      const { facts, site } = details[j];
      const since = facts.get("since")?.match(/\b(?:19|20)\d{2}\b/)?.[0];
      companies.push({
        name: tile.name,
        category: [
          facts.get("industry"),
          facts.get("city"),
          facts.get("stage"),
          since ? `Invested ${since}` : "",
          tile.exited ? "Exited" : "",
        ]
          .filter(Boolean)
          .join(", "),
        url: site || tile.page,
      });
    });
  }

  if (!companies.some((company) => company.category)) {
    throw new Error("onetarget: the companies' facts moved");
  }
  if (!companies.some((company) => !company.url.startsWith(BASE_URL))) {
    throw new Error("onetarget: the companies' website links moved");
  }

  return companies;
}
