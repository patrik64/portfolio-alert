import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.generalatlantic.com";
const PAGE_URL = `${BASE_URL}/investments/`;
const MAX_PAGES = 60;
// the year an investment general atlantic still holds is filed under
const NO_EXIT = "1970";
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

// the investments are a table: the company, what it does, its sector, where it
// is, the year general atlantic came in and the year it left
function parsePage(html: string, companies: Map<string, ScrapedCompany>) {
  let found = 0;
  for (const raw of html.split('<div class="investments-item">').slice(1)) {
    const item = raw.split('<div class="investments-item')[0];
    const column = (name: string) =>
      text(item.match(new RegExp(`investments-item__${name}">([^<]*)</p>`))?.[1] ?? "");

    // a company is named by its logo, or written out when it has none
    const name =
      text(item.match(/investments-item__company"><img[^>]*\salt="([^"]*)"/)?.[1] ?? "") ||
      text(item.match(/<h3 class="investments-item__company">([\s\S]*?)<\/h3>/)?.[1] ?? "");
    if (!name) continue;
    found++;
    if (companies.has(name)) continue;

    const exited = column("exit");
    companies.set(name, {
      name,
      category: [
        column("practice"),
        column("region"),
        column("years"),
        exited && exited !== NO_EXIT ? `Exited ${exited}` : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: item.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="view-site"/)?.[1] ?? "",
    });
  }
  return found;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const companies = new Map<string, ScrapedCompany>();
  let ended = false;

  // the table hands out a page at a time and stops offering the next one when
  // there are no more
  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchPage(page === 1 ? PAGE_URL : `${PAGE_URL}?pg=${page}`);
    const found = parsePage(html, companies);
    if (found === 0 || !/data-page="\d+"/.test(html)) {
      ended = true;
      break;
    }
  }
  if (!ended) {
    throw new Error(`general atlantic: the investments still went on after ${MAX_PAGES} pages`);
  }

  if (companies.size === 0) {
    throw new Error("general atlantic: no companies found in the investments table");
  }
  const scraped = [...companies.values()];
  if (!scraped.some((company) => company.category)) {
    throw new Error("general atlantic: the investments table's columns moved");
  }
  if (!scraped.some((company) => company.url)) {
    throw new Error("general atlantic: the companies' site links moved");
  }

  return scraped;
}
