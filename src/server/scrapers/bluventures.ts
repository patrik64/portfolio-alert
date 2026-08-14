import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.bluventureinvestors.com";
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const BATCH_SIZE = 4;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// links every company page carries because the site does, and the founder's
// profile, which is a person rather than the company
const SITE_LINKS = [/dynamosoftware\.com/i, /typeform\.com/i, /linkedin\.com/i, /facebook\.com/i, /twitter\.com/i, /x\.com/i];

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// the pages are heavy and the site closes the connection when they are asked
// for too quickly, so a page that drops is asked for again
async function fetchPage(url: string, attempt = 1): Promise<string> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) {
      throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    }
    return await resp.text();
  } catch (err) {
    if (attempt >= 4) throw err;
    await sleep(500 * attempt);
    return fetchPage(url, attempt + 1);
  }
}

const locations = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]).trim());

// the words a page writes above its facts rather than a fact itself
const LABELS = new Set(["Founded:", "First Investment:", "CEO", "Deal Team"]);

// one address was saved as it was clicked on in an advert, tracking and all
const website = (raw: string) => {
  const url = decode(raw);
  const [address, query] = url.split("?");
  if (!query) return url;
  const kept = query
    .split("&")
    .filter((param) => !/^(gclid|gbraid|wbraid|fbclid|msclkid|gad_[a-z_]*|utm_[a-z]*)=/i.test(param));
  return kept.length > 0 ? `${address}?${kept.join("&")}` : address;
};

// a company's page writes its facts as a run of text blocks: where it is, its
// name, then each fact under the words naming it
function detailOf(html: string) {
  // a company that has no year or no town still keeps its place in the run, so
  // the blanks are held on to and the facts stay under the words naming them
  const blocks = [...html.matchAll(/<div id="comp-[a-z0-9]+"[^>]*class="[^"]*wixui-rich-text[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => text(m[1]));

  const after = (label: string) => {
    const i = blocks.indexOf(label);
    const value = i >= 0 ? (blocks[i + 1] ?? "") : "";
    return LABELS.has(value) ? "" : value;
  };

  const founded = blocks.indexOf("Founded:");
  return {
    // the name sits between where the company is and the first of its facts
    name: founded > 0 ? (blocks[founded - 1] ?? "") : "",
    location: founded > 1 ? (blocks[founded - 2] ?? "") : "",
    founded: after("Founded:"),
    invested: after("First Investment:"),
    url: website(
      [...html.matchAll(/<a data-testid="linkElement" href="(https?:\/\/[^"]+)"/g)]
        .map((m) => m[1])
        .find((link) => !link.includes("bluventureinvestors.com") && !SITE_LINKS.some((site) => site.test(link))) ??
        "",
    ),
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const index = await fetchPage(SITEMAP_URL);

  // the portfolio page shows logos without naming them; the companies are named
  // on the pages the site builds for them, one per company. the "copy-of"
  // route is the same companies over again
  const sitemaps = locations(index).filter(
    (url) => /\/dynamic-/.test(url) && !/dynamic-copy-of-/.test(url),
  );
  if (sitemaps.length === 0) {
    throw new Error("blu ventures: the sitemap no longer lists the company pages");
  }

  const pages = new Set<string>();
  for (const sitemap of sitemaps) {
    for (const url of locations(await fetchPage(sitemap))) pages.add(url);
  }
  if (pages.size === 0) {
    throw new Error("blu ventures: no company pages found");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  const list = [...pages];
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(250);
    const batch = await Promise.all(list.slice(i, i + BATCH_SIZE).map((url) => fetchPage(url)));
    for (const html of batch) {
      const detail = detailOf(html);
      if (!detail.name || seen.has(detail.name)) continue;
      seen.add(detail.name);
      companies.push({
        name: detail.name,
        category: [
          detail.location,
          detail.founded ? `Founded ${detail.founded}` : "",
          detail.invested ? `Invested ${detail.invested}` : "",
        ]
          .filter(Boolean)
          .join(", "),
        url: detail.url,
      });
    }
  }

  if (companies.length === 0) {
    throw new Error("blu ventures: no company page named a company — the pages moved");
  }
  if (companies.length < pages.size * 0.9) {
    throw new Error(`blu ventures: read ${companies.length} of the ${pages.size} company pages`);
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("blu ventures: the company pages' facts moved");
  }

  return companies;
}
