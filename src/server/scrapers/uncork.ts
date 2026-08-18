import type { ScrapedCompany } from './types';

const PAGE_URL = "https://uncorkcapital.com/companies";
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

// the "All Companies" wall renders every portfolio name as one of these cms
// items (three copies each, one per responsive layout)
const ITEM_MARKER = 'data-framer-name="company cms item II"';

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // the featured rows above the wall carry a stage badge ("Growth",
  // "Acquired", "Early (A+B)") the wall itself does not repeat
  const badges = new Map<string, string>();
  for (const m of html.matchAll(/<a [^>]*href="\.\/companies\/[a-z0-9-]+"[^>]*>/g)) {
    const row = html.slice(m.index ?? 0, (m.index ?? 0) + 4000);
    const name = text(row.match(/data-framer-name="Numeral"[^>]*>\s*<p[^>]*>([^<]+)<\/p>/)?.[1] ?? "");
    const badge = text(
      row.match(/data-framer-name="(?:Acquired|Status)"[^>]*>\s*<p[^>]*>([^<]+)<\/p>/)?.[1] ?? "",
    );
    if (name && badge && !badges.has(name)) badges.set(name, badge);
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const block of html.split(ITEM_MARKER).slice(1)) {
    const name = text(block.slice(0, 1500).match(/<p[^>]*class="framer-text"[^>]*>([^<]+)<\/p>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);
    companies.push({
      name,
      // the stage as uncork states it, where the featured rows state one;
      // the wall publishes names alone
      category: badges.get(name) ?? "",
      // no company on the page links out to its own site
      url: "",
    });
  }

  if (companies.length === 0) {
    throw new Error("uncork: no companies found in the wall");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("uncork: the featured stage badges moved");
  }

  return companies;
}
