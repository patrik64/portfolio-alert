import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.lifelineventures.com/companies/";
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

  // the sector filter above the grid spells out the labels the cards only
  // carry as slugs ("b2b-saas" is shown as "B2B SAAS")
  const labels = new Map<string, string>();
  for (const m of html.matchAll(/data-sector="([^"]+)">([^<]+)<\/a>/g)) {
    if (m[1] !== "all") labels.set(m[1], text(m[2]));
  }
  if (labels.size === 0) {
    throw new Error("lifeline: the sector filter moved");
  }

  const cards = html.split('<div class="companies__item"').slice(1);
  if (cards.length === 0) {
    throw new Error("lifeline: no companies found in the listing");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const attrs = card.slice(0, card.indexOf(">"));
    const name = text(attrs.match(/data-company="([^"]*)"/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const sectorSlug = attrs.match(/data-sector="([^"]*)"/)?.[1] ?? "";
    const exited = /data-status="exited"/.test(attrs);

    companies.push({
      name,
      category: [labels.get(sectorSlug) ?? "", exited ? "Exited" : ""].filter(Boolean).join(", "),
      url: card.match(/<a href="(https?:\/\/[^"]+)"[^>]*class="external-link"/)?.[1] ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("lifeline: no company was named — the cards moved");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("lifeline: the sector and status markers moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("lifeline: the companies' website links moved");
  }

  return companies;
}
