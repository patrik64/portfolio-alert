import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.canapi.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 12;
// webflow renders at most 100 items of a collection in one go
const PAGE_LIMIT = 100;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8203;|&#x200b;|\u200b/gi, "")
    .replace(/&nbsp;| /g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// the company's own page holds the website and the facts canapi shows about it
async function detailOf(slug: string) {
  const html = await fetchPage(`${BASE_URL}/investment/${slug}`);

  const facts = new Map<string, string>();
  for (const card of html.matchAll(
    /<div class="c--investments__modal__highlight-card([^"]*)">([\s\S]*?)<\/div><\/div>/g,
  )) {
    // canapi keeps a company's headcount in the page but hides the card
    if (card[1].includes("display-none")) continue;
    const label = text(card[2].match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    const value = text(card[2].match(/<div class="t-24[^"]*">([\s\S]*?)$/)?.[1] ?? "");
    if (label && value && !facts.has(label)) facts.set(label, value);
  }

  return {
    // the website sits among the company's social links, told apart by its
    // icon; a company without one is published as a hidden "#" link. one
    // address was typed with its scheme twice, which points nowhere as it
    // stands
    url: (html.match(/<a href="(https?:\/\/[^"]+)"[^>]*>\s*<img[^>]*alt="website"/)?.[1] ?? "").replace(
      /^(https?:\/\/)https?(?::)?\/\//,
      "$1",
    ),
    location: facts.get("HQ Location") ?? "",
    founded: facts.get("Year Founded") ?? "",
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  // the page opens with a featured company that is also in the grid below, so
  // only the grid is read
  const grid = html.slice(html.indexOf('c--investments__list w-dyn-items'));
  const cards = new Map<string, { name: string; status: string; stages: string[] }>();
  for (const raw of grid.split('investments-portfolio="link" href="/investment/').slice(1)) {
    const slug = raw.slice(0, raw.indexOf('"'));
    const item = raw.split('investments-portfolio="link" href="/investment/')[0];
    const name = text(item.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    if (!slug || !name || cards.has(slug)) continue;
    cards.set(slug, {
      name,
      // an empty chip is a company canapi still holds
      status: text(item.match(/fs-cmsfilter-field="status"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ""),
      stages: [...item.matchAll(/fs-cmsfilter-field="stage"[^>]*>([\s\S]*?)<\/div>/g)]
        .map((m) => text(m[1]))
        .filter(Boolean),
    });
  }

  if (cards.size === 0) {
    throw new Error("canapi: no companies found in the portfolio grid");
  }
  if (cards.size >= PAGE_LIMIT) {
    throw new Error(`canapi: the grid stopped at ${cards.size} companies — the list is paginated now`);
  }

  const slugs = [...cards.keys()];
  const details: Awaited<ReturnType<typeof detailOf>>[] = [];
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    details.push(...(await Promise.all(slugs.slice(i, i + BATCH_SIZE).map(detailOf))));
  }

  const companies = slugs.map((slug, i) => {
    const card = cards.get(slug)!;
    const detail = details[i];
    return {
      name: card.name,
      category: [
        ...card.stages,
        detail.location,
        detail.founded,
        card.status,
        card.status ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: detail.url,
    };
  });

  if (!companies.some((company) => company.category)) {
    throw new Error("canapi: the portfolio cards' stages and facts moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("canapi: the company pages' website links moved");
  }

  return companies;
}
