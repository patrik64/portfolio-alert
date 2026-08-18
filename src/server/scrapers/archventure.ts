import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.archventure.com/portfolio/";
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

  const cards = html.split('<div class="company">').slice(1);
  if (cards.length === 0) {
    throw new Error("arch: no companies found in the portfolio list");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const rawName = text(card.match(/co-title">\s*([\s\S]*?)<\/div>/)?.[1] ?? "");
    // an acquisition is stated as a suffix on the name itself
    const acquired = /\(acquired\)/i.test(rawName);
    const name = rawName.replace(/\s*\(acquired\)\s*$/i, "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // "Boston, MA | NASDAQ: MASS" — the seat of the company, and the ticker
    // once it trades publicly, kept as arch states them
    const location = text(card.match(/co-location">\s*([\s\S]*?)<\/div>/)?.[1] ?? "");
    const [seat, ticker] = location.split("|").map((part) => part.trim());

    companies.push({
      name,
      category: [seat ?? "", ticker ?? "", acquired ? "Acquired" : ""].filter(Boolean).join(", "),
      url: card.match(/co-logo">\s*<a[^>]*href="(https?:\/\/[^"]+)"/)?.[1] ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("arch: no company was named — the card layout moved");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("arch: the location and ticker markers moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("arch: the companies' website links moved");
  }

  return companies;
}
