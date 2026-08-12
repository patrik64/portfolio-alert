import type { ScrapedCompany } from './types';

const BASE_URL = "https://www.mig.ag";
const PAGE_URL = `${BASE_URL}/en/portfolio/`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 250;
// the taxonomy behind the status and sector filters (their spelling)
const TERM_PREFIX = "cases-sepcialist-";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#039;|&#39;|&#x27;/g, "'")
    .trim();

const slugify = (s: string) =>
  decode(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// the case page titles read "AdvanceCOR – MIG Capital"
async function fetchDetail(
  url: string,
  attempt = 1,
): Promise<{ name: string; website: string }> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`${resp.status}`);
    const html = await resp.text();
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    const name = decode(title).split(/–|\|/)[0].trim();
    const website =
      [...html.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"/g)]
        .map((m) => m[1])
        .find(
          (href) =>
            !/mig\.ag|linkedin|twitter|x\.com|facebook|youtube|instagram|google/i.test(href),
        ) ?? "";
    return { name, website };
  } catch {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return fetchDetail(url, attempt + 1);
    }
    return { name: "", website: "" };
  }
}

export async function scrape(): Promise<ScrapedCompany[]> {
  const resp = await fetch(PAGE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${PAGE_URL}: ${resp.status}`);
  }
  const html = await resp.text();

  // the filter list carries the display label for every taxonomy slug
  const labels = new Map<string, string>();
  for (const m of html.matchAll(/data-label="([^"]+)"/g)) {
    const label = decode(m[1]);
    if (label && label.toLowerCase() !== "show all") labels.set(slugify(label), label);
  }

  interface Entry {
    url: string;
    sectors: string[];
    exited: boolean;
  }
  const entries: Entry[] = [];
  const seen = new Set<string>();

  // each grid item is a link to the company's case page, with its taxonomy
  // terms in the item's class list
  for (const m of html.matchAll(
    /class="([^"]*e-loop-item[^"]*)"[\s\S]{0,4000}?href="(https:\/\/www\.mig\.ag\/en\/cases\/[^"]+)"/g,
  )) {
    const url = m[2];
    if (seen.has(url)) continue;
    seen.add(url);

    const terms = m[1]
      .split(/\s+/)
      .filter((c) => c.startsWith(TERM_PREFIX))
      .map((c) => c.slice(TERM_PREFIX.length));

    entries.push({
      url,
      // "active" is the default state; only exits are worth recording
      sectors: terms.filter((t) => t !== "active" && t !== "exited"),
      exited: terms.includes("exited"),
    });
  }

  if (entries.length === 0) {
    throw new Error("mig: no companies found in the portfolio grid");
  }

  const detailByUrl = new Map<string, { name: string; website: string }>();
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (e) => ({ url: e.url, detail: await fetchDetail(e.url) })),
    );
    for (const r of results) {
      detailByUrl.set(r.url, r.detail);
    }
    await sleep(BATCH_DELAY_MS);
  }

  const companies: ScrapedCompany[] = [];
  for (const entry of entries) {
    const detail = detailByUrl.get(entry.url) ?? { name: "", website: "" };
    if (!detail.name) continue;
    companies.push({
      name: detail.name,
      category: [
        ...entry.sectors.map((s) => labels.get(s) ?? s),
        entry.exited ? "Exited" : "",
      ]
        .filter(Boolean)
        .join(", "),
      url: detail.website || entry.url,
    });
  }

  return companies;
}
