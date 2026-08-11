import type { ScrapedCompany } from './types';

const BASE_URL = "https://octopusventures.com";
const PAGE_URL = `${BASE_URL}/portfolio/`;
const API_URL = `${BASE_URL}/wp-json/deepsea/v1/archive-search-filters?post_type=portfolio&per_page=250`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Card {
  name: string;
  url: string;
}

function parseCards(html: string): Card[] {
  return [...html.matchAll(/<article[^>]*aria-label="([^"]+)"[^>]*>\s*<a\s+href="([^"]+)"/g)].map(
    (m) => ({ name: m[1].replace(/&amp;/g, "&").trim(), url: m[2] }),
  );
}

// the portfolio archive is served by the theme's REST route; filters use the
// same route with &sectors= / &portfolio-status= query params
async function fetchCards(params: string): Promise<Card[]> {
  const cards: Card[] = [];
  let page = 1;
  let maxPages = 1;
  while (page <= maxPages) {
    const resp = await fetch(`${API_URL}&page=${page}${params}`, {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) {
      throw new Error(`Failed to fetch octopus archive page ${page}: ${resp.status}`);
    }
    const data: { html: string; max_num_pages: number } = await resp.json();
    cards.push(...parseCards(data.html));
    maxPages = data.max_num_pages || 1;
    page++;
  }
  return cards;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  // sector and status filter options (slug -> label) come from the archive page
  const pageResp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!pageResp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${pageResp.status}`);
  }
  const pageHtml = await pageResp.text();
  const sectorOptions = [
    ...pageHtml.matchAll(/name="([^"]+)"[^>]*>\s*<span>([^<]+)<\/span>/g),
  ].map((m) => [m[1], m[2].trim()] as const);
  const sectors = sectorOptions.filter(([slug]) => slug !== "current" && slug !== "exited");

  const byName = new Map<string, { url: string; labels: string[] }>();
  for (const card of await fetchCards("")) {
    if (!byName.has(card.name)) byName.set(card.name, { url: card.url, labels: [] });
  }

  for (const [slug, label] of sectors) {
    for (const card of await fetchCards(`&sectors=${slug}`)) {
      const entry = byName.get(card.name);
      if (entry && !entry.labels.includes(label)) entry.labels.push(label);
    }
  }

  // "Current" is the default state; only "Exited" is worth recording
  for (const card of await fetchCards(`&portfolio-status=exited`)) {
    const entry = byName.get(card.name);
    if (entry && !entry.labels.includes("Exited")) entry.labels.push("Exited");
  }

  const companies: ScrapedCompany[] = [...byName].map(([name, entry]) => ({
    name,
    category: entry.labels.join(", "),
    url: entry.url,
  }));

  return companies;
}
