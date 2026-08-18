import type { ScrapedCompany } from './types';

// the portfolio page's own filter endpoint; it answers with every company in
// one page when no filter is set
const API_URL =
  "https://www.viola-group.com/api/portfolio-filter.php?activeexit=&industry=&fund=&search=&per_page=500&page=1";
const PER_PAGE = 500;
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

interface ViolaCompany {
  title?: string;
  activeexit?: string;
  public_title?: string;
  industry?: { name?: string }[] | null;
}

// the exit labels arrive in display shouting with stray colons ("ACQUIRED
// BY:", "PUBLIC:"); tidied here without inventing anything the site doesn't
// state, and an unlabeled exit stays the plain marker
const exitTag = (raw: string): string => {
  const label = text(raw).replace(/:\s*$/, "");
  if (!label) return "Exited";
  const acquired = label.match(/^acquired by:?\s*(.*)$/i);
  if (acquired) return acquired[1] ? `Acquired by ${acquired[1]}` : "Acquired";
  if (/^public$/i.test(label)) return "Public";
  if (/^ipo$/i.test(label)) return "IPO";
  return label;
};

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(API_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
  }
  const rows = (await resp.json()) as ViolaCompany[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("viola: the portfolio API returned nothing");
  }
  if (rows.length >= PER_PAGE) {
    throw new Error(`viola: the API page is full at ${PER_PAGE} — a company is hidden behind it`);
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = text(row.title ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const industries = (row.industry ?? []).map((i) => text(i.name ?? "")).filter(Boolean);
    const exited = row.activeexit === "Exit";

    companies.push({
      name,
      category: [...industries, exited ? exitTag(row.public_title ?? "") : ""]
        .filter(Boolean)
        .join(", "),
      // viola publishes no websites for its companies, on the grid or the
      // profile pages
      url: "",
    });
  }

  if (companies.length === 0) {
    throw new Error("viola: no company was named in the API response");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("viola: the industry and status fields moved");
  }

  return companies;
}
