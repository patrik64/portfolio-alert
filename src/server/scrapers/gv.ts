import type { ScrapedCompany } from './types';

const PAGE_URL = "https://www.gv.com/portfolio";
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

// nuxt serializes its payload as one flat array in which every object value
// is the index of another slot
type Node = null | boolean | number | string | Node[] | { [key: string]: number };

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  const raw = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!raw) {
    throw new Error("gv: the nuxt payload is gone — the page moved");
  }
  const data = JSON.parse(raw) as Node[];
  const at = (i: unknown): Node => (typeof i === "number" ? (data[i] ?? null) : null);

  // the sector documents give the names the companies only hold references to
  const sectorTitles = new Map<string, string>();
  for (const node of data) {
    if (node && typeof node === "object" && !Array.isArray(node) && "_id" in node && "title" in node) {
      const id = at(node._id);
      const title = at(node.title);
      if (typeof id === "string" && typeof title === "string") sectorTitles.set(id, title);
    }
  }

  const sectorOf = (refIndex: unknown): string => {
    const ref = at(refIndex);
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) return "";
    const id = at((ref as { [key: string]: number })._ref);
    return typeof id === "string" ? (sectorTitles.get(id) ?? "") : "";
  };

  const companies: ScrapedCompany[] = [];
  const seen = new Set<string>();
  for (const node of data) {
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    if (!("name" in node) || !("sector" in node)) continue;
    const rawName = at(node.name);
    if (typeof rawName !== "string") continue;

    // a trailing asterisk is gv's unlabeled mark on companies that have been
    // acquired or gone public
    const exited = /\*\s*$/.test(rawName);
    const name = text(rawName.replace(/\s*\*\s*$/, ""));
    if (!name || seen.has(name)) continue;
    seen.add(name);

    companies.push({
      name,
      category: [sectorOf(node.sector), sectorOf(node.secondarySector), exited ? "Exited" : ""]
        .filter(Boolean)
        .join(", "),
      // gv publishes no websites, taglines or links for its companies — the
      // portfolio is a bare list of names
      url: "",
    });
  }

  if (companies.length === 0) {
    throw new Error("gv: no companies found in the nuxt payload");
  }
  if (!companies.some((company) => company.category)) {
    throw new Error("gv: the sector references moved");
  }

  return companies;
}
