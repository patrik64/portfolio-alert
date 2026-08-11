import type { ScrapedCompany } from './types';

const PAGE_URL = "https://acapital.com/portfolio";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const text = (html: string) => html.replace(/<[^>]+>/g, "").trim();

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // the portfolio is a table of Company / Sector / Invested / Website
  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();

  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const body = row[1];
    const name = body.match(/<span class="portfolio-company-name">([^<]*)<\/span>/)?.[1]?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
    const sector = cells[1] ?? "";
    const invested = cells[2] ?? "";
    const url = body.match(/<a href="(https?:\/\/[^"]+)"/)?.[1] ?? "";

    companies.push({
      name,
      category: [sector, invested].filter(Boolean).join(", "),
      url,
    });
  }

  if (companies.length === 0) {
    throw new Error("a capital: no companies found in the portfolio table");
  }

  return companies;
}
