import type { ScrapedCompany } from './types';

// the portfolio page is a nuxt app over a public sanity dataset. its initial
// payload projects the company documents down to bare names and sector
// references — the websites only travel when a drawer is clicked open — so
// the scrape queries the same dataset the page reads, asking for everything
// at once
const QUERY =
  '*[_type == "company"]{name, website, "sector": sector->title, "secondarySector": secondarySector->title}';
const API_URL = `https://v5ygm6ip.apicdn.sanity.io/v2021-10-21/data/query/production?query=${encodeURIComponent(QUERY)}`;
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

interface Company {
  name?: string;
  website?: string | null;
  sector?: string | null;
  secondarySector?: string | null;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(API_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${API_URL}: ${resp.status}`);
  }
  const records: Company[] = (await resp.json())?.result ?? [];

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const rawName = record.name ?? "";

    // a trailing asterisk is gv's unlabeled mark on companies that have been
    // acquired or gone public
    const exited = /\*\s*$/.test(rawName.trimEnd());
    const name = text(rawName.replace(/\s*\*\s*$/, ""));
    if (!name || seen.has(name)) continue;
    seen.add(name);

    companies.push({
      name,
      category: [text(record.sector ?? ""), text(record.secondarySector ?? ""), exited ? "Exited" : ""]
        .filter(Boolean)
        .join(", "),
      url: record.website ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("gv: no companies came back from the sanity query");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("gv: the sector titles moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("gv: the company websites moved");
  }

  return companies;
}
