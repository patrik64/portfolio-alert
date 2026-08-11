import type { ScrapedCompany } from './types';

// The portfolio on baincapitalventures.com is served from a public Sanity
// dataset (project id visible in the site's asset URLs); one GROQ query
// returns every company with its domain (sector) references resolved.
const QUERY =
  '*[_type=="portfolio"]|order(title asc){title, company_website, "domains": domains[]->title}';
const API_URL = `https://0ystv7v4.apicdn.sanity.io/v2023-01-01/data/query/production?query=${encodeURIComponent(QUERY)}`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface PortfolioDoc {
  title?: string;
  company_website?: string;
  domains?: (string | null)[] | null;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(API_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
  }

  const data: { result: PortfolioDoc[] } = await resp.json();

  const companies: ScrapedCompany[] = data.result
    .filter((doc) => doc.title)
    .map((doc) => ({
      name: doc.title!,
      category: (doc.domains ?? []).filter(Boolean).join(", "),
      url: doc.company_website ?? "",
    }));

  return companies;
}
