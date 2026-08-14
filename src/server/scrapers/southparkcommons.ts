import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.southparkcommons.com";
const PAGE_URL = `${BASE_URL}/companies`;
const SITEMAP_URL = `${BASE_URL}/sitemap-0.xml`;
const BATCH_SIZE = 12;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// the status a company is filed under when south park commons is out of it
const EXITS = new Set(["acquired"]);

interface Company {
  name?: string;
  slug?: string;
  industry?: string;
  founded?: string;
  location?: string;
  status?: string;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

// a handful of the addresses are written as bare domains, which lead nowhere
// as they stand
const website = (raw: string) => {
  const value = clean(raw);
  if (/^https?:\/\//i.test(value)) return value;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value) ? `https://${value}` : "";
};

// the company's own page is the only place the address it lives at is written,
// and it sits under the word the link is labelled with — the page also links to
// the funds that invested alongside
async function websiteOf(slug: string) {
  const html = await fetchPage(`${PAGE_URL}/${slug}`);
  return website(html.match(/<a href="([^"]*)"[^>]*>\s*<span>Website<\/span>/)?.[1] ?? "");
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  // the page paginates in the browser, but it arrives carrying the whole
  // portfolio as json for the grid to draw from
  const raw = html.match(
    /<script type="application\/json" id="company-data"[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  if (!raw) {
    throw new Error("south park commons: the portfolio's company data is no longer on the page");
  }
  const listed = JSON.parse(raw) as Company[];
  if (!Array.isArray(listed) || listed.length === 0) {
    throw new Error("south park commons: the portfolio came back empty");
  }

  // one page per company, and the sitemap lists them all
  const sitemap = await fetchPage(SITEMAP_URL);
  const published = new Set(
    [...sitemap.matchAll(/<loc>https:\/\/www\.southparkcommons\.com\/companies\/([^<]+?)\/?<\/loc>/g)]
      .map((m) => m[1])
      .filter((slug) => slug !== "companies"),
  );
  const slugs = new Set(listed.map((company) => company.slug ?? "").filter(Boolean));
  for (const slug of published) {
    if (!slugs.has(slug)) {
      throw new Error(`south park commons: ${slug} is in the sitemap but not the portfolio`);
    }
  }

  const websites = new Map<string, string>();
  const withPages = [...slugs];
  for (let i = 0; i < withPages.length; i += BATCH_SIZE) {
    const batch = withPages.slice(i, i + BATCH_SIZE);
    const found = await Promise.all(batch.map(websiteOf));
    batch.forEach((slug, j) => websites.set(slug, found[j]));
  }

  const companies = listed
    .map((company) => {
      const name = clean(company.name ?? "");
      const status = clean(company.status ?? "");
      return {
        name,
        category: [
          clean(company.industry ?? ""),
          clean(company.location ?? ""),
          clean(company.founded ?? ""),
          status,
          EXITS.has(status.toLowerCase()) ? "Exited" : "",
        ]
          .filter(Boolean)
          .join(", "),
        url: websites.get(company.slug ?? "") ?? "",
      };
    })
    .filter((company) => company.name);

  if (companies.length === 0) {
    throw new Error("south park commons: no company was named — the records moved");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("south park commons: the companies' industry and status moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("south park commons: the company pages' website links moved");
  }

  return companies;
}
