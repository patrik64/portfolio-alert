import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.usv.com/companies/";
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

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  // every company renders twice, as a desktop table row and a condensed
  // mobile one; only the desktop half carries the link and the exit note
  for (const raw of html.split('<div class="m__list-row ').slice(1)) {
    if (raw.startsWith("m__list-row--mobile")) continue;
    const row = raw.split("m__list-row--mobile")[0];
    const cols = row.split('<div class="m__list-row__col">');
    if (cols.length < 3) continue;

    // the name column: a link for a live site, bare text for one without
    const head = cols[2];
    const linked = head.match(/<a href="(https?:\/\/[^"]+)" target="_blank">([\s\S]*?)<\/a>/);
    const name = linked ? text(linked[2]) : text(head.split('<span class="exit-detail">')[0]);
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // "Acquired by Twitter" and "NYSE: NET" are milestones as usv states
    // them — not a claim that the fund is out
    const exitNote = text(head.match(/<span class="exit-detail">([\s\S]*?)<\/span>/)?.[1] ?? "");
    const stage = text(cols[3]?.split("</div>")[0] ?? "");

    companies.push({
      name,
      category: [stage, exitNote].filter(Boolean).join(", "),
      url: linked?.[1] ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("usv: no companies found in the table");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("usv: the investment and exit columns moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("usv: the companies' website links moved");
  }

  return companies;
}
