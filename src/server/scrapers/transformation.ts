import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const BASE_URL = "https://transformcap.com";
const URL = `${BASE_URL}/partner-companies`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 20;

// the site publishes no sector taxonomy anywhere; the only per-company facts
// are the year of investment, the status and the website
function labelled(html: string, label: string): string {
  return (
    html
      .match(
        new RegExp(
          `text---label-primary[^>]*>\\s*${label}\\s*</div>\\s*<div class="headline xs">([^<]+)</div>`,
        ),
      )?.[1]
      ?.replace(/&amp;/g, "&")
      .trim() ?? ""
  );
}

async function fetchDetail(
  path: string,
): Promise<{ year: string; status: string; website: string }> {
  try {
    const resp = await fetch(`${BASE_URL}${path}`, { headers: { "User-Agent": UA } });
    if (!resp.ok) return { year: "", status: "", website: "" };
    const html = await resp.text();
    const website =
      html.match(
        /<div class="company-logo"><a href="(https?:\/\/[^"]+)"/,
      )?.[1] ?? "";
    return {
      year: labelled(html, "Year partnered"),
      status: labelled(html, "Status"),
      website,
    };
  } catch {
    return { year: "", status: "", website: "" };
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

  const detailByPath = new Map<string, { year: string; status: string; website: string }>();
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
    const detail = detailByPath.get(e.path) ?? { year: "", status: "", website: "" };
    return {
      name: e.name,
      // "Active" is the default state and carries no signal, unlike the exits
      category: [detail.year, detail.status !== "Active" ? detail.status : ""]
        .filter(Boolean)
        .join(", "),
      url: detail.website || (e.path ? `${BASE_URL}${e.path}` : ""),
    };
  });

  return companies;
}
