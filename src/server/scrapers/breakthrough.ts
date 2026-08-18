import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.breakthroughenergy.org/portfolio/index.html";
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

// the page embeds its cms records wholesale; every company arrives as an
// elements/system pair whose title opens the block
const BLOCK_MARKER = /\{"elements":\{"title":\{"name":"title","type":"text","value":"/;

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const block of html.split(BLOCK_MARKER).slice(1).map((b) => b.slice(0, 6000))) {
    // the same records also describe articles; only company documents count
    if (!block.includes('"type":"company"')) continue;
    const name = text(block.slice(0, block.indexOf('"')));
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // the taxonomy pairs carry the sector ("electricity") and the
    // technology ("wind turbines"), as breakthrough labels them
    const tags = [...block.matchAll(/\{"name":"([^"]+)","codename":"[^"]+"\}/g)]
      .map((m) => text(m[1]))
      .filter(Boolean);

    companies.push({
      name,
      category: [...new Set(tags)].join(", "),
      url: text(block.match(/"url":\{"name":"url","type":"text","value":"([^"]*)"/)?.[1] ?? ""),
    });
  }

  if (companies.length === 0) {
    throw new Error("breakthrough: no companies found in the cms payload");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("breakthrough: the taxonomy tags moved");
  }
  if (!companies.some((company) => company.url)) {
    throw new Error("breakthrough: the companies' website links moved");
  }

  return companies;
}
