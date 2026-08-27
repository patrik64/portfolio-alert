import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const PAGE_URL = "https://lsvp.com/companies/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// lsvp.com drops requests under aggressive parallel fetching — keep batches
// small, pause between them, and retry failures with backoff
const BATCH_SIZE = 16;
const BATCH_DELAY_MS = 150;
// the fetch has four minutes before the app calls it off; on a slow night the
// remaining detail pages are abandoned in time to return what's been gathered,
// costing nothing but the website links of that night's newcomers
const DETAIL_BUDGET_MS = 150_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// each detail page links the company website as <a id="company_url">
async function fetchWebsite(detailUrl: string, attempt = 1): Promise<string> {
  try {
    const resp = await fetch(detailUrl, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const html = await resp.text();
    return cheerio.load(html)("#company_url").attr("href") || "";
  } catch {
    if (attempt < 2) {
      await sleep(500);
      return fetchWebsite(detailUrl, attempt + 1);
    }
    return "";
  }
}

// without the listing there is nothing to scrape, so it alone is worth
// waiting out a rate-limit for
async function fetchListing(): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
      if (!resp.ok) throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
      return await resp.text();
    } catch (err) {
      lastError = err;
      if (attempt < 3) await sleep(5000 * attempt);
    }
  }
  throw lastError;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchListing();
  const $ = cheerio.load(html);

  // Collect company names, detail page URLs and status from the listing
  const entries: { name: string; detailUrl: string; status: string }[] = [];
  $(".companies-list li[data-company-id]").each((_, el) => {
    const h5 = $(el).find("h5").clone();
    h5.find("span").remove(); // remove disclaimer spans inside h5
    const name = h5.text().trim();
    const detailUrl = $(el).find("a").first().attr("href") || "";

    let status = "";
    $(el)
      .find(".company-info-list li")
      .each((_, row) => {
        if ($(row).find("strong").text().trim() === "Status") {
          status = $(row).find("span").text().trim();
        }
      });

    if (name && detailUrl) entries.push({ name, detailUrl, status });
  });

  if (entries.length === 0) {
    throw new Error("lightspeed: no companies found — the listing markup moved");
  }

  const started = Date.now();
  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const outOfTime = Date.now() - started > DETAIL_BUDGET_MS;
    const results = await Promise.all(
      batch.map(async (entry) => ({
        name: entry.name,
        // "Private" is the default state and carries no signal
        category: entry.status !== "Private" ? entry.status : "",
        url: outOfTime ? "" : await fetchWebsite(entry.detailUrl),
      })),
    );
    companies.push(...results);
    if (!outOfTime) await sleep(BATCH_DELAY_MS);
  }

  return companies;
}
