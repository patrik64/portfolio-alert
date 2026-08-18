import type { ScrapedCompany } from './types';

const PAGE_URL = "https://earlybird.com/companies";
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

// each company card opens with a "Filter" block holding its status, stage and
// location as labeled fields; the name is the framer-text paragraph rendered
// just before it
const FILTER_MARKER = 'data-framer-name="Filter"';

const fieldAfter = (block: string, field: string): string => {
  const m = block.match(
    new RegExp(`data-framer-name="${field}"[\\s\\S]{0,700}?>([^<>]{1,60})</p>`),
  );
  return text(m?.[1] ?? "");
};

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const segments = html.split(FILTER_MARKER);
  if (segments.length < 2) {
    throw new Error("earlybird: no company cards found — the framer layout moved");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < segments.length; i++) {
    // the name is the last framer-text paragraph before this card's filter
    const before = [...segments[i - 1].matchAll(/<p class="framer-text[^"]*"[^>]*>([^<]+)<\/p>/g)];
    const name = text(before.at(-1)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const card = segments[i];
    const stage = fieldAfter(card, "Stage");
    const location = fieldAfter(card, "Location");
    // earlybird marks each company "Active" or "Exit"
    const exited = fieldAfter(card, "Status") === "Exit";

    companies.push({
      name,
      category: [stage, location, exited ? "Exited" : ""].filter(Boolean).join(", "),
      // the site links companies only to framer profile pages, with no
      // outbound website and no name in the static markup, so no url is kept
      url: "",
    });
  }

  if (companies.length === 0) {
    throw new Error("earlybird: no company was named — the card layout moved");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("earlybird: the stage and status fields moved");
  }

  return companies;
}
