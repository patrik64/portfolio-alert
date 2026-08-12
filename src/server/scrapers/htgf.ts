import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.htgf.de";
const PAGE_URL = `${BASE_URL}/en/portfolio/`;
const LIST_URL = `${BASE_URL}/wp-json/htgf/v1/mq_portfolio`;
const BATCH_SIZE = 10;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// the filter row offers Active, Exit and IPO; the company pages show a fourth
const EXTRA_STATUSES: Record<string, string> = { semiexit: "Semi-Exit" };

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8203;|&#x200b;|\u200b/gi, "")
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

// the company page is the only place the company's own website appears
async function websiteOf(link: string) {
  const html = await fetchPage(link);
  const about = html.slice(html.indexOf('id="company-info"'));
  // a few of the links were typed with a space left on the end
  return (
    about
      .match(/<a href="(https?:\/\/[^"]+)" target="_blank" class="wp-block-button__link/)?.[1]
      ?.trim() ?? ""
  );
}

export async function scrape(): Promise<ScrapedCompany[]> {
  // the grid is empty until the page asks for it; this is the request it makes,
  // with the page size raised to take the portfolio in one go
  const resp = await fetch(LIST_URL, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json" },
    body: JSON.stringify({
      posts_per_page: 2000,
      offset: 0,
      lang: "en",
      searchterm: "",
      orderby: "date",
      order: "DESC",
      meta_key: "",
    }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${LIST_URL}: ${resp.status}`);
  }
  const listing: { html?: string; count?: number } = await resp.json();
  const grid = listing.html ?? "";
  if (!grid) {
    throw new Error("htgf: the portfolio request returned no companies");
  }

  // sectors, german states and statuses all reach the cards as ids, and the
  // filter buttons are where each one is spelled out
  const labels = new Map<string, string>();
  for (const button of (await fetchPage(PAGE_URL)).matchAll(
    /<button([^>]*)>([\s\S]{0,200}?)<\/button>/g,
  )) {
    const id = button[1].match(/data-id="([^"]*)"/)?.[1];
    const label = text(button[2]);
    if (id && label && !labels.has(id)) labels.set(id, label);
  }
  if (labels.size === 0) {
    throw new Error("htgf: portfolio filters not found — the page layout moved");
  }

  interface Card {
    name: string;
    sectors: string[];
    state: string;
    year: string;
    statuses: string[];
    link: string;
  }
  const cards: Card[] = [];
  const seen = new Set<string>();

  for (const card of grid.split('<div class="htgf-card htgf-portfolio-card ').slice(1)) {
    const name = text(card.match(/htgf-portfolio-card__title">\s*<h3>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // a company sits in one or more categories, each of which arrives as its
    // own id alongside the ids of the areas above it
    const sectors: string[] = [];
    for (const id of (card.match(/data-sector="([^"]*)"/)?.[1] ?? "").split(",")) {
      const label = labels.get(id);
      if (label && !sectors.includes(label)) sectors.push(label);
    }

    cards.push({
      name,
      sectors,
      state: labels.get(card.match(/data-location="([^"]*)"/)?.[1] ?? "") ?? "",
      year: card.match(/htgf-portfolio-card__date">\s*(\d{4})/)?.[1] ?? "",
      statuses: (card.match(/data-status="([^"]*)"/)?.[1] ?? "").split(",").filter(Boolean),
      link: card.match(/href="(https:\/\/www\.htgf\.de\/en\/portfolio\/[^"]+)"/)?.[1] ?? "",
    });
  }

  if (cards.length === 0) {
    throw new Error("htgf: no companies found in the portfolio grid");
  }
  // the endpoint says how many companies the query matched
  if (listing.count && cards.length < listing.count) {
    throw new Error(`htgf: read ${cards.length} of the ${listing.count} companies listed`);
  }

  const websites = new Map<string, string>();
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      cards
        .slice(i, i + BATCH_SIZE)
        .map(async (card) => [card.name, card.link ? await websiteOf(card.link) : ""] as const),
    );
    for (const [name, website] of batch) websites.set(name, website);
  }

  return cards.map((card) => {
    // "active" is the default; the rest name how htgf came out of the company,
    // and a semi-exit is one it still holds a piece of
    const statuses = card.statuses.filter((status) => status !== "active");
    return {
      name: card.name,
      category: [
        ...card.sectors,
        card.state,
        card.year,
        ...statuses.map((status) => EXTRA_STATUSES[status] ?? labels.get(status) ?? status),
        statuses.some((status) => status === "exit" || status === "ipo") ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: websites.get(card.name) ?? "",
    };
  });
}
