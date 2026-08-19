import type { ScrapedCompany } from './types';

const PAGE_URL = "https://svangel.com/portfolio";
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

interface Investment {
  internalTitle?: string;
  // the field name's typo is the site's own
  investimentStage?: string[];
  sector?: string[];
  url?: string;
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!raw) {
    throw new Error("svangel: the next payload is gone — the page moved");
  }
  const investments: Investment[] =
    JSON.parse(raw)?.props?.pageProps?.data?.investmentsListCollection?.items ?? [];

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const investment of investments) {
    const name = text(investment.internalTitle ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // sectors first, then the fund's stage tag(s) — Seed and/or Growth
    const sectors = (investment.sector ?? []).map(text).filter(Boolean);
    const stages = (investment.investimentStage ?? []).map(text).filter(Boolean);

    companies.push({
      name,
      category: [...sectors, ...stages].join(", "),
      url: investment.url ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("svangel: no companies found in the payload");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("svangel: the sector and stage data moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("svangel: the companies' website links moved");
  }

  return companies;
}
