import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.aleph.vc/companies";
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

const CARD_MARKER = 'role="listitem" class="company_item w-dyn-item"';

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const cards = html.split(CARD_MARKER).slice(1);
  if (cards.length === 0) {
    throw new Error("aleph: no companies found in the listing");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    // each card carries a hidden data block the finsweet filter reads from
    const field = (name: string) =>
      text(card.match(new RegExp(`data-filter="${name}"[^>]*>([^<]*)<`))?.[1] ?? "");
    const name = field("name");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // "category" is the sector; a couple of cards leave it at the filter's
    // catch-all "All", which classifies nothing
    const sector = field("category");
    const vertical = field("vertical");

    companies.push({
      name,
      category: [sector === "All" ? "" : sector, vertical].filter(Boolean).join(", "),
      // aleph links companies to no outbound site — the card is name, founders
      // and a blurb
      url: "",
    });
  }

  if (companies.length === 0) {
    throw new Error("aleph: no company was named — the card data moved");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("aleph: the category and vertical fields moved");
  }

  return companies;
}
