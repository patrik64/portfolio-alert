import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const BASE_API = "https://www.insightpartners.com/wp-json";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface CompanyPost {
  id: number;
  slug: string;
  title: { rendered: string };
}

// Phase 2: Fetch company details (sector + URL) from custom API in batches
async function fetchCompanyDetail(
  id: number,
): Promise<{ category: string; url: string }> {
  try {
    const resp = await fetch(
      `${BASE_API}/insight/v1/get-company-content?id=${id}`,
      { headers: { "User-Agent": UA } },
    );
    const raw = await resp.text();
    // Response is double-JSON-encoded
    const parsed = JSON.parse(JSON.parse(raw));
    const html = parsed.content || "";
    const $ = cheerio.load(html);

    // Extract sectors from vertical links
    const sectors: string[] = [];
    $('a[href*="vertical="]').each((_, el) => {
      const text = $(el).text().trim();
      if (text && !sectors.includes(text)) sectors.push(text);
    });

    // Extract website URL from "Learn More About" link
    const url =
      $('a[title^="Learn More About"]').first().attr("href") || "";

    return { category: sectors.join(", "), url };
  } catch {
    return { category: "", url: "" };
  }
}

const BATCH_SIZE = 20;

export async function scrape(): Promise<ScrapedCompany[]> {
  // Phase 1: Fetch all companies via WP REST API (paginated, 100 per page)
  const posts: CompanyPost[] = [];
  let page = 1;

  while (true) {
    const resp = await fetch(
      `${BASE_API}/wp/v2/sfcompany?per_page=100&page=${page}&_fields=id,title,slug`,
      { headers: { "User-Agent": UA } },
    );
    if (resp.status === 400) break;

    const data: CompanyPost[] = await resp.json();
    if (data.length === 0) break;
    posts.push(...data);
    page++;
  }

  const detailMap = new Map<number, { category: string; url: string }>();

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (p) => ({
        id: p.id,
        detail: await fetchCompanyDetail(p.id),
      })),
    );
    for (const r of results) {
      detailMap.set(r.id, r.detail);
    }
  }

  // Build final company list
  const companies: ScrapedCompany[] = posts.map((p) => ({
    name: p.title.rendered,
    category: detailMap.get(p.id)?.category || "",
    url: detailMap.get(p.id)?.url || "",
  }));

  return companies;
}
