import type { ScrapedCompany } from './types';

// the portfolio page's own list endpoint; the only place nea publishes a
// company's website is its profile page, and fetching all ~900 of those
// would outlast the scrape budget, so companies carry no url here
const API_URL = "https://www.nea.com/api/portfolio/companies";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (whole, dec, hex, named) => {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return NAMED[String(named).toLowerCase()] ?? whole;
  });

const text = (s: string) =>
  decode(s.replace(/<[^>]+>/g, " "))
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface NeaCompany {
  title?: string;
  status?: string;
  company_status_value?: { label?: string } | null;
  company_category?: { title?: string }[] | null;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(API_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
  }
  const rows = ((await resp.json()) as { companies?: NeaCompany[] }).companies ?? [];

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.status && row.status !== "published") continue;
    const name = text(row.title ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const categories = (row.company_category ?? [])
      .map((category) => text(category.title ?? ""))
      .filter(Boolean);
    // "Acquired", "IPO/Public" and "IPO/Acquired" are milestones as nea
    // states them; "Private" and "Unset" mark nothing
    const status = text(row.company_status_value?.label ?? "");
    const milestone = status === "Private" || status === "Unset" ? "" : status;

    companies.push({
      name,
      category: [...categories, milestone].filter(Boolean).join(", "),
      url: "",
    });
  }

  if (companies.length === 0) {
    throw new Error("nea: the company API returned nothing");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("nea: the category and status labels moved");
  }

  return companies;
}
