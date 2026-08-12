import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.quantonation.com";
const API_URL = `${BASE_URL}/wp-json/wp/v2`;
const PAGE_URL = `${BASE_URL}/portfolio/`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// the taxonomies behind each company, in the order they read best
const TAXONOMIES = ["p_category", "p_stage", "p_status", "p_country"] as const;

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#x27;|&rsquo;/g, "'")
    .replace(/&#8211;/g, "–")
    .trim();

interface Post {
  id: number;
  title: { rendered: string };
  link?: string;
  p_category?: number[];
  p_stage?: number[];
  p_status?: number[];
  p_country?: number[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return (await resp.json()) as T;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  // companies come from the WP REST API (paginated, 100 per page)
  const posts: Post[] = [];
  let page = 1;
  while (true) {
    const resp = await fetch(`${API_URL}/portfolio?per_page=100&page=${page}`, {
      headers: { "User-Agent": UA },
    });
    if (resp.status === 400) break;
    if (!resp.ok) {
      throw new Error(`Failed to fetch ${API_URL}/portfolio: ${resp.status}`);
    }
    const data: Post[] = await resp.json();
    if (data.length === 0) break;
    posts.push(...data);
    page++;
  }
  if (posts.length === 0) {
    throw new Error("quantonation: the portfolio API returned no companies");
  }

  // resolve every taxonomy term id to its display name
  const termNames = new Map<string, Map<number, string>>();
  for (const taxonomy of TAXONOMIES) {
    const terms = await fetchJson<{ id: number; name: string }[]>(
      `${API_URL}/${taxonomy}?per_page=100`,
    );
    termNames.set(taxonomy, new Map(terms.map((t) => [t.id, decode(t.name)])));
  }

  // websites only appear in the portfolio page's popups, keyed by post id
  const websiteById = new Map<number, string>();
  const pageResp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (pageResp.ok) {
    const html = await pageResp.text();
    for (const popup of html.split('<div class="container-popup" id="').slice(1)) {
      const id = Number(popup.split("-popup")[0]);
      const website = popup.match(
        /<a class="action website[^"]*" href="(https?:\/\/[^"]+)"/,
      )?.[1];
      if (id && website) websiteById.set(id, website);
    }
  }

  const companies: ScrapedCompany[] = posts.map((post) => {
    const labels: string[] = [];
    for (const taxonomy of TAXONOMIES) {
      for (const termId of post[taxonomy] ?? []) {
        const name = termNames.get(taxonomy)?.get(termId);
        // "Active" is the default state and carries no signal
        if (!name || name === "Active" || labels.includes(name)) continue;
        labels.push(name);
      }
    }

    return {
      name: decode(post.title.rendered),
      category: labels.join(", "),
      url: websiteById.get(post.id) || post.link || "",
    };
  });

  return companies;
}
