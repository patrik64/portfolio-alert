import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const PAGE_URL = "https://lsvp.com/companies/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
// lsvp.com drops requests under aggressive parallel fetching — keep batches
// small, pause between them, and retry failures with backoff
const BATCH_SIZE = 12;
const BATCH_DELAY_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// each detail page links the company website as <a id="company_url">
async function fetchWebsite(detailUrl: string, attempt = 1): Promise<string> {
  try {
    const resp = await fetch(detailUrl, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const html = await resp.text();
    return cheerio.load(html)("#company_url").attr("href") || "";
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return fetchWebsite(detailUrl, attempt + 1);
    }
    return "";
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();
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

  const companies: ScrapedCompany[] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (entry) => ({
        name: entry.name,
        // "Private" is the default state and carries no signal
        category: entry.status !== "Private" ? entry.status : "",
        url: await fetchWebsite(entry.detailUrl),
      })),
    );
    companies.push(...results);
    await sleep(BATCH_DELAY_MS);
  }

  return companies;
}
