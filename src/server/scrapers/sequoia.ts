import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const BASE_API = "https://sequoiacap.com/wp-json/wp/v2";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface CompanyPost {
  slug: string;
  title: { rendered: string };
  categories: number[];
}

// Fetch external URLs from individual company pages (in batches of 20)
async function fetchCompanyUrl(slug: string): Promise<string> {
  try {
    const resp = await fetch(
      `https://sequoiacap.com/companies/${slug}/`,
      { headers: { "User-Agent": UA } },
    );
    const html = await resp.text();
    const $ = cheerio.load(html);

    let url = "";
    $("a[href]").each((_, el) => {
      if (url) return;
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().toLowerCase();
      // Website links show the domain as text (e.g. "stripe.com")
      if (
        href.startsWith("http") &&
        text.includes(".") &&
        text.length < 40 &&
        href.indexOf("sequoiacap") === -1
      ) {
        url = href;
      }
    });
    return url;
  } catch {
    return "";
  }
}

const BATCH_SIZE = 20;

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch category terms to build an id->name map
  const categoryMap = new Map<number, string>();
  const catResp = await fetch(`${BASE_API}/categories?per_page=100`, {
    headers: { "User-Agent": UA },
  });
  if (catResp.ok) {
    for (const c of await catResp.json()) {
      if (c.name !== "Uncategorized") {
        const name = c.name
          .replace(/&amp;/g, "&")
          .replace(/&#039;/g, "'");
        categoryMap.set(c.id, name);
      }
    }
  }

  // Fetch all companies via WP REST API (paginated, 100 per page)
  const posts: CompanyPost[] = [];
  let page = 1;

  while (true) {
    const resp = await fetch(
      `${BASE_API}/company?per_page=100&page=${page}&_fields=slug,title,categories`,
      { headers: { "User-Agent": UA } },
    );
    if (resp.status === 400) break;

    const data: CompanyPost[] = await resp.json();
    if (data.length === 0) break;
    posts.push(...data);
    page++;
  }

  const urlMap = new Map<string, string>();

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (p) => ({
        slug: p.slug,
        url: await fetchCompanyUrl(p.slug),
      })),
    );
    for (const r of results) {
      urlMap.set(r.slug, r.url);
    }
  }

  // Build final company list
  const companies: ScrapedCompany[] = posts.map((p) => ({
    name: p.title.rendered,
    category: p.categories
      .map((id) => categoryMap.get(id))
      .filter(Boolean)
      .join(", "),
    url: urlMap.get(p.slug) || "",
  }));

  return companies;
}
