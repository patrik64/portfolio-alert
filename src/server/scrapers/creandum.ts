import type { ScrapedCompany } from './types';

const BASE_URL = "https://creandum.com";
const PAGE_URL = `${BASE_URL}/commitments/`;
const BATCH_SIZE = 8;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

async function detailOf(slug: string) {
  const html = await fetchPage(`${PAGE_URL}${slug}/`);
  // the page's own meta tags say "Creandum" for all but a handful of companies,
  // so the company section's logo is what names it
  const section = html.slice(html.indexOf('class="single-portfolios"'));
  const name = text(
    [...section.matchAll(/alt="([^"]*)"/g)].map((m) => m[1]).find((alt) => alt.trim()) ?? "",
  );

  const info = new Map<string, string>();
  for (const item of section.matchAll(
    /<span class="p2-hoves grey"[^>]*>([^<]*)<\/span>\s*<span class="p2-hoves white"[^>]*>([\s\S]*?)<\/span>/g,
  )) {
    info.set(text(item[1]), text(item[2]));
  }

  return {
    name,
    // the year creandum came in, which the page keeps apart from the year the
    // company was founded
    backed: info.get("Creandum Backed") ?? "",
    url:
      section.match(
        /<a href="(https?:\/\/[^"]+)" target="_blank"[^>]*>\s*<span class="nav-hoves white"[^>]*>Website<\/span>/,
      )?.[1] ?? "",
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  // the grid carries no links, so a company is its logo's alt text; the green
  // cards above it are spotlights repeating companies from the grid itself
  const cards = new Map<string, { name: string; exited: boolean }>();
  for (const card of html.matchAll(/class="portfolio-card ([^"]*)"([\s\S]*?)(?=class="portfolio-card |$)/g)) {
    const classes = card[1].split(/\s+/);
    if (!classes.includes("all")) continue;
    const name = text(card[2].match(/<img src="[^"]*" alt="([^"]*)"/)?.[1] ?? "");
    if (!name) continue;
    cards.set(nameKey(name), { name, exited: classes.includes("exited") });
  }
  if (cards.size === 0) {
    throw new Error("creandum: no companies found in the portfolio grid");
  }

  // nuxt lists every page it generated, which is how the companies that have
  // one are found — the grid never names them
  const build = html.match(/\/_nuxt\/static\/([^/"]+)\//)?.[1];
  if (!build) {
    throw new Error("creandum: the site's build id is missing — the page layout moved");
  }
  const manifest = (await fetchPage(`${BASE_URL}/_nuxt/static/${build}/manifest.js`)).replace(
    /\\u002F/g,
    "/",
  );
  const slugs = [...manifest.matchAll(/"\/commitments\/([^"/]+)"/g)].map((m) => m[1]);
  if (slugs.length === 0) {
    throw new Error("creandum: no company pages listed in the site manifest");
  }

  const details = new Map<string, Awaited<ReturnType<typeof detailOf>>>();
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = await Promise.all(slugs.slice(i, i + BATCH_SIZE).map(detailOf));
    for (const detail of batch) {
      // the grid is the portfolio; a page that names a company missing from it
      // means the two have drifted apart
      if (!cards.has(nameKey(detail.name))) {
        throw new Error(`creandum: "${detail.name}" has a page but is not in the portfolio grid`);
      }
      details.set(nameKey(detail.name), detail);
    }
  }

  return [...cards].map(([key, card]) => {
    const detail = details.get(key);
    return {
      name: card.name,
      category: [detail?.backed ?? "", card.exited ? "Exited" : ""].filter(Boolean).join(", "),
      url: detail?.url ?? "",
    };
  });
}
