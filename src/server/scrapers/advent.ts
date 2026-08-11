import * as cheerio from 'cheerio';
import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.adventinternational.com/investments/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PER_PAGE = 10; // fixed by the site's directory
const MAX_PAGES = 200; // safety stop
// adventinternational.com answers 429 when its ~45 pages are walked back to
// back, so pace the requests and back off hard when it does
const PAGE_DELAY_MS = 400;
const RATE_LIMIT_BACKOFF_MS = 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(page: number, attempt = 1): Promise<string> {
  const url = page === 1 ? BASE_URL : `${BASE_URL}?sf_paged=${page}`;
  try {
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get("retry-after")) * 1000;
      throw Object.assign(new Error("429"), {
        waitMs: retryAfter > 0 ? retryAfter : RATE_LIMIT_BACKOFF_MS * attempt,
      });
    }
    if (!resp.ok) throw new Error(`${resp.status}`);
    return await resp.text();
  } catch (err) {
    // a transient failure must not silently truncate the directory
    if (attempt < 5) {
      const waitMs =
        typeof err === "object" && err !== null && "waitMs" in err
          ? (err as { waitMs: number }).waitMs
          : 1000 * attempt;
      await sleep(waitMs);
      return fetchPage(page, attempt + 1);
    }
    throw new Error(
      `Failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  let total = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchPage(page);
    const $ = cheerio.load(html);

    // the directory reports its size as "Results 1-10 of 449"
    if (page === 1) {
      total = Number(html.match(/Results\s+\d+[-–]\d+\s+of\s+(\d+)/i)?.[1] ?? 0);
    }

    const cards = $("article.c-card-investment-directory");
    if (cards.length === 0) break;

    cards.each((_, el) => {
      const name = $(el).find("h3").first().text().trim();
      if (!name || seen.has(name)) return;
      seen.add(name);

      // Sector from class (e.g. sector_tax-healthcare)
      const classes = $(el).attr("class") || "";
      const sectorMatch = classes.match(/sector_tax-([a-z-]+)/);
      const category = sectorMatch
        ? sectorMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "";

      // Company website from "Visit company website" link (older exited
      // investments have no links block at all)
      let companyUrl = "";
      $(el).find(".c-card-investment-directory__links a").each((_, a) => {
        if ($(a).text().trim().toLowerCase().includes("visit company")) {
          companyUrl = $(a).attr("href") || "";
        }
      });

      companies.push({ name, category, url: companyUrl });
    });

    if (total > 0 && page * PER_PAGE >= total) break;
    await sleep(PAGE_DELAY_MS);
  }

  // fail loudly rather than importing a partial directory, which would make
  // the missing companies reappear as newcomers on a later run
  if (total > 0 && companies.length < total * 0.95) {
    throw new Error(
      `Advent directory incomplete: got ${companies.length} of ${total} investments`,
    );
  }

  return companies;
}
