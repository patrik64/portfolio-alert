import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.invus.com/invus-opportunities/";
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

  // every company is a server-rendered button whose data attributes carry the
  // whole record; the nine featured buttons repeat companies from the grid,
  // so the first record for a name wins
  const buttons = [...html.matchAll(/<button ([^>]*class="company-btn[^"]*"[^>]*)>/g)];
  if (buttons.length === 0) {
    throw new Error("invus: no company buttons found in the portfolio");
  }

  const byName = new Map<string, ScrapedCompany>();
  for (const [, attrs] of buttons) {
    const attr = (key: string) => text(attrs.match(new RegExp(`${key}="([^"]*)"`))?.[1] ?? "");
    const name = attr("data-name");
    if (!name || byName.has(name)) continue;

    const industries = attr("data-industry")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const region = attr("data-region");
    const exited = attr("data-status") === "Exited";

    byName.set(name, {
      name,
      category: [...industries, region, exited ? "Exited" : ""].filter(Boolean).join(", "),
      url: attrs.match(/data-linkbtn-link="(https?:\/\/[^"]+)"/)?.[1] ?? "",
    });
  }

  const companies = [...byName.values()];
  if (companies.length === 0) {
    throw new Error("invus: no company was named — the buttons moved");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("invus: the industry and region markers moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("invus: the companies' website links moved");
  }

  return companies;
}
