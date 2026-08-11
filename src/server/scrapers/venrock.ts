import type { ScrapedCompany } from './types';

const BASE_API = "https://www.venrock.com/wp-json/wp/v2";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface Investment {
  title: { rendered: string };
  link?: string;
  acf?: {
    sector?: string;
    website?: string;
    investment_status?: string;
    stock_exchange?: string;
    ticker_symbol?: string;
    acquired_by?: string;
    merged_with?: string;
  };
}

// long-exited companies have no website of their own; their outcome is the
// useful signal instead
function outcome(acf: NonNullable<Investment["acf"]>): string {
  if (acf.acquired_by) return `Acquired by ${acf.acquired_by}`;
  if (acf.merged_with) return `Merged with ${acf.merged_with}`;
  if (acf.investment_status === "Public") {
    const ticker = [acf.stock_exchange, acf.ticker_symbol].filter(Boolean).join(": ");
    return ticker || "Public";
  }
  // "Private" is the default state and carries no signal
  return acf.investment_status && acf.investment_status !== "Private"
    ? acf.investment_status
    : "";
}

export async function scrape(): Promise<ScrapedCompany[]> {
  // Fetch all companies via WP REST API (paginated, 100 per page)
  const companies: ScrapedCompany[] = [];
  let page = 1;

  while (true) {
    const resp = await fetch(
      `${BASE_API}/investment?per_page=100&page=${page}&acf_format=standard&_fields=id,title,link,acf`,
      { headers: { "User-Agent": UA } },
    );
    if (resp.status === 400) break;

    const data: Investment[] = await resp.json();
    if (data.length === 0) break;

    for (const item of data) {
      const acf = item.acf ?? {};
      const name = item.title.rendered;
      const category = [acf.sector, outcome(acf)].filter(Boolean).join(", ");

      companies.push({
        name,
        category,
        // fall back to Venrock's own company page so every entry links somewhere
        url: acf.website || item.link || "",
      });
    }

    page++;
  }

  return companies;
}
