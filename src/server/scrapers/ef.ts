import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.joinef.com";
const PAGE_URL = `${BASE_URL}/portfolio/`;
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
// the site asks crawlers to take it slowly, so the pages are walked a few at a
// time rather than all at once
const BATCH_SIZE = 3;
const MAX_PAGES = 60;
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

interface PageVariables {
  posts: string;
  featured_posts: string;
  max_page: number | string;
}

interface FilterSettings {
  post_type: string;
  search: string;
  filters: Record<string, string>[];
}

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

async function ajax(params: [string, string][]) {
  const resp = await fetch(AJAX_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: new URLSearchParams(params),
  });
  if (!resp.ok) {
    throw new Error(`Failed to ask joinef for more companies: ${resp.status}`);
  }
  return resp.text();
}

interface Tile {
  name: string;
  locations: string[];
  industries: string[];
  founded: string;
}

// a tile names the company, where it is, what it works on and when it started
function tilesOf(html: string): Tile[] {
  const tiles: Tile[] = [];
  for (const raw of html.split('<div class="tile tile--company').slice(1)) {
    const name = text(raw.match(/data-companyname="([^"]*)"/)?.[1] ?? "");
    if (!name) continue;
    tiles.push({
      name,
      locations: [...raw.matchAll(/class='locationtag'[^>]*>([^<]*)<\/a>/g)].map((m) => text(m[1])),
      industries: [...raw.matchAll(/class='categorytag'[^>]*>([^<]*)<\/a>/g)].map((m) => text(m[1])),
      // the label and the year are written the same way, so the year is read
      // from under the label
      founded: raw.match(/>Founded<\/div>[\s\S]{0,300}?meta__row__name[^"]*">\s*(\d{4})\s*</)?.[1] ?? "",
    });
  }
  return tiles;
}

// the filters are posted the way the page's own script posts them
function filterParams(query: string, settings: FilterSettings, taxonomy: string, term: string) {
  const params: [string, string][] = [
    ["query", query],
    ["page", "1"],
    ["search_data", ""],
    ["format", "default"],
    ["filter_settings[post_type]", settings.post_type],
    ["filter_settings[search]", settings.search],
    [`filter_data[${taxonomy}][]`, term],
  ];
  settings.filters.forEach((filter, i) => {
    for (const [key, value] of Object.entries(filter)) {
      params.push([`filter_settings[filters][${i}][${key}]`, String(value ?? "")]);
    }
  });
  return params;
}

// every company under one term, however many pages it runs to
async function under(action: string, query: string, settings: FilterSettings, term: string) {
  const first = JSON.parse(
    await ajax([["action", action], ...filterParams(query, settings, "stage", term)]),
  ) as { content?: string; posts?: string; featured_posts?: string; max_page?: number | string };

  const names = new Set(tilesOf(first.content ?? "").map((tile) => tile.name));
  const filtered = first.posts ?? first.featured_posts ?? "";
  const pages = Number(first.max_page ?? 1);
  for (let page = 1; page < pages && page < MAX_PAGES; page += BATCH_SIZE) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(BATCH_SIZE, pages - page) }, (_, i) =>
        ajax([
          ["action", "loadmore"],
          ["query", filtered],
          ["page", String(page + i)],
          ["format", "default"],
        ]),
      ),
    );
    for (const html of batch) for (const tile of tilesOf(html)) names.add(tile.name);
  }
  return names;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  const variables = JSON.parse(
    html.match(/php_variables\s*=\s*(\{[\s\S]*?\});/)?.[1] ?? "null",
  ) as PageVariables | null;
  const settings = JSON.parse(
    html.match(/filter_settings\s*=\s*(\{[\s\S]*?\});/)?.[1] ?? "null",
  ) as FilterSettings | null;
  if (!variables?.posts || !settings?.filters) {
    throw new Error("ef: the portfolio page no longer says how to ask for the rest of it");
  }

  // the page arrives with the companies it highlights and the first page of the
  // rest; the remaining pages are asked for the way the page asks for them
  const byName = new Map<string, Tile>();
  for (const tile of tilesOf(html)) byName.set(tile.name, tile);
  if (byName.size === 0) {
    throw new Error("ef: no companies found in the portfolio");
  }

  const pages = Number(variables.max_page ?? 1);
  if (!(pages >= 1)) {
    throw new Error("ef: the portfolio did not say how many pages it has");
  }
  for (let page = 1; page < pages && page < MAX_PAGES; page += BATCH_SIZE) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(BATCH_SIZE, pages - page) }, (_, i) =>
        ajax([
          ["action", "loadmore"],
          ["query", variables.posts],
          ["page", String(page + i)],
          ["format", "default"],
        ]),
      ),
    );
    let found = 0;
    for (const more of batch) {
      const tiles = tilesOf(more);
      found += tiles.length;
      for (const tile of tiles) if (!byName.has(tile.name)) byName.set(tile.name, tile);
    }
    if (found === 0) {
      throw new Error(`ef: the portfolio stopped answering after ${byName.size} companies`);
    }
  }

  // ef keeps a company's stage out of its tile and only lets the portfolio be
  // filtered by it, so the one stage that changes what a company is — that ef
  // is out of it — is asked for on its own. the companies ef highlights are
  // held in a separate list that filters separately
  const exited = new Set([
    ...(await under("filter", variables.posts, settings, "exit")),
    ...(await under("filter_featured", variables.featured_posts, settings, "exit")),
  ]);

  const companies = [...byName.values()].map((tile) => ({
    name: tile.name,
    category: [...tile.industries, ...tile.locations, tile.founded, exited.has(tile.name) ? "Exited" : ""]
      .filter(Boolean)
      .join(", "),
    // ef introduces its founders rather than linking to their companies
    url: "",
  }));

  if (!companies.some((company) => company.category)) {
    throw new Error("ef: the portfolio tiles' tags moved");
  }
  if (exited.size === 0) {
    throw new Error("ef: no company came back as an exit — the stage filter moved");
  }

  return companies;
}
