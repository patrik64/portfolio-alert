import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.83north.com/companies/";
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

  // each card tags itself with taxonomy codes ("t28"); the filter checkboxes
  // spell out what the sector codes mean, so a new sector self-heals
  const labels = new Map<string, string>();
  for (const m of html.matchAll(/name="domain" value="(t\d+)"\s*\/>\s*<span>([^<]+)<\/span>/g)) {
    labels.set(m[1], text(m[2]));
  }
  if (labels.size === 0) {
    throw new Error("83north: the domain filter moved");
  }

  const cards = html.split(/<div id="item\d+" class="item focusable ([^"]*)">/);
  // split yields [pre, classes, body, classes, body, …]
  if (cards.length < 3) {
    throw new Error("83north: no companies found in the listing");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < cards.length; i += 2) {
    const codes = cards[i].split(/\s+/);
    const body = cards[i + 1];
    const name = text(body.match(/<h2>([\s\S]*?)<\/h2>/)?.[1] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const sectors = codes.map((code) => labels.get(code) ?? "").filter(Boolean);
    // t9 is the "Exited" status code; the note beside it, when present, states
    // the exit as 83north tells it ("Acquired by Google in 2020")
    const exited = codes.includes("t9");
    const statusNote = text(body.match(/class="status"><span>([\s\S]*?)<\/span>/)?.[1] ?? "");

    companies.push({
      name,
      category: [...sectors, statusNote || (exited ? "Exited" : "")].filter(Boolean).join(", "),
      url: body.match(/class="website"><a href="(https?:\/\/[^"]+)"/)?.[1] ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("83north: no company was named — the card layout moved");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("83north: the sector and status markers moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("83north: the companies' website links moved");
  }

  return companies;
}
