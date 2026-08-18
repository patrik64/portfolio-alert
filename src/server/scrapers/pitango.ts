import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.pitango.com/portfolio/";
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

// "ipo" and "acquired" are milestones as pitango's badges state them
const STATUS_LABEL: Record<string, string> = { ipo: "IPO", acquired: "Acquired" };

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // the filter checkboxes spell out the labels the cards carry as slugs
  // ("fintech-insure-tech" is shown as "Fintech & Insure Tech")
  const labels = new Map<string, string>();
  for (const m of html.matchAll(
    /data-filter-type="domain"[^>]*data-filter-value="([^"]+)"[\s\S]{0,300}?<span[^>]*>([^<]+)</g,
  )) {
    labels.set(m[1], text(m[2]));
  }
  if (labels.size === 0) {
    throw new Error("pitango: the domain filter moved");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  // every company is a card whose data attributes carry the record; the
  // display name rides on the logo's alt text
  for (const m of html.matchAll(/<div\s+class="[^"]*\bcompany-card"([^>]*)>/g)) {
    const attrs = m[1];
    const slug = attrs.match(/data-slug="([^"]*)"/)?.[1] ?? "";
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const name = text(
      html.slice(m.index ?? 0, (m.index ?? 0) + 900).match(/<img[^>]*alt="([^"]*)"/)?.[1] ?? "",
    );
    if (!name) continue;

    const domains = [
      ...(attrs.match(/data-domains='([^']*)'/)?.[1] ?? "").matchAll(/"([a-z0-9-]+)"/g),
    ]
      .map((d) => labels.get(d[1]) ?? "")
      .filter(Boolean);
    const status = STATUS_LABEL[attrs.match(/data-status="([^"]*)"/)?.[1] ?? ""] ?? "";

    companies.push({
      name,
      category: [...domains, status].filter(Boolean).join(", "),
      // pitango publishes no websites for its companies, on the grid or the
      // company pages
      url: "",
    });
  }

  if (companies.length === 0) {
    throw new Error("pitango: no companies found in the grid");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("pitango: the domain and status markers moved");
  }

  return companies;
}
