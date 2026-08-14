import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.wellington.com";
const PAGE_URL = `${BASE_URL}/en/capabilities/private-investing/our-investments`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const NAMED: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
};

// the cards carry their data as json inside an attribute, so the entities are
// undone in one pass — a second pass would turn "&amp;#34;" into a quote
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

// "consumer-staples" -> "Consumer staples", for a tag the filter doesn't name
const derive = (slug: string) => {
  const words = slug.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

interface Element {
  "xdm:title"?: string;
  "xdm:text"?: string | null;
}

async function fetchPage(url: string) {
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  }
  return resp.text();
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const html = await fetchPage(PAGE_URL);

  // the filters are where wellington writes each tag out in full
  const labels = new Map<string, string>();
  for (const option of html.matchAll(
    /<input type="checkbox"[^>]*value="([^"]*)"\s*\/>\s*<label[^>]*>([\s\S]*?)<\/label>/g,
  )) {
    const label = text(option[2]);
    if (option[1] && label) labels.set(option[1], label);
  }

  const cards = [
    ...html.matchAll(
      /data-cmp-contentfragment-model="onewellington\/models\/company-card" data-cmp-data-layer="([^"]*)"/g,
    ),
  ];
  if (cards.length === 0) {
    throw new Error("wellington: no companies found in the investments grid");
  }

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const layer = JSON.parse(decode(card[1])) as Record<
      string,
      { "dc:title"?: string; elements?: Element[] }
    >;
    const entry = Object.values(layer)[0] ?? {};
    const fields = new Map<string, string>();
    for (const element of entry.elements ?? []) {
      const field = element["xdm:title"] ?? "";
      if (field && !fields.has(field)) fields.set(field, element["xdm:text"] ?? "");
    }

    const name = text(entry["dc:title"] ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);

    // the tags are taxonomy paths, and a couple of the sectors are filed one
    // level deeper than the rest, so the tag is the last step of the path
    const tag = (field: string) => {
      const slug = (fields.get(field) ?? "").split("/").pop() ?? "";
      return slug ? (labels.get(slug) ?? derive(slug)) : "";
    };
    const sector = tag("Sector:");
    // "Unrealized" is a company wellington still holds, and so is one that has
    // since gone public — only a realized investment is one it is out of
    const status = tag("Realization Status:");
    const realized = /^realized$/i.test(status);

    companies.push({
      name,
      category: [sector, status === "Unrealized" ? "" : status, realized ? "Exited" : ""]
        .filter(Boolean)
        .join(", "),
      // a handful of companies carry their address only in the card's link
      url:
        (fields.get("Company URL") ?? "").trim() ||
        (fields.get("Company CTA") ?? "").match(/href="(https?:\/\/[^"]+)"/)?.[1] ||
        "",
    });
  }

  if (companies.length !== cards.length) {
    throw new Error(
      `wellington: read ${companies.length} of the ${cards.length} cards on the page`,
    );
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("wellington: the cards' sector and status tags moved");
  }

  return companies;
}
