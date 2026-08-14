import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.gruendungsfonds.at";
const PAGE_URL = `${BASE_URL}/portfolio`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// the value the page's own filter files an exited company under
const EXITED = "5";

const NAMED: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
};

const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, named) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return NAMED[String(named)] ?? NAMED[String(named).toLowerCase()] ?? whole;
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
  status: string;
  url: string;
}

// each company is a logo that opens a panel with what it does and a link out
function itemsOf(html: string): Company[] {
  const items: Company[] = [];
  for (const raw of html.split('<div class="col text-center winner-item').slice(1)) {
    const name = text(raw.match(/data-title="([^"]*)"/)?.[1] ?? "");
    if (!name) continue;
    items.push({
      name,
      status: raw.match(/^[^>]*data-filter="([^"]*)"/)?.[1] ?? "",
      url: raw.match(/<a href="(https?:\/\/[^"]+)"[^>]*>\s*Zur Homepage/)?.[1] ?? "",
    });
  }
  return items;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);
  const items = itemsOf(html);
  if (items.length === 0) {
    throw new Error("aws: no companies found in the portfolio");
  }

  // the page holds every company at once and hides the ones filtered out, but
  // it asks the server which belong to each of its two funds — and the funds
  // are named in the same list that offers them
  const funds = [
    ...(html.match(/<select[^>]*id="filterFonds"[\s\S]*?<\/select>/)?.[0] ?? "").matchAll(
      /<option value="([1-9]\d*)">([\s\S]*?)<\/option>/g,
    ),
  ].map((m) => ({ value: m[1], name: text(m[2]) }));
  if (funds.length === 0) {
    throw new Error("aws: the portfolio no longer says which funds it is made of");
  }

  const fundOf = new Map<string, string>();
  for (const fund of funds) {
    const page = await fetchPage(
      `${PAGE_URL}?tx_onportfolio_listportfolio%5Bfonds%5D=${fund.value}`,
    );
    for (const item of itemsOf(page)) {
      if (!fundOf.has(item.name)) fundOf.set(item.name, fund.name);
    }
  }
  for (const item of items) {
    if (!fundOf.has(item.name)) {
      throw new Error(`aws: ${item.name} is listed but belongs to none of the funds`);
    }
  }

  // the page introduces itself with what each fund holds; the numbers are
  // written by hand and have drifted from the list, so they are only good for
  // noticing that the list has collapsed
  const claimed = [...html.matchAll(/(\d+)\s+(?:aktive Beteiligungen|Exits)/g)].reduce(
    (total, m) => total + Number(m[1]),
    0,
  );
  if (claimed > 0 && items.length < claimed * 0.75) {
    throw new Error(`aws: listed ${items.length} companies of the ${claimed} it says it holds`);
  }

  return items.map((item) => ({
    name: item.name,
    // "Aktiv" is a company the fund still holds
    category: [fundOf.get(item.name) ?? "", item.status === EXITED ? "Exit" : "", item.status === EXITED ? "Exited" : ""]
      .filter(Boolean)
      .join(", "),
    url: item.url,
  }));
}
