import type { ScrapedCompany } from './types';

const PAGE_URL = "https://initialized.com/companies";
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

interface Startup {
  attributes?: {
    name?: string;
    websiteUrl?: string;
    isUnicorn?: boolean;
    tags?: { data?: { attributes?: { name?: string } }[] };
  };
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!raw) {
    throw new Error("initialized: the next payload is gone — the page moved");
  }
  const startups: Startup[] =
    JSON.parse(raw)?.props?.pageProps?.startups?.data ?? [];

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const startup of startups) {
    const a = startup.attributes ?? {};
    const name = text(a.name ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const tags = (a.tags?.data ?? [])
      .map((tag) => text(tag.attributes?.name ?? ""))
      .filter(Boolean);
    // "Exit" is one of the site's own tags; it reads best last, and a
    // billion-dollar company carries the fund's unicorn mark
    const exited = tags.includes("Exit");

    companies.push({
      name,
      category: [
        ...tags.filter((tag) => tag !== "Exit"),
        a.isUnicorn ? "Unicorn" : "",
        exited ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: a.websiteUrl ?? "",
    });
  }

  if (companies.length === 0) {
    throw new Error("initialized: no companies found in the payload");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("initialized: the tag data moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("initialized: the companies' website links moved");
  }

  return companies;
}
