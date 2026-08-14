import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.targetglobal.vc";
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 8;
// webflow renders at most this many items of a collection at once, which is
// why the portfolio is laid out as more than one list
const LIST_LIMIT = 100;
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

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

interface Company {
  name: string;
  slug: string;
  region: string;
  stage: string;
  sectors: string[];
  exited: boolean;
  url: string;
}

// the tags a company can be filtered by are kept in a hidden block above its
// logo, and the panel that opens on a click holds its name and address
function parse(html: string): Company[] {
  const companies: Company[] = [];
  for (const item of html.split('role="listitem" class="target-cms-item w-dyn-item"').slice(1)) {
    const name = text(item.match(/<h1 class="small-heading">([\s\S]*?)<\/h1>/)?.[1] ?? "");
    if (!name) continue;

    const tags = item.slice(0, item.indexOf('<div class="logo-box">'));
    const fields = [...tags.matchAll(/<div(?:\s+class="[^"]*")?>([^<]*)<\/div>/g)].map((m) => text(m[1]));

    companies.push({
      name,
      slug: item.match(/href="\/portfolio\/([a-z0-9-]+)"/)?.[1] ?? "",
      region: fields[0] ?? "",
      stage: fields[1] ?? "",
      sectors: [...tags.matchAll(/role="listitem" class="w-dyn-item"><div>([^<]*)<\/div>/g)]
        .map((m) => text(m[1]))
        .filter(Boolean),
      // webflow marks the tag empty for a company target global still holds
      exited: /<div class="exit-tag(?![^"]*w-dyn-bind-empty)[^"]*">/.test(item),
      url: item.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="blue-button w-button"/)?.[1] ?? "",
    });
  }
  return companies;
}

// the companies past the first list are listed without their sectors, and only
// their own page still carries them
async function sectorsOf(slug: string) {
  const html = await fetchPage(`${PAGE_URL}/${slug}`);
  // the tags sit between the list they belong to and the company's name; the
  // exit tag is written the same way and is told apart by what it says
  const list =
    html.match(
      /<div role="list" class="portfolio-tags-wrp w-dyn-items">([\s\S]*?)<h1 class="portfolio-item-heading">/,
    )?.[1] ?? "";
  return [...list.matchAll(/<div class="tag">([^<]*)<\/div>/g)]
    .map((m) => text(m[1]))
    .filter((tag) => tag && !/^exited$/i.test(tag));
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  const companies = parse(html);
  if (companies.length === 0) {
    throw new Error("target global: no companies found in the portfolio");
  }

  // the portfolio runs alphabetically across as many lists as it takes; a last
  // list that has filled up is one with companies behind it
  const lists = html
    .split('<div role="list"')
    .map((list) => list.split('role="listitem" class="target-cms-item w-dyn-item"').length - 1)
    .filter((count) => count > 0);
  if ((lists[lists.length - 1] ?? 0) >= LIST_LIMIT) {
    throw new Error(
      `target global: the last of the portfolio's lists is full at ${LIST_LIMIT} — a company is hidden behind it`,
    );
  }

  const missing = companies.filter((company) => company.sectors.length === 0 && company.slug);
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const found = await Promise.all(batch.map((company) => sectorsOf(company.slug)));
    batch.forEach((company, j) => (company.sectors = found[j]));
  }

  const scraped = companies.map((company) => ({
    name: company.name,
    category: [...company.sectors, company.region, company.stage, company.exited ? "Exited" : ""]
      .filter(Boolean)
      .join(", "),
    url: company.url,
  }));

  if (!scraped.some((company) => company.category)) {
    throw new Error("target global: the portfolio's tags moved");
  }
  if (!scraped.some((company) => company.url)) {
    throw new Error("target global: the companies' website links moved");
  }

  return scraped;
}
