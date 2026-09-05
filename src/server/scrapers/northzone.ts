import type { ScrapedCompany } from './types';

const BASE_URL = "https://northzone.com";
const PAGE_URL = `${BASE_URL}/portfolio`;
const BATCH_SIZE = 8;
const MAX_PAGES = 50;
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

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

interface Card {
  name: string;
  industries: string[];
  stage: string;
  status: string;
}

function parseList(html: string, cards: Map<string, Card>) {
  let found = 0;
  for (const item of html.split('class="filters5_company-list-item w-dyn-item"').slice(1)) {
    // the row opens on a link to the company's page and carries that same
    // address again further down, so the first one is the row's own. the last
    // row of a page runs on into what follows it, which is why every field
    // here is the first of its kind rather than all of them
    const slug = item.match(/href="\/portfolio\/([^"]+)"/)?.[1] ?? "";
    const name = text(item.match(/fs-cmsfilter-field="name"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "");
    if (!slug || !name) continue;
    found++;
    if (cards.has(slug)) continue;

    const field = (key: string) =>
      text(item.match(new RegExp(`fs-cmsfilter-field="${key}"[^>]*>([\\s\\S]*?)</div>`))?.[1] ?? "");
    // the fund files a company's countries under the same field name as its
    // industries, so the industries are taken from the list that holds them
    // rather than by the name they share
    const industries = item.match(/filters5_industry-list-wrapper[\s\S]*?(?=filters5_status-cell)/)?.[0] ?? "";
    cards.set(slug, {
      name,
      industries: [
        ...industries.matchAll(/fs-cmsfilter-field="industry"[^>]*>([\s\S]*?)<\/div>/g),
      ].map((m) => text(m[1])),
      stage: field("stage"),
      status: field("status"),
    });
  }
  return found;
}

async function detailOf(slug: string) {
  const html = await fetchPage(`${PAGE_URL}/${slug}`);
  const info = new Map<string, string[]>();
  const block = html.match(/class="company20_info-list">([\s\S]*?)(?=<div style=|<\/section>)/)?.[1] ?? "";
  for (const piece of block.split('<div class="company20_info-item">').slice(1)) {
    // the label is set apart from its values by a colour, which is the only
    // thing telling the two kinds of line apart
    const label = piece.match(/class="label-medium text-color-tertiary">([^<]*)<\/div>/)?.[1];
    if (!label) continue;
    info.set(
      text(label),
      [...piece.matchAll(/class="label-medium">([\s\S]*?)<\/div>/g)].map((m) => text(m[1])),
    );
  }
  return {
    locations: info.get("Location") ?? [],
    // the year northzone came in, which the site keeps apart from the year the
    // company was founded
    partnered: (info.get("Partnered") ?? [])[0] ?? "",
    // the only button on a company's page that leads off the site
    url: html.match(/href="(https?:\/\/[^"]+)"[^>]*class="button is-icon[^"]*"/)?.[1] ?? "",
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const cards = new Map<string, Card>();
  let next: string | null = PAGE_URL;

  // webflow hides the page counter here, so the "next" link is followed until
  // the site stops offering one
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const html: string = await fetchPage(next);
    if (parseList(html, cards) === 0) {
      throw new Error(`northzone: ${next} listed no companies`);
    }
    const query = html.match(/href="(\?[a-z0-9]+_page=\d+)"[^>]*class="w-pagination-next"/)?.[1];
    next = query ? `${PAGE_URL}${query}` : null;
  }
  if (next) {
    throw new Error(`northzone: the portfolio still paginated after ${MAX_PAGES} pages`);
  }
  if (cards.size === 0) {
    throw new Error("northzone: no companies found in the portfolio list");
  }

  // one page per company, so the sitemap is the site's own count of them
  const sitemap = await fetchPage(`${BASE_URL}/sitemap.xml`);
  const published = new Set(
    [...sitemap.matchAll(/<loc>[^<]*\/portfolio\/([^<\/]+?)\/?<\/loc>/g)].map((m) => m[1]),
  );
  if (published.size > 0) {
    for (const slug of cards.keys()) {
      if (!published.has(slug)) {
        throw new Error(`northzone: ${slug} is listed but not in the sitemap`);
      }
    }
    for (const slug of published) {
      if (!cards.has(slug)) {
        throw new Error(`northzone: ${slug} is in the sitemap but not listed`);
      }
    }
  }

  const slugs = [...cards.keys()];
  const details = new Map<string, Awaited<ReturnType<typeof detailOf>>>();
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = await Promise.all(
      slugs.slice(i, i + BATCH_SIZE).map(async (slug) => [slug, await detailOf(slug)] as const),
    );
    for (const [slug, detail] of batch) details.set(slug, detail);
  }

  return slugs.map((slug) => {
    const card = cards.get(slug)!;
    const detail = details.get(slug) ?? { locations: [], partnered: "", url: "" };
    // "Active" is the default; the other two both mean northzone is out
    const status = card.status === "Active" ? "" : card.status;
    return {
      name: card.name,
      category: [
        ...card.industries,
        ...detail.locations,
        card.stage,
        detail.partnered,
        status,
        status ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: detail.url,
    };
  });
}
