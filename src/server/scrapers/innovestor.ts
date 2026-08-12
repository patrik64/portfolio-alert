import type { ScrapedCompany } from './types';

const BASE_URL = "https://innovestorgroup.com";
const PAGE_URL = `${BASE_URL}/venture-capital/portfolio-companies/`;
// the accordion renders the portfolio post type, which reports its own count
const COUNT_URL = `${BASE_URL}/wp-json/wp/v2/portfolio?per_page=1`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&#x27;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&nbsp;|\u00a0|\u200b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// the segment lives in the class list the page's own filters key on; the finer
// sector is a labelled field only two thirds of the companies fill in
const SEGMENTS: Record<string, string> = {
  technology: "Technology",
  "health-life-science": "Health & Life Science",
};

// sectors are typed by hand per company, so the same one shows up bare and
// prefixed with its segment ("Health & Life Science: Medtech")
function stripSegment(sector: string) {
  for (const segment of Object.values(SEGMENTS)) {
    const prefix = `${segment}:`;
    if (sector.toLowerCase().startsWith(prefix.toLowerCase())) {
      return sector.slice(prefix.length).trim();
    }
  }
  return sector;
}

interface Entry {
  name: string;
  sector: string;
  geo: string;
  exited: boolean;
  url: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const entries: Entry[] = [];
  const seen = new Set<string>();

  // the whole portfolio is one accordion, each company a labelled block of
  // fields under its own heading
  for (const item of html.split('<div class="portfolio-item ').slice(1)) {
    const classes = item.slice(0, item.indexOf('">')).trim().split(/\s+/);
    const name = text(item.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const field = (label: string) =>
      text(item.match(new RegExp(`<h6>${label}</h6>\\s*<p>([\\s\\S]*?)</p>`))?.[1] ?? "");

    const segment = classes.map((c) => SEGMENTS[c]).find(Boolean) ?? "";
    entries.push({
      name,
      sector: stripSegment(field("Sector / Category")) || segment,
      geo: field("Geo"),
      exited: classes.includes("exited"),
      // companies without a live site get an en dash instead of a link
      url: item.match(/<h6>Website<\/h6>\s*<p>\s*<a[^>]*href="([^"]+)"/)?.[1] ?? "",
    });
  }

  if (entries.length === 0) {
    throw new Error("innovestor: no companies found in the portfolio accordion");
  }

  // the same sector also turns up in different casings ("Digital health");
  // settle on the spelling used most often
  const spellings = new Map<string, Map<string, number>>();
  for (const { sector } of entries) {
    if (!sector) continue;
    const key = sector.toLowerCase();
    const variants = spellings.get(key) ?? new Map<string, number>();
    variants.set(sector, (variants.get(sector) ?? 0) + 1);
    spellings.set(key, variants);
  }
  const canonicalSector = new Map(
    [...spellings].map(([key, variants]) => [key, [...variants].sort((a, b) => b[1] - a[1])[0][0]]),
  );

  const companies: ScrapedCompany[] = entries.map((entry) => ({
    name: entry.name,
    category: [
      canonicalSector.get(entry.sector.toLowerCase()) ?? entry.sector,
      entry.geo,
      entry.exited ? "Exited" : "",
    ]
      .filter(Boolean)
      .join(", "),
    url: entry.url,
  }));

  // the page is a single render with no pagination, so a short list means the
  // markup moved rather than the portfolio shrinking
  const countResp = await fetch(COUNT_URL, { headers: { "User-Agent": UA } });
  if (countResp.ok) {
    const total = Number(countResp.headers.get("x-wp-total") ?? 0);
    if (total > 0 && companies.length < total * 0.95) {
      throw new Error(
        `Innovestor portfolio incomplete: page listed ${companies.length} of ${total} companies`,
      );
    }
  }

  return companies;
}
