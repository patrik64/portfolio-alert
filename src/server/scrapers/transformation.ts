import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const BASE_URL = "https://transformcap.com";
const URL = `${BASE_URL}/partner-companies`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 20;

// the site has no sector taxonomy; detail pages carry the company status
// ("Active", ...) and the company website
async function fetchDetail(path: string): Promise<{ status: string; website: string }> {
  try {
    const resp = await fetch(`${BASE_URL}${path}`, { headers: { "User-Agent": UA } });
    if (!resp.ok) return { status: "", website: "" };
    const html = await resp.text();
    const status =
      html.match(
        /text---label-primary[^>]*>\s*Status\s*<\/div>\s*<div class="headline xs">([^<]+)<\/div>/,
      )?.[1]
        ?.replace(/&amp;/g, "&")
        .trim() ?? "";
    const website =
      html.match(
        /<div class="company-logo"><a href="(https?:\/\/[^"]+)"/,
      )?.[1] ?? "";
    return { status, website };
  } catch {
    return { status: "", website: "" };
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${URL}: ${resp.status}`);
  }
  const html = await resp.text();
  const $ = cheerio.load(html);

  interface Entry {
    name: string;
    path: string;
  }
  const entries: Entry[] = [];

  $(".portfolio-company-item.w-dyn-item").each((_, el) => {
    const name = $(el).find('h2[fs-cmsfilter-field="name"]').text().trim();
    if (!name) return;
    const path = $(el).find("a.portfolio-company-link").attr("href") || "";
    entries.push({ name, path });
  });

  const detailByPath = new Map<string, { status: string; website: string }>();
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (e) => ({ path: e.path, detail: await fetchDetail(e.path) })),
    );
    for (const r of results) {
      detailByPath.set(r.path, r.detail);
    }
  }

  const companies: ScrapedCompany[] = entries.map((e) => {
    const detail = detailByPath.get(e.path) ?? { status: "", website: "" };
    return {
      name: e.name,
      // only non-default statuses are informative
      category: detail.status !== "Active" ? detail.status : "",
      url: detail.website || (e.path ? `${BASE_URL}${e.path}` : ""),
    };
  });

  return companies;
}
